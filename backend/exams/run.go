package exams

import (
	"context"
	"errors"
	"log"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
)

const (
	// A student waits this long between checks, so one exam hall can't flood the API.
	runCooldown = 5 * time.Second
	runTimeout  = 150 * time.Second // one check, going round the models again while Google is busy
)

// runView is a check result as the student sees it.
type runView struct {
	QuestionID string        `json:"question_id"`
	Language   string        `json:"language"`
	Percent    int           `json:"percent"`
	Tests      []TestOutcome `json:"tests"`
	Count      int           `json:"count"`
	At         time.Time     `json:"at"`
	Current    bool          `json:"current"`  // false once the code has changed since this check
	Revealed   []PaperTest   `json:"revealed"` // private tests this check failed, shown in full
}

// revealedTests are the private tests a check failed. Like LeetCode after a
// wrong submission, the student sees what they were; passed ones stay hidden.
func revealedTests(q Question, outcomes []TestOutcome) []PaperTest {
	failed := map[string]bool{}
	for _, o := range outcomes {
		if !o.Executes && !o.Skipped {
			failed[o.ID] = true
		}
	}
	revealed := []PaperTest{}
	for _, t := range q.TestCases {
		if t.Hidden && failed[t.ID] {
			revealed = append(revealed, PaperTest{ID: t.ID, Input: t.Input, Output: t.Output, Hidden: true})
		}
	}
	return revealed
}

func viewRun(qid string, run RunResult, answer Answer, q Question) runView {
	tests := run.Tests
	if tests == nil {
		tests = []TestOutcome{}
	}
	current := strings.TrimSpace(answer.Code) != "" && run.CodeHash == codeHash(answerLanguage(q, answer), answer.Code)
	return runView{QuestionID: qid, Language: run.Language, Percent: run.Percent, Tests: tests, Count: run.Count, At: run.At, Current: current, Revealed: revealedTests(q, tests)}
}

func runViews(e *Exam, att *Attempt) map[string]runView {
	views := map[string]runView{}
	byID := questionMap(e)
	for qid, run := range att.Runs {
		if q, ok := byID[qid]; ok {
			views[qid] = viewRun(qid, run, att.Answers[qid], q)
		}
	}
	return views
}

func aiErrorResponse(err error) error {
	log.Println("ai check failed:", err)
	if errors.Is(err, errAINotConfigured) {
		return newError(http.StatusServiceUnavailable, "Code checking isn't set up on the server yet (GEMINI_API_KEY is missing).")
	}
	var busy *aiBusyError
	if errors.As(err, &busy) && busy.wait > 0 {
		return newError(http.StatusServiceUnavailable, "The AI evaluation pipeline is busy, so this couldn't be checked now. Your answer is saved and your teacher will check it by hand if needed. You can move on to the next question, or try Run again in about %d seconds.", int(math.Ceil(busy.wait.Seconds())))
	}
	return newError(http.StatusServiceUnavailable, "The AI evaluation pipeline is busy, so this couldn't be checked now. Your answer is saved and your teacher will check it by hand if needed. You can move on to the next question.")
}

// runCode saves a student's code and has the AI check it: how correct it is,
// and whether each test case would execute.
func runCode(c *gin.Context) {
	var req struct {
		QuestionID string `json:"question_id"`
		Code       string `json:"code"`
		Language   string `json:"language"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout)
	defer cancel()
	att, err := loadMyAttempt(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	if att.Status != AttemptInProgress {
		respondErr(c, newError(http.StatusConflict, "This exam has already been submitted."))
		return
	}
	if att.Locked {
		respondErr(c, newError(http.StatusConflict, "Your exam is locked. Ask your teacher to unlock it."))
		return
	}
	exam, err := loadExamForPaper(ctx, bson.M{"_id": att.ExamID}, []string{req.QuestionID}, att.SetNumber)
	if err != nil {
		respondErr(c, err)
		return
	}
	q, known := questionMap(exam)[req.QuestionID]
	if !known || !paperHas(att, req.QuestionID) || q.Type != QCode {
		respondErr(c, newError(http.StatusBadRequest, "This question can't be run."))
		return
	}
	if runeLen(req.Code) > maxCodeLength {
		respondErr(c, newError(http.StatusBadRequest, "Your code is longer than %d characters.", maxCodeLength))
		return
	}

	answer := att.Answers[req.QuestionID]
	answer.Code = req.Code
	if q.Language == LangAny {
		if _, ok := languages[req.Language]; !ok {
			respondErr(c, newError(http.StatusBadRequest, "Pick the language you're writing in."))
			return
		}
		answer.Language = req.Language
	}
	language := answerLanguage(q, answer)
	if att.Answers == nil {
		att.Answers = map[string]Answer{}
	}
	att.Answers[req.QuestionID] = answer
	att.AnsweredCount = countAnswered(att.Answers)
	saveAnswer := bson.M{"answers." + req.QuestionID: answer, "answered_count": att.AnsweredCount, "last_seen_at": time.Now()}
	inProgress := bson.M{"_id": att.ID, "status": AttemptInProgress}

	if strings.TrimSpace(req.Code) == "" {
		respondErr(c, newError(http.StatusBadRequest, "Write some code first."))
		return
	}
	hash := codeHash(language, req.Code)
	previous, hasPrevious := att.Runs[req.QuestionID]
	if hasPrevious && previous.CodeHash == hash && !staleMatch(q, language, req.Code, previous) {
		// Same code as last time: the same verdict, without spending a check.
		if _, err := attemptsCol().UpdateOne(ctx, inProgress, bson.M{"$set": saveAnswer}); err != nil {
			respondErr(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"run": viewRun(req.QuestionID, previous, answer, q), "cached": true, "max_runs": exam.Settings.MaxRuns})
		return
	}
	if limit := exam.Settings.MaxRuns; limit > 0 && previous.Count >= limit {
		_, _ = attemptsCol().UpdateOne(ctx, inProgress, bson.M{"$set": saveAnswer})
		respondErr(c, newError(http.StatusTooManyRequests, "You've used all %d checks for this question. Your answer is saved and will still be checked when you submit.", limit))
		return
	}
	// Save the code and claim a check in one write. The filter only matches when
	// the last check was long enough ago, so a double click can't start two.
	now := time.Now()
	saveAnswer["last_run_at"] = now
	claim := bson.M{"_id": att.ID, "status": AttemptInProgress, "$or": bson.A{
		bson.M{"last_run_at": bson.M{"$exists": false}},
		bson.M{"last_run_at": nil},
		bson.M{"last_run_at": bson.M{"$lt": now.Add(-runCooldown)}},
	}}
	claimed, err := attemptsCol().UpdateOne(ctx, claim, bson.M{"$set": saveAnswer})
	if err != nil {
		respondErr(c, err)
		return
	}
	if claimed.MatchedCount == 0 {
		delete(saveAnswer, "last_run_at")
		_, _ = attemptsCol().UpdateOne(ctx, inProgress, bson.M{"$set": saveAnswer})
		respondErr(c, newError(http.StatusTooManyRequests, "Wait a few seconds between checks."))
		return
	}

	// The check uses the key this student holds in the key pool.
	ctx = withAIOwner(ctx, attemptOwner(att.ID), rollNumber(att.StudentEmail))
	verdict, err := checkAnswer(ctx, q, language, req.Code, contextFor(exam, att.SetNumber, q))
	if err != nil {
		respondErr(c, aiErrorResponse(err))
		return
	}
	run := RunResult{CodeHash: hash, Language: language, Percent: verdict.Percent, Tests: verdict.Tests, At: time.Now(), Count: previous.Count + 1, Model: verdict.Model}
	res, err := attemptsCol().UpdateOne(ctx, inProgress, bson.M{"$set": bson.M{"runs." + req.QuestionID: run}, "$inc": bson.M{"run_count": 1}})
	if err != nil {
		respondErr(c, err)
		return
	}
	if res.MatchedCount == 0 {
		respondErr(c, newError(http.StatusConflict, "This exam was submitted while your code was being checked."))
		return
	}
	c.JSON(http.StatusOK, gin.H{"run": viewRun(req.QuestionID, run, answer, q), "cached": false, "max_runs": exam.Settings.MaxRuns})
}

func paperHas(att *Attempt, questionID string) bool {
	for _, id := range att.QuestionIDs {
		if id == questionID {
			return true
		}
	}
	return false
}

// checkQuestion lets a teacher try an answer (by default their own) against a
// question before the exam, to see how the AI judges it.
func checkQuestion(c *gin.Context) {
	var req struct {
		Question Question `json:"question"`
		Code     string   `json:"code"`
		Language string   `json:"language"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout)
	defer cancel()
	exam, err := loadExam(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	q, err := cleanQuestion(req.Question, TypeExternal)
	if err != nil {
		respondErr(c, newError(http.StatusBadRequest, "%s", err.Error()))
		return
	}
	code := req.Code
	if strings.TrimSpace(code) == "" {
		code = q.Solution
	}
	language := q.Language
	if language == LangAny {
		language = req.Language
		if _, ok := languages[language]; !ok {
			language = "other"
		}
	}
	// Always the AI, even for the teacher's own answer, so they see how it reads
	// the question. Students' code that matches this answer passes without it.
	verdict, err := checkWithAI(ctx, q, language, code, contextFor(exam, q.Set, q))
	if err != nil {
		respondErr(c, aiErrorResponse(err))
		return
	}
	verdict = consistentVerdict(verdict)
	c.JSON(http.StatusOK, gin.H{"percent": verdict.Percent, "tests": verdict.Tests, "model": verdict.Model})
}
