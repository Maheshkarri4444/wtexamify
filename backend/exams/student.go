package exams

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	// Answers that arrive this long after the deadline still count, to cover a slow network.
	submitGrace = 30 * time.Second
	// A second Start within this window is a double click, not the student coming back.
	rejoinWindow = 15 * time.Second
	maxCodeTries = 5
	codeCooldown = 2 * time.Minute
)

var violationReasons = map[string]string{
	"tab_hidden":           "You switched to another tab or window.",
	"window_blur":          "You left the exam window.",
	"fullscreen_exit":      "You exited fullscreen.",
	"screen_share_stopped": "You stopped sharing your screen.",
}

// Students never get the answer key, the other sets, the student list or the codes.
var studentExamProjection = bson.M{
	"questions": 0, "sets": 0, "report": 0, "assignments": 0, "allowed_students": 0,
	"settings.copy_code": 0, "settings.refresh_code": 0,
}

// Server-side checks need the codes, but not the question bank.
var liteExamProjection = bson.M{"questions": 0, "sets": 0, "report": 0, "assignments": 0, "allowed_students": 0}

type requirements struct {
	Fullscreen           bool `json:"fullscreen"`
	ScreenShare          bool `json:"screen_share"`
	BlockExtendedDisplay bool `json:"block_extended_display"`
	LockOnLeave          bool `json:"lock_on_leave"`
	BlockClipboard       bool `json:"block_clipboard"`
	LockOnRejoin         bool `json:"lock_on_rejoin"`
}

type studentExamInfo struct {
	ID              primitive.ObjectID `json:"id"`
	Title           string             `json:"title"`
	Type            string             `json:"type"`
	Status          string             `json:"status"`
	Instructions    string             `json:"instructions"`
	Context         string             `json:"context"`
	DurationMinutes int                `json:"duration_minutes"`
	QuestionsPerSet int                `json:"questions_per_set"`
	MaxViolations   int                `json:"max_violations"`
	MaxRuns         int                `json:"max_runs"`
	Requirements    requirements       `json:"requirements"`
	LiveAt          *time.Time         `json:"live_at"`
}

type attemptSummary struct {
	ID          primitive.ObjectID `json:"id"`
	Status      string             `json:"status"`
	Locked      bool               `json:"locked"`
	SubmittedAt *time.Time         `json:"submitted_at"`
	Grading     string             `json:"grading,omitempty"`
}

// studentResult is what a student learns after submitting: never a score,
// which only their teacher sees. The empty review keeps pages from before
// scores were hidden showing nothing either.
type studentResult struct {
	Visibility string     `json:"visibility"`
	Review     []struct{} `json:"review"`
}

type attemptState struct {
	ID               primitive.ObjectID `json:"id"`
	ExamID           primitive.ObjectID `json:"exam_id"`
	Status           string             `json:"status"`
	Locked           bool               `json:"locked"`
	LockReason       string             `json:"lock_reason"`
	Violations       int                `json:"violations"`
	MaxViolations    int                `json:"max_violations"`
	SetNumber        int                `json:"set_number"`
	PaperVersion     int                `json:"paper_version"`
	AnsweredCount    int                `json:"answered_count"`
	Total            int                `json:"total"`
	StartedAt        time.Time          `json:"started_at"`
	DeadlineAt       time.Time          `json:"deadline_at"`
	ServerNow        time.Time          `json:"server_now"`
	CodeBlockedUntil *time.Time         `json:"code_blocked_until"`
	SubmittedAt      *time.Time         `json:"submitted_at"`
	SubmitReason     string             `json:"submit_reason"`
	Grading          string             `json:"grading"`
	Result           *studentResult     `json:"result"`
}

// The testing account: the only student who may always copy and paste, even in
// an exam that blocks it.
const pasteTesterEmail = "n210507@rguktn.ac.in"

func clipboardAlwaysAllowed(email string) bool {
	return strings.EqualFold(strings.TrimSpace(email), pasteTesterEmail)
}

// infoFor is what a student may know about an exam before and while writing it.
func infoFor(e *Exam, email string) studentExamInfo {
	info := studentExamInfo{
		ID: e.ID, Title: e.Title, Type: e.Type, Status: e.Status, Instructions: e.Instructions,
		DurationMinutes: e.DurationMinutes, QuestionsPerSet: e.Blueprint.PerSet,
		MaxViolations: e.Settings.MaxViolations,
		Requirements: requirements{
			Fullscreen:           e.Settings.RequireFullscreen,
			ScreenShare:          e.Settings.RequireScreenShare,
			BlockExtendedDisplay: e.Settings.BlockExtendedDisplay,
			LockOnLeave:          !e.Settings.AllowLeaving,
			BlockClipboard:       !e.Settings.AllowClipboard && !clipboardAlwaysAllowed(email),
			LockOnRejoin:         e.Settings.LockOnRejoin,
		},
		LiveAt: e.LiveAt,
	}
	if e.Type == TypeExternal {
		info.Context, info.MaxRuns = e.Context, e.Settings.MaxRuns
	}
	return info
}

func summaryFor(e *Exam, att *Attempt) *attemptSummary {
	if att == nil {
		return nil
	}
	// No score: students never see one, only their teacher does.
	return &attemptSummary{ID: att.ID, Status: att.Status, Locked: att.Locked, SubmittedAt: att.SubmittedAt, Grading: att.Grading}
}

// stateFor is everything the exam room needs to know besides the questions.
func stateFor(e *Exam, att *Attempt) attemptState {
	state := attemptState{
		ID: att.ID, ExamID: att.ExamID, Status: att.Status, Locked: att.Locked, LockReason: att.LockReason,
		Violations: att.Violations, MaxViolations: e.Settings.MaxViolations,
		SetNumber: att.SetNumber, PaperVersion: att.PaperVersion,
		AnsweredCount: att.AnsweredCount, Total: len(att.QuestionIDs),
		StartedAt: att.StartedAt, DeadlineAt: att.DeadlineAt, ServerNow: time.Now(),
		CodeBlockedUntil: att.CodeBlockedUntil, SubmittedAt: att.SubmittedAt, SubmitReason: att.SubmitReason,
		Grading: att.Grading,
	}
	if att.Status != AttemptSubmitted {
		return state
	}
	state.Result = &studentResult{Visibility: VisibilityNone, Review: []struct{}{}}
	return state
}

func respondPaper(c *gin.Context, e *Exam, att *Attempt) {
	questions := []PaperQuestion{}
	if att.Status == AttemptInProgress {
		questions = paperQuestions(e, att)
	}
	answers := att.Answers
	if answers == nil {
		answers = map[string]Answer{}
	}
	c.JSON(http.StatusOK, gin.H{
		"exam": infoFor(e, att.StudentEmail), "state": stateFor(e, att), "questions": questions, "answers": answers, "runs": runViews(e, att),
		"set_context": setContext(e, att.SetNumber), // the student's set's own tables and data, for custom sets
	})
}

func findExam(ctx context.Context, filter bson.M, projection bson.M) (*Exam, error) {
	var exam Exam
	opts := options.FindOne()
	if projection != nil {
		opts.SetProjection(projection)
	}
	err := examsCol().FindOne(ctx, filter, opts).Decode(&exam)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, newError(http.StatusNotFound, "This exam isn't available for your account.")
	}
	return &exam, err
}

func loadMyAttempt(ctx context.Context, c *gin.Context) (*Attempt, error) {
	attemptID, err := idParam(c, "aid")
	if err != nil {
		return nil, err
	}
	var att Attempt
	err = attemptsCol().FindOne(ctx, bson.M{"_id": attemptID, "student_email": userFrom(c).Email}).Decode(&att)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, errAttemptNotFound
	}
	return &att, err
}

func listMyExams(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	email := userFrom(c).Email
	cursor, err := examsCol().Find(ctx,
		bson.M{"allowed_students": email, "status": bson.M{"$in": []string{StatusReady, StatusLive, StatusEnded}}},
		options.Find().SetProjection(studentExamProjection).SetSort(bson.D{{Key: "updated_at", Value: -1}}))
	if err != nil {
		respondErr(c, err)
		return
	}
	var found []*Exam
	if err := cursor.All(ctx, &found); err != nil {
		respondErr(c, err)
		return
	}
	ids := make([]primitive.ObjectID, len(found))
	for i, e := range found {
		ids[i] = e.ID
	}
	attCursor, err := attemptsCol().Find(ctx, bson.M{"student_email": email, "exam_id": bson.M{"$in": ids}},
		options.Find().SetProjection(bson.M{"answers": 0, "events": 0, "option_order": 0, "results": 0}))
	if err != nil {
		respondErr(c, err)
		return
	}
	var attempts []*Attempt
	if err := attCursor.All(ctx, &attempts); err != nil {
		respondErr(c, err)
		return
	}
	byExam := map[primitive.ObjectID]*Attempt{}
	for _, att := range attempts {
		byExam[att.ExamID] = att
	}
	cards := []gin.H{}
	for _, e := range found {
		cards = append(cards, gin.H{"exam": infoFor(e, email), "attempt": summaryFor(e, byExam[e.ID])})
	}
	c.JSON(http.StatusOK, gin.H{"exams": cards})
}

func getMyExam(c *gin.Context) {
	examID, err := idParam(c, "id")
	if err != nil {
		respondErr(c, err)
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	email := userFrom(c).Email
	exam, err := findExam(ctx, bson.M{"_id": examID, "allowed_students": email}, studentExamProjection)
	if err != nil {
		respondErr(c, err)
		return
	}
	var att Attempt
	err = attemptsCol().FindOne(ctx, bson.M{"exam_id": exam.ID, "student_email": email}).Decode(&att)
	switch {
	case err == nil:
		c.JSON(http.StatusOK, gin.H{"exam": infoFor(exam, email), "attempt": summaryFor(exam, &att)})
	case errors.Is(err, mongo.ErrNoDocuments):
		c.JSON(http.StatusOK, gin.H{"exam": infoFor(exam, email), "attempt": nil})
	default:
		respondErr(c, err)
	}
}

// startAttempt begins the exam, or resumes it. Resuming after leaving the page
// locks the paper until the teacher enters the copy code.
func startAttempt(c *gin.Context) {
	var req struct {
		Flags *ClientFlags `json:"flags"`
	}
	_ = c.ShouldBindJSON(&req)
	examID, err := idParam(c, "id")
	if err != nil {
		respondErr(c, err)
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	user := userFrom(c)
	exam, err := findExam(ctx, bson.M{"_id": examID, "allowed_students": user.Email}, nil)
	if err != nil {
		respondErr(c, err)
		return
	}

	var existing Attempt
	err = attemptsCol().FindOne(ctx, bson.M{"exam_id": exam.ID, "student_email": user.Email}).Decode(&existing)
	if err == nil {
		resumeAttempt(ctx, c, exam, &existing)
		return
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		respondErr(c, err)
		return
	}

	switch exam.Status {
	case StatusLive:
	case StatusEnded:
		respondErr(c, newError(http.StatusConflict, "This exam has ended."))
		return
	default:
		respondErr(c, newError(http.StatusConflict, "Your teacher hasn't started this exam yet."))
		return
	}

	// Lock the content first, then read the exam again, so the paper is built
	// from sets that can no longer change underneath this student.
	res, err := examsCol().UpdateOne(ctx, bson.M{"_id": exam.ID, "status": StatusLive}, bson.M{"$set": bson.M{"content_locked": true}})
	if err != nil {
		respondErr(c, err)
		return
	}
	if res.MatchedCount == 0 {
		respondErr(c, newError(http.StatusConflict, "This exam is no longer live."))
		return
	}
	if exam, err = loadExamByID(ctx, exam.ID); err != nil {
		respondErr(c, err)
		return
	}

	setNumber := assignedSet(exam, user.Email)
	if setNumber == 0 {
		setNumber = leastAssignedSet(exam)
	}
	if findSet(exam, setNumber) == nil {
		respondErr(c, newError(http.StatusConflict, "This exam has no question sets yet. Please tell your teacher."))
		return
	}
	ids, order := buildPaper(exam, setNumber, newRNG())
	now := time.Now()
	att := Attempt{
		ID: primitive.NewObjectID(), ExamID: exam.ID, StudentEmail: user.Email, StudentName: user.Name,
		SetNumber: setNumber, QuestionIDs: ids, OptionOrder: order, PaperVersion: 1,
		Answers: map[string]Answer{}, Runs: map[string]RunResult{}, Overrides: map[string]float64{}, Status: AttemptInProgress,
		StartedAt: now, DeadlineAt: now.Add(time.Duration(exam.DurationMinutes) * time.Minute), LastSeenAt: now,
		Results: []QuestionResult{}, Events: []Event{{At: now, Type: "started", Detail: fmt.Sprintf("Set %d", setNumber)}},
		UserAgent: truncateRunes(c.Request.UserAgent(), 300),
	}
	if req.Flags != nil {
		att.Flags = *req.Flags
	}
	if _, err := attemptsCol().InsertOne(ctx, att); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			// A second click raced this one; hand back the attempt it created.
			if err := attemptsCol().FindOne(ctx, bson.M{"exam_id": exam.ID, "student_email": user.Email}).Decode(&existing); err == nil {
				respondPaper(c, exam, &existing)
				return
			}
		}
		respondErr(c, err)
		return
	}
	respondPaper(c, exam, &att)
}

func resumeAttempt(ctx context.Context, c *gin.Context, exam *Exam, att *Attempt) {
	now := time.Now()
	if att.Status == AttemptInProgress && now.After(att.DeadlineAt.Add(submitGrace)) {
		if err := finalizeAttempts(ctx, exam, []*Attempt{att}, "time_up"); err != nil {
			respondErr(c, err)
			return
		}
	}
	if att.Status == AttemptInProgress && exam.Settings.LockOnRejoin && !att.Locked && now.Sub(att.StartedAt) > rejoinWindow {
		reason := "You left the exam page and came back."
		_, err := attemptsCol().UpdateOne(ctx, bson.M{"_id": att.ID, "status": AttemptInProgress}, bson.M{
			"$set":  bson.M{"locked": true, "lock_reason": reason, "last_seen_at": now},
			"$push": bson.M{"events": eventPush(Event{At: now, Type: "rejoined"})},
		})
		if err != nil {
			respondErr(c, err)
			return
		}
		att.Locked, att.LockReason = true, reason
	}
	respondPaper(c, exam, att)
}

func getAttempt(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	att, err := loadMyAttempt(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	exam, err := loadExamByID(ctx, att.ExamID)
	if err != nil {
		respondErr(c, err)
		return
	}
	respondPaper(c, exam, att)
}

// examForState loads only what stateFor needs: the settings, never the
// question bank (students get no review or score after submitting).
func examForState(ctx context.Context, att *Attempt) (*Exam, error) {
	return findExam(ctx, bson.M{"_id": att.ExamID}, liteExamProjection)
}

func respondState(ctx context.Context, c *gin.Context, att *Attempt) {
	exam, err := examForState(ctx, att)
	if err != nil {
		respondErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"state": stateFor(exam, att)})
}

// finishIfExpired submits an attempt whose time ran out. It reports whether it did.
func finishIfExpired(ctx context.Context, att *Attempt) (bool, error) {
	if att.Status != AttemptInProgress || !time.Now().After(att.DeadlineAt.Add(submitGrace)) {
		return false, nil
	}
	exam, err := loadExamByID(ctx, att.ExamID)
	if err != nil {
		return false, err
	}
	return true, finalizeAttempts(ctx, exam, []*Attempt{att}, "time_up")
}

// syncAttempt is the exam room's heartbeat: it autosaves answers, records the
// proctoring flags and returns the latest state (locks, refreshes, deadline).
func syncAttempt(c *gin.Context) {
	var req struct {
		Answers map[string]Answer `json:"answers"`
		Flags   *ClientFlags      `json:"flags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	att, err := loadMyAttempt(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	if expired, err := finishIfExpired(ctx, att); err != nil || expired {
		if err != nil {
			respondErr(c, err)
			return
		}
		respondState(ctx, c, att)
		return
	}
	if att.Status == AttemptInProgress {
		now := time.Now()
		set := bson.M{"last_seen_at": now}
		if req.Flags != nil {
			set["flags"] = *req.Flags
		}
		if req.Answers != nil {
			clean, answered := sanitizeAnswers(req.Answers, att)
			set["answers"], set["answered_count"] = clean, answered
			att.Answers, att.AnsweredCount = clean, answered
		}
		res, err := attemptsCol().UpdateOne(ctx, bson.M{"_id": att.ID, "status": AttemptInProgress, "paper_version": att.PaperVersion}, bson.M{"$set": set})
		if err != nil {
			respondErr(c, err)
			return
		}
		if res.MatchedCount == 0 {
			// Submitted or given a new set in the meantime: report that instead.
			if att, err = loadMyAttempt(ctx, c); err != nil {
				respondErr(c, err)
				return
			}
		}
	}
	respondState(ctx, c, att)
}

// attemptEvent records what the browser noticed. Leaving the exam locks it
// (one violation per lock, however many events one slip triggers); blocked
// copy/paste is only counted.
func attemptEvent(c *gin.Context) {
	var req struct {
		Type   string `json:"type"`
		Detail string `json:"detail"`
		ID     string `json:"id"` // set by the browser for violations, to spot resends
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	req.ID = truncateRunes(req.ID, 64)
	ctx, cancel := dbCtx()
	defer cancel()
	att, err := loadMyAttempt(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	if att.Status != AttemptInProgress || (req.ID != "" && req.ID == att.LastEventID) {
		// Submitted, or a resend of a violation that already counted.
		respondState(ctx, c, att)
		return
	}
	now := time.Now()
	event := Event{At: now, Type: req.Type, Detail: truncateRunes(req.Detail, 200)}

	if req.Type == "clipboard" {
		_, err := attemptsCol().UpdateOne(ctx, bson.M{"_id": att.ID}, bson.M{
			"$inc":  bson.M{"clipboard_blocks": 1},
			"$push": bson.M{"events": eventPush(event)},
		})
		if err != nil {
			respondErr(c, err)
			return
		}
		att.ClipboardBlocks++
		respondState(ctx, c, att)
		return
	}

	reason, isViolation := violationReasons[req.Type]
	if !isViolation {
		respondErr(c, newError(http.StatusBadRequest, "Unknown event."))
		return
	}
	lite, err := findExam(ctx, bson.M{"_id": att.ExamID}, liteExamProjection)
	if err != nil {
		respondErr(c, err)
		return
	}
	leaving := req.Type == "tab_hidden" || req.Type == "window_blur"
	if att.Locked || (leaving && lite.Settings.AllowLeaving) {
		event.Detail = "while already locked"
		if !att.Locked {
			event.Detail = "allowed for this exam"
		}
		_, err = attemptsCol().UpdateOne(ctx, bson.M{"_id": att.ID}, bson.M{"$push": bson.M{"events": eventPush(event)}, "$set": bson.M{"last_event_id": req.ID}})
		if err != nil {
			respondErr(c, err)
			return
		}
		respondState(ctx, c, att)
		return
	}
	res, err := attemptsCol().UpdateOne(ctx, bson.M{"_id": att.ID, "status": AttemptInProgress, "locked": false}, bson.M{
		"$set":  bson.M{"locked": true, "lock_reason": reason, "last_seen_at": now, "last_event_id": req.ID},
		"$inc":  bson.M{"violations": 1},
		"$push": bson.M{"events": eventPush(event)},
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	if res.ModifiedCount == 0 {
		// Another event locked it first.
		if att, err = loadMyAttempt(ctx, c); err != nil {
			respondErr(c, err)
			return
		}
		respondState(ctx, c, att)
		return
	}
	att.Locked, att.LockReason = true, reason
	att.Violations++

	if limit := lite.Settings.MaxViolations; limit > 0 && att.Violations >= limit {
		exam, err := loadExamByID(ctx, att.ExamID)
		if err != nil {
			respondErr(c, err)
			return
		}
		if err := finalizeAttempts(ctx, exam, []*Attempt{att}, "violations"); err != nil {
			respondErr(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"state": stateFor(exam, att)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"state": stateFor(lite, att)})
}

// checkCode applies the wrong-code limit. It returns a ready-to-send error when
// the code is wrong or the student is cooling down.
func checkCode(ctx context.Context, att *Attempt, given, want string) error {
	now := time.Now()
	if att.CodeBlockedUntil != nil && now.Before(*att.CodeBlockedUntil) {
		wait := int(att.CodeBlockedUntil.Sub(now).Seconds()) + 1
		return newError(http.StatusTooManyRequests, "Too many wrong codes. Try again in %d seconds, or ask your teacher to unlock you from their dashboard.", wait)
	}
	if codesMatch(given, want) {
		return nil
	}
	failures := att.CodeFailures + 1
	set := bson.M{"code_failures": failures}
	push := []Event{{At: now, Type: "wrong_code"}}
	message := fmt.Sprintf("That code isn't right. %d tries left.", maxCodeTries-failures)
	if failures >= maxCodeTries {
		until := now.Add(codeCooldown)
		set["code_failures"], set["code_blocked_until"] = 0, until
		push = append(push, Event{At: now, Type: "code_blocked", Detail: "Too many wrong codes"})
		message = "That code isn't right. Code entry is paused for 2 minutes."
	}
	if _, err := attemptsCol().UpdateOne(ctx, bson.M{"_id": att.ID}, bson.M{"$set": set, "$push": bson.M{"events": eventPush(push...)}}); err != nil {
		return err
	}
	return newError(http.StatusForbidden, "%s", message)
}

func unlockAttempt(c *gin.Context) {
	var req struct {
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	att, err := loadMyAttempt(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	if att.Status != AttemptInProgress || !att.Locked {
		respondState(ctx, c, att)
		return
	}
	exam, err := findExam(ctx, bson.M{"_id": att.ExamID}, liteExamProjection)
	if err != nil {
		respondErr(c, err)
		return
	}
	if err := checkCode(ctx, att, req.Code, exam.Settings.CopyCode); err != nil {
		respondErr(c, err)
		return
	}
	now := time.Now()
	set := bson.M{"locked": false, "lock_reason": "", "code_failures": 0, "code_blocked_until": nil, "last_seen_at": now}
	update := bson.M{"$set": set, "$push": bson.M{"events": eventPush(Event{At: now, Type: "unlocked", Detail: "Copy code entered"})}}
	if exam.Settings.ClearAnswersOnUnlock {
		set["answers"], set["answered_count"] = map[string]Answer{}, 0
		update["$inc"] = bson.M{"paper_version": 1}
		att.Answers, att.AnsweredCount = map[string]Answer{}, 0
		att.PaperVersion++
	}
	if _, err := attemptsCol().UpdateOne(ctx, bson.M{"_id": att.ID, "status": AttemptInProgress}, update); err != nil {
		respondErr(c, err)
		return
	}
	att.Locked, att.LockReason, att.CodeFailures, att.CodeBlockedUntil = false, "", 0, nil
	c.JSON(http.StatusOK, gin.H{"state": stateFor(exam, att)})
}

// refreshAttempt is the teacher's refresh code: a different set, a fresh shuffle
// and empty answers. It also unlocks, since the teacher is standing right there.
func refreshAttempt(c *gin.Context) {
	var req struct {
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	att, err := loadMyAttempt(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	exam, err := loadExamByID(ctx, att.ExamID)
	if err != nil {
		respondErr(c, err)
		return
	}
	if att.Status != AttemptInProgress {
		respondPaper(c, exam, att)
		return
	}
	if err := checkCode(ctx, att, req.Code, exam.Settings.RefreshCode); err != nil {
		respondErr(c, err)
		return
	}
	rng := newRNG()
	next := pickOtherSet(exam, att.SetNumber, rng)
	ids, order := buildPaper(exam, next, rng)
	now := time.Now()
	_, err = attemptsCol().UpdateOne(ctx, bson.M{"_id": att.ID, "status": AttemptInProgress}, bson.M{
		"$set": bson.M{
			"set_number": next, "question_ids": ids, "option_order": order,
			"answers": map[string]Answer{}, "answered_count": 0, "runs": map[string]RunResult{},
			"locked": false, "lock_reason": "", "code_failures": 0, "code_blocked_until": nil, "last_seen_at": now,
		},
		"$inc":  bson.M{"paper_version": 1, "refreshes": 1},
		"$push": bson.M{"events": eventPush(Event{At: now, Type: "refreshed", Detail: setChange(att.SetNumber, next)})},
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	if att, err = loadMyAttempt(ctx, c); err != nil {
		respondErr(c, err)
		return
	}
	respondPaper(c, exam, att)
}

func submitAttempt(c *gin.Context) {
	var req struct {
		Answers map[string]Answer `json:"answers"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	att, err := loadMyAttempt(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	exam, err := loadExamByID(ctx, att.ExamID)
	if err != nil {
		respondErr(c, err)
		return
	}
	if att.Status == AttemptInProgress {
		// Answers sent after the deadline (plus grace) are ignored; the last autosave counts.
		if req.Answers != nil && !time.Now().After(att.DeadlineAt.Add(submitGrace)) {
			att.Answers, att.AnsweredCount = sanitizeAnswers(req.Answers, att)
		}
		if err := finalizeAttempts(ctx, exam, []*Attempt{att}, "submitted"); err != nil {
			respondErr(c, err)
			return
		}
		if att, err = loadMyAttempt(ctx, c); err != nil {
			respondErr(c, err)
			return
		}
	}
	respondPaper(c, exam, att)
}

func setChange(from, to int) string {
	if from == to {
		return fmt.Sprintf("Set %d reshuffled", to)
	}
	return fmt.Sprintf("Set %d → set %d", from, to)
}

func minutesLabel(minutes int) string {
	if minutes == 1 {
		return "+1 minute"
	}
	return fmt.Sprintf("+%d minutes", minutes)
}
