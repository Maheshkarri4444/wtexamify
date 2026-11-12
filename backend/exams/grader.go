package exams

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// After an external attempt is submitted, any code the student didn't run in
// its final form still needs an AI check. That happens here, in the background,
// so 120 students submitting at once don't wait on (or overload) the API.

const (
	graderWorkers   = 3
	maxGradingTries = 12
)

var gradeQueue = make(chan primitive.ObjectID, 10000)

func queueGrading(ids ...primitive.ObjectID) {
	for _, id := range ids {
		select {
		case gradeQueue <- id:
		default:
			log.Println("grader: queue full, attempt will be picked up by the next scan:", id.Hex())
		}
	}
}

func startGrader() {
	for i := 0; i < graderWorkers; i++ {
		go func() {
			for id := range gradeQueue {
				gradeWithAI(id)
			}
		}()
	}
	// Pick up anything left pending by a restart.
	go func() {
		ctx, cancel := dbCtx()
		defer cancel()
		ids, err := attemptsCol().Distinct(ctx, "_id", bson.M{"status": AttemptSubmitted, "grading": GradingPending})
		if err != nil {
			log.Println("grader: startup scan:", err)
			return
		}
		for _, raw := range ids {
			if id, ok := raw.(primitive.ObjectID); ok {
				queueGrading(id)
			}
		}
	}()
}

// gradeWithAI checks the attempt's unchecked code answers and finalises its score.
func gradeWithAI(id primitive.ObjectID) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	var att Attempt
	if err := attemptsCol().FindOne(ctx, bson.M{"_id": id}).Decode(&att); err != nil {
		log.Println("grader: load attempt:", err)
		return
	}
	if att.Status != AttemptSubmitted || att.Grading != GradingPending {
		return
	}
	exam, err := loadExamByID(ctx, att.ExamID)
	if err != nil {
		log.Println("grader: load exam:", err)
		return
	}

	// The student's key was freed when they submitted; grading borrows one of its own.
	ctx = withAIOwner(ctx, gradingOwner(id), "grading "+rollNumber(att.StudentEmail))
	defer releaseAIKey(gradingOwner(id))

	byID := questionMap(exam)
	if att.Runs == nil {
		att.Runs = map[string]RunResult{}
	}
	failed := false
	retryIn := time.Duration(0) // how long the API asked us to wait, if it said
	for _, qid := range att.QuestionIDs {
		q, ok := byID[qid]
		answer := att.Answers[qid]
		if !ok || q.Type != QCode || strings.TrimSpace(answer.Code) == "" {
			continue
		}
		language := answerLanguage(q, answer)
		hash := codeHash(language, answer.Code)
		if run, ok := att.Runs[qid]; ok && run.CodeHash == hash && !staleMatch(q, language, answer.Code, run) {
			continue
		}
		verdict, err := checkAnswer(ctx, q, language, answer.Code, contextFor(exam, att.SetNumber, q))
		if err != nil {
			log.Printf("grader: %s question %s: %v", id.Hex(), qid, err)
			failed = true
			var busy *aiBusyError
			if errors.As(err, &busy) {
				retryIn = max(retryIn, busy.wait)
			}
			// Every model is busy: stop here and try the rest later in one go.
			break
		}
		att.Runs[qid] = RunResult{
			CodeHash: hash, Language: language, Percent: verdict.Percent, Tests: verdict.Tests,
			At: time.Now(), Count: att.Runs[qid].Count, Model: verdict.Model,
		}
	}

	// The AI calls can take minutes; pick up any marks the teacher set meanwhile.
	var latest struct {
		Overrides map[string]float64 `bson:"overrides"`
	}
	if err := attemptsCol().FindOne(ctx, bson.M{"_id": id}, options.FindOne().SetProjection(bson.M{"overrides": 1})).Decode(&latest); err == nil {
		att.Overrides = latest.Overrides
	}
	score, maxScore, results, pending := GradeAttempt(byID, &att, exam.Settings.MultiScoring)
	grading := GradingDone
	tries := att.GradingTries + 1
	if failed || pending {
		grading = GradingPending
		if tries >= maxGradingTries {
			grading = GradingFailed
		}
	}
	_, err = attemptsCol().UpdateOne(ctx, bson.M{"_id": id, "status": AttemptSubmitted}, bson.M{"$set": bson.M{
		"runs": att.Runs, "results": results, "score": score, "max_score": maxScore,
		"grading": grading, "grading_tries": tries,
	}})
	if err != nil {
		log.Println("grader: save:", err)
		return
	}
	if grading == GradingPending {
		// Wait as long as the API asked, or back off 20 s, 40 s, ... up to 4 minutes.
		wait := max(retryIn+2*time.Second, time.Duration(min(tries, 12))*20*time.Second)
		log.Printf("grader: %s still pending, trying again in %s", id.Hex(), wait.Round(time.Second))
		time.AfterFunc(wait, func() { queueGrading(id) })
	}
}
