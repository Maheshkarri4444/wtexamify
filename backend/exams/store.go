package exams

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/Maheshkarri4444/wtexamify/config.go"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// v2 data lives in its own collections; the v1 collections are left as they were.
func examsCol() *mongo.Collection    { return config.Collection("v2_exams") }
func attemptsCol() *mongo.Collection { return config.Collection("v2_attempts") }
func usersCol() *mongo.Collection    { return config.Collection("users") }

const maxEvents = 200

func dbCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 15*time.Second)
}

func ensureIndexes() {
	ctx, cancel := dbCtx()
	defer cancel()
	if _, err := examsCol().Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "owner_id", Value: 1}, {Key: "updated_at", Value: -1}}},
		{Keys: bson.D{{Key: "shared_with", Value: 1}}},
		{Keys: bson.D{{Key: "allowed_students", Value: 1}}},
	}); err != nil {
		log.Println("v2 exam indexes:", err)
	}
	if _, err := attemptsCol().Indexes().CreateMany(ctx, []mongo.IndexModel{
		// One attempt per student per exam, even if Start is clicked twice.
		{Keys: bson.D{{Key: "exam_id", Value: 1}, {Key: "student_email", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "deadline_at", Value: 1}}},
	}); err != nil {
		log.Println("v2 attempt indexes:", err)
	}
}

// apiError is an error whose message is safe to show to the user.
type apiError struct {
	status  int
	message string
}

func (e *apiError) Error() string { return e.message }

func newError(status int, format string, args ...any) error {
	return &apiError{status: status, message: sentence(fmt.Sprintf(format, args...))}
}

var (
	errExamNotFound    = newError(http.StatusNotFound, "Exam not found.")
	errAttemptNotFound = newError(http.StatusNotFound, "Attempt not found.")
	errLocked          = newError(http.StatusConflict, "Students have started this exam, so its questions, blueprint and sets are locked.")
	errConflict        = newError(http.StatusConflict, "This exam was changed somewhere else. Reload and try again.")
)

func respondErr(c *gin.Context, err error) {
	var known *apiError
	switch {
	case errors.As(err, &known):
		c.JSON(known.status, gin.H{"error": known.message})
	case errors.Is(err, mongo.ErrNoDocuments):
		c.JSON(http.StatusNotFound, gin.H{"error": "Not found."})
	default:
		log.Println("v2 request failed:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong on the server. Please try again."})
	}
}

// sentence capitalises the first letter and ends with a full stop.
func sentence(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	runes := []rune(s)
	runes[0] = unicode.ToUpper(runes[0])
	s = string(runes)
	if !strings.HasSuffix(s, ".") && !strings.HasSuffix(s, "?") && !strings.HasSuffix(s, "!") {
		s += "."
	}
	return s
}

type currentUser struct {
	ID    primitive.ObjectID
	Email string
	Name  string
}

func userFrom(c *gin.Context) currentUser {
	id, _ := c.MustGet("user_id").(primitive.ObjectID)
	email, _ := c.MustGet("email").(string)
	name, _ := c.MustGet("name").(string)
	return currentUser{ID: id, Email: strings.ToLower(email), Name: name}
}

func idParam(c *gin.Context, name string) (primitive.ObjectID, error) {
	id, err := primitive.ObjectIDFromHex(c.Param(name))
	if err != nil {
		return id, newError(http.StatusNotFound, "Not found.")
	}
	return id, nil
}

// teacherExams matches the exams a teacher can open: their own, and the ones
// another teacher shared with them.
func teacherExams(user currentUser) bson.M {
	return bson.M{"$or": bson.A{bson.M{"owner_id": user.ID}, bson.M{"shared_with": user.Email}}}
}

// loadExam loads an exam the teacher owns or that was shared with them. Teachers
// it's shared with see and do everything the owner does, except what checks
// ownsExam: changing the questions, deleting the exam and sharing it.
func loadExam(ctx context.Context, c *gin.Context) (*Exam, error) {
	return loadExamFields(ctx, c, nil)
}

// loadExamFields is loadExam reading only some fields: a 60-set exam is close to
// 1 MB, too much to read on every live-board refresh.
func loadExamFields(ctx context.Context, c *gin.Context, projection bson.M) (*Exam, error) {
	examID, err := idParam(c, "id")
	if err != nil {
		return nil, err
	}
	filter := teacherExams(userFrom(c))
	filter["_id"] = examID
	opts := options.FindOne()
	if projection != nil {
		opts.SetProjection(projection)
	}
	var exam Exam
	err = examsCol().FindOne(ctx, filter, opts).Decode(&exam)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, errExamNotFound
	}
	return &exam, err
}

// loadExamForPaper reads an exam with only one student's questions and their set:
// all a paper, a Run or grading needs. A 60-set exam is close to 1 MB, and reading
// it whole takes seconds, too slow to do for every student.
func loadExamForPaper(ctx context.Context, filter bson.M, questionIDs []string, setNumber int) (*Exam, error) {
	if questionIDs == nil {
		questionIDs = []string{}
	}
	cursor, err := examsCol().Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$project", Value: bson.M{"report": 0, "assignments": 0, "allowed_students": 0, "blueprint.set_contexts": 0}}},
		{{Key: "$set", Value: bson.M{
			"questions": bson.M{"$filter": bson.M{"input": bson.M{"$ifNull": bson.A{"$questions", bson.A{}}}, "cond": bson.M{"$in": bson.A{"$$this.id", questionIDs}}}},
			"sets":      bson.M{"$filter": bson.M{"input": bson.M{"$ifNull": bson.A{"$sets", bson.A{}}}, "cond": bson.M{"$eq": bson.A{"$$this.number", setNumber}}}},
		}}},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	if !cursor.Next(ctx) {
		if err := cursor.Err(); err != nil {
			return nil, err
		}
		return nil, newError(http.StatusNotFound, "This exam isn't available for your account.")
	}
	var exam Exam
	if err := cursor.Decode(&exam); err != nil {
		return nil, err
	}
	return &exam, nil
}

func ownsExam(c *gin.Context, e *Exam) bool { return e.OwnerID == userFrom(c).ID }

// ownerOnly is the error for something only the teacher who made the exam may do.
func ownerOnly(what string) error {
	return newError(http.StatusForbidden, "Only the teacher who created this exam can %s.", what)
}

// loadOwnExam is loadExam for what only the exam's creator may do; ownerAction
// says what that is, for the error a teacher it's shared with gets.
func loadOwnExam(ctx context.Context, c *gin.Context, ownerAction string) (*Exam, error) {
	exam, err := loadExam(ctx, c)
	if err == nil && !ownsExam(c, exam) {
		return nil, ownerOnly(ownerAction)
	}
	return exam, err
}

// modifyExam loads the teacher's exam (their own or one shared with them),
// applies change, and saves the fields it returns. The write only lands if
// nothing else changed the exam in between (including a student starting it);
// otherwise it reloads and tries again.
func modifyExam(ctx context.Context, c *gin.Context, change func(e *Exam) (bson.M, error)) (*Exam, error) {
	return modifyExamAs(ctx, c, "", change)
}

// modifyOwnExam is modifyExam for changes only the exam's creator may make,
// such as its questions.
func modifyOwnExam(ctx context.Context, c *gin.Context, ownerAction string, change func(e *Exam) (bson.M, error)) (*Exam, error) {
	return modifyExamAs(ctx, c, ownerAction, change)
}

func modifyExamAs(ctx context.Context, c *gin.Context, ownerAction string, change func(e *Exam) (bson.M, error)) (*Exam, error) {
	for try := 0; try < 3; try++ {
		exam, err := loadExam(ctx, c)
		if err != nil {
			return nil, err
		}
		if ownerAction != "" && !ownsExam(c, exam) {
			return nil, ownerOnly(ownerAction)
		}
		fields, err := change(exam)
		if err != nil {
			return nil, err
		}
		previous := exam.Version
		exam.Version++
		exam.UpdatedAt = time.Now()
		fields["version"] = exam.Version
		fields["updated_at"] = exam.UpdatedAt
		res, err := examsCol().UpdateOne(ctx,
			bson.M{"_id": exam.ID, "version": previous, "content_locked": exam.ContentLocked},
			bson.M{"$set": fields})
		if err != nil {
			return nil, err
		}
		if res.MatchedCount == 1 {
			return exam, nil
		}
	}
	return nil, errConflict
}

// contentFields are the fields that change when questions or the blueprint do.
func contentFields(e *Exam) bson.M {
	return bson.M{
		"questions":        e.Questions,
		"blueprint":        e.Blueprint,
		"sets":             e.Sets,
		"report":           e.Report,
		"allowed_students": e.AllowedStudents,
		"assignments":      e.Assignments,
	}
}

func eventPush(events ...Event) bson.M {
	return bson.M{"$each": events, "$slice": -maxEvents}
}

func loadAttemptForExam(ctx context.Context, examID primitive.ObjectID, c *gin.Context) (*Attempt, error) {
	attemptID, err := idParam(c, "aid")
	if err != nil {
		return nil, err
	}
	var att Attempt
	err = attemptsCol().FindOne(ctx, bson.M{"_id": attemptID, "exam_id": examID}).Decode(&att)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, errAttemptNotFound
	}
	return &att, err
}

func loadExamByID(ctx context.Context, examID primitive.ObjectID) (*Exam, error) {
	var exam Exam
	err := examsCol().FindOne(ctx, bson.M{"_id": examID}).Decode(&exam)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, errExamNotFound
	}
	return &exam, err
}

// finalizeAttempts grades and submits attempts in one round trip. Only attempts
// still in progress are touched, so calling it twice is harmless.
func finalizeAttempts(ctx context.Context, e *Exam, attempts []*Attempt, reason string) error {
	if len(attempts) == 0 {
		return nil
	}
	byID := questionMap(e)
	now := time.Now()
	models := make([]mongo.WriteModel, 0, len(attempts))
	var needsAI []primitive.ObjectID
	for _, att := range attempts {
		if att.Status != AttemptInProgress {
			continue
		}
		score, maxScore, results, pending := GradeAttempt(byID, att, e.Settings.MultiScoring)
		grading := ""
		if e.Type == TypeExternal {
			grading = GradingDone
			if pending {
				// Code that wasn't run in its final form is checked in the background.
				grading = GradingPending
				needsAI = append(needsAI, att.ID)
			}
		}
		att.Status, att.Score, att.MaxScore, att.Results, att.Grading = AttemptSubmitted, score, maxScore, results, grading
		att.SubmittedAt, att.SubmitReason, att.Locked, att.LockReason = &now, reason, false, ""
		models = append(models, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": att.ID, "status": AttemptInProgress}).
			SetUpdate(bson.M{
				"$set": bson.M{
					"status": AttemptSubmitted, "submitted_at": now, "submit_reason": reason,
					"score": score, "max_score": maxScore, "results": results, "grading": grading,
					"answers": att.Answers, "answered_count": att.AnsweredCount,
					"locked": false, "lock_reason": "",
				},
				"$push": bson.M{"events": eventPush(Event{At: now, Type: "submitted", Detail: reason})},
			}))
	}
	if len(models) == 0 {
		return nil
	}
	if _, err := attemptsCol().BulkWrite(ctx, models, options.BulkWrite().SetOrdered(false)); err != nil {
		return err
	}
	if e.Type == TypeExternal {
		for _, att := range attempts {
			releaseAIKey(attemptOwner(att.ID)) // the key goes back to the pool for the next student
		}
	}
	queueGrading(needsAI...)
	return nil
}

// countAnswered counts answers with something in them.
func countAnswered(answers map[string]Answer) int {
	n := 0
	for _, a := range answers {
		if len(a.Selected) > 0 || strings.TrimSpace(a.Text) != "" || strings.TrimSpace(a.Code) != "" {
			n++
		}
	}
	return n
}

// rollNumber is the roll number shown for a student: the name part of an RGUKT
// email, or the one config lists for a student signing in with another email.
func rollNumber(email string) string {
	if roll, listed := config.StudentRoll(email); listed {
		return roll
	}
	local, _, _ := strings.Cut(email, "@")
	if rollNumberRe.MatchString(local) {
		return strings.ToUpper(local)
	}
	return local
}
