package exams

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

var defaultInstructions = map[string]string{
	TypeViva:     "Answer every question before the timer runs out. Single-correct questions have exactly one right option. Multiple-correct questions can have more than one, and a wrong tick costs you that question. Fill-in-the-blank answers ignore capital letters and spaces. Stay in fullscreen and on this tab the whole time: leaving locks your exam until your teacher unlocks it.",
	TypeInternal: "This is your question paper. Write your programs or answers where your teacher tells you to, on your lab system or on paper, and show your output when they come round. The paper closes when the timer ends.",
	TypeExternal: "Write each answer in the editor; it saves automatically. Press Run to check it against every test case: the public ones first, then the private ones, and how correct your answer is. If your code fails a private test, you'll see what it was. It's a dry run by AI, so small syntax slips don't count against you. Stay on this tab in fullscreen until you submit.",
}

var defaultPerSet = map[string]int{TypeViva: 10, TypeInternal: 3, TypeExternal: 5}

type attemptStats struct {
	Started    int64 `json:"started"`
	InProgress int64 `json:"in_progress"`
	Submitted  int64 `json:"submitted"`
}

type readinessCheck struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Detail string `json:"detail"`
	OK     bool   `json:"ok"`
}

func readiness(e *Exam) []readinessCheck {
	setDetail := "Generated from the blueprint"
	switch {
	case len(e.Sets) > 0 && e.Blueprint.Custom:
		setDetail = fmt.Sprintf("%d of your own sets", len(e.Sets))
	case len(e.Sets) > 0:
		setDetail = fmt.Sprintf("%d set(s) of %d questions", len(e.Sets), e.Blueprint.PerSet)
	case len(e.Report.Errors) > 0:
		setDetail = e.Report.Errors[0]
	}
	return []readinessCheck{
		{Key: "questions", Label: "Questions", OK: len(e.Questions) > 0, Detail: fmt.Sprintf("%d in the question bank", len(e.Questions))},
		{Key: "sets", Label: "Sets", OK: len(e.Sets) > 0, Detail: setDetail},
		{Key: "students", Label: "Students", OK: len(e.AllowedStudents) > 0, Detail: fmt.Sprintf("%d allowed", len(e.AllowedStudents))},
		{Key: "duration", Label: "Duration", OK: e.DurationMinutes > 0, Detail: fmt.Sprintf("%d minutes", e.DurationMinutes)},
		{Key: "codes", Label: "Teacher codes", OK: e.Settings.CopyCode != "" && e.Settings.RefreshCode != "", Detail: "Copy code and refresh code"},
	}
}

func missingSetup(e *Exam) []string {
	var missing []string
	for _, check := range readiness(e) {
		if !check.OK {
			missing = append(missing, strings.ToLower(check.Label))
		}
	}
	return missing
}

// ensureSlices turns nil slices into empty ones so the frontend always gets arrays.
func ensureSlices(e *Exam) {
	if e.Questions == nil {
		e.Questions = []Question{}
	}
	for i := range e.Questions {
		q := &e.Questions[i]
		if q.Options == nil {
			q.Options = []string{}
		}
		if q.Correct == nil {
			q.Correct = []int{}
		}
		if q.Answers == nil {
			q.Answers = []string{}
		}
		if q.TestCases == nil {
			q.TestCases = []TestCase{}
		}
	}
	if e.Sets == nil {
		e.Sets = []QuestionSet{}
	}
	for i := range e.Sets {
		if e.Sets[i].ReusedIDs == nil {
			e.Sets[i].ReusedIDs = []string{}
		}
	}
	if e.AllowedStudents == nil {
		e.AllowedStudents = []string{}
	}
	if e.SharedWith == nil {
		e.SharedWith = []string{}
	}
	if e.Assignments == nil {
		e.Assignments = []Assignment{}
	}
	if e.Report.Buckets == nil {
		e.Report.Buckets = []BucketReport{}
	}
	if e.Report.Errors == nil {
		e.Report.Errors = []string{}
	}
	if e.Report.Warnings == nil {
		e.Report.Warnings = []string{}
	}
}

func respondBundle(ctx context.Context, c *gin.Context, e *Exam, extra gin.H) {
	started, err := attemptsCol().CountDocuments(ctx, bson.M{"exam_id": e.ID})
	if err != nil {
		respondErr(c, err)
		return
	}
	submitted, err := attemptsCol().CountDocuments(ctx, bson.M{"exam_id": e.ID, "status": AttemptSubmitted})
	if err != nil {
		respondErr(c, err)
		return
	}
	ensureSlices(e)
	body := gin.H{
		"exam":      e,
		"stats":     attemptStats{Started: started, InProgress: started - submitted, Submitted: submitted},
		"readiness": readiness(e),
		"access":    accessFor(ctx, c, e),
	}
	for key, value := range extra {
		body[key] = value
	}
	c.JSON(http.StatusOK, body)
}

type examSummary struct {
	ID              primitive.ObjectID `bson:"_id" json:"id"`
	Title           string             `bson:"title" json:"title"`
	Type            string             `bson:"type" json:"type"`
	Status          string             `bson:"status" json:"status"`
	DurationMinutes int                `bson:"duration_minutes" json:"duration_minutes"`
	PerSet          int                `bson:"per_set" json:"per_set"`
	QuestionCount   int                `bson:"question_count" json:"question_count"`
	SetCount        int                `bson:"set_count" json:"set_count"`
	StudentCount    int                `bson:"student_count" json:"student_count"`
	ContentLocked   bool               `bson:"content_locked" json:"content_locked"`
	OwnerID         primitive.ObjectID `bson:"owner_id" json:"-"`
	OwnerEmail      string             `bson:"owner_email" json:"owner_email"`
	OwnerName       string             `bson:"-" json:"owner_name"`
	Shared          bool               `bson:"-" json:"shared"` // shared with this teacher by its owner
	SharedCount     int                `bson:"shared_count" json:"shared_count"`
	CreatedAt       time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt       time.Time          `bson:"updated_at" json:"updated_at"`
	LiveAt          *time.Time         `bson:"live_at" json:"live_at"`
	Started         int                `bson:"-" json:"started"`
	Submitted       int                `bson:"-" json:"submitted"`
}

func sizeOf(field string) bson.M {
	return bson.M{"$size": bson.M{"$ifNull": bson.A{"$" + field, bson.A{}}}}
}

func listExams(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	user := userFrom(c)
	cursor, err := examsCol().Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: teacherExams(user)}},
		{{Key: "$sort", Value: bson.D{{Key: "updated_at", Value: -1}}}},
		{{Key: "$project", Value: bson.M{
			"title": 1, "type": 1, "status": 1, "duration_minutes": 1, "content_locked": 1,
			"created_at": 1, "updated_at": 1, "live_at": 1, "owner_id": 1, "owner_email": 1,
			"per_set":        "$blueprint.per_set",
			"question_count": sizeOf("questions"),
			"set_count":      sizeOf("sets"),
			"student_count":  sizeOf("allowed_students"),
			"shared_count":   sizeOf("shared_with"),
		}}},
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	summaries := []examSummary{}
	if err := cursor.All(ctx, &summaries); err != nil {
		respondErr(c, err)
		return
	}

	ids := make([]primitive.ObjectID, len(summaries))
	owners := []string{}
	for i, s := range summaries {
		ids[i] = s.ID
		if s.OwnerID != user.ID {
			summaries[i].Shared = true
			owners = append(owners, s.OwnerEmail)
		}
	}
	ownerNames := userNames(ctx, owners)
	for i := range summaries {
		if summaries[i].Shared {
			summaries[i].OwnerName = ownerNames[summaries[i].OwnerEmail]
		}
	}
	counts, err := attemptsCol().Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"exam_id": bson.M{"$in": ids}}}},
		{{Key: "$group", Value: bson.M{
			"_id":       "$exam_id",
			"started":   bson.M{"$sum": 1},
			"submitted": bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$status", AttemptSubmitted}}, 1, 0}}},
		}}},
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	var rows []struct {
		ID        primitive.ObjectID `bson:"_id"`
		Started   int                `bson:"started"`
		Submitted int                `bson:"submitted"`
	}
	if err := counts.All(ctx, &rows); err != nil {
		respondErr(c, err)
		return
	}
	byExam := map[primitive.ObjectID][2]int{}
	for _, r := range rows {
		byExam[r.ID] = [2]int{r.Started, r.Submitted}
	}
	for i := range summaries {
		n := byExam[summaries[i].ID]
		summaries[i].Started, summaries[i].Submitted = n[0], n[1]
	}
	c.JSON(http.StatusOK, gin.H{"exams": summaries})
}

func createExam(c *gin.Context) {
	var req struct {
		Type            string `json:"type"`
		Title           string `json:"title"`
		DurationMinutes int    `json:"duration_minutes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	examType := strings.ToLower(strings.TrimSpace(req.Type))
	if _, ok := questionTypes[examType]; !ok {
		respondErr(c, newError(http.StatusBadRequest, "Unknown exam type."))
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" || len([]rune(title)) > 120 {
		respondErr(c, newError(http.StatusBadRequest, "Give the exam a name (up to 120 characters)."))
		return
	}
	if req.DurationMinutes < 1 || req.DurationMinutes > 600 {
		respondErr(c, newError(http.StatusBadRequest, "Duration must be between 1 and 600 minutes."))
		return
	}

	user := userFrom(c)
	now := time.Now()
	exam := Exam{
		ID:              primitive.NewObjectID(),
		OwnerID:         user.ID,
		OwnerEmail:      user.Email,
		Type:            examType,
		Title:           title,
		Instructions:    defaultInstructions[examType],
		DurationMinutes: req.DurationMinutes,
		Status:          StatusDraft,
		Questions:       []Question{},
		Blueprint:       Blueprint{PerSet: defaultPerSet[examType]},
		AllowedStudents: []string{},
		Settings:        defaultSettings(examType),
		Version:         1,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	regenerateSets(&exam)

	ctx, cancel := dbCtx()
	defer cancel()
	if _, err := examsCol().InsertOne(ctx, exam); err != nil {
		respondErr(c, err)
		return
	}
	respondBundle(ctx, c, &exam, nil)
}

func getExam(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := loadExam(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	respondBundle(ctx, c, exam, nil)
}

type settingsPatch struct {
	ShuffleQuestions     *bool   `json:"shuffle_questions"`
	ShuffleOptions       *bool   `json:"shuffle_options"`
	ResultVisibility     *string `json:"result_visibility"`
	MultiScoring         *string `json:"multi_scoring"`
	MaxViolations        *int    `json:"max_violations"`
	RequireFullscreen    *bool   `json:"require_fullscreen"`
	RequireScreenShare   *bool   `json:"require_screen_share"`
	BlockExtendedDisplay *bool   `json:"block_extended_display"`
	LockOnRejoin         *bool   `json:"lock_on_rejoin"`
	ClearAnswersOnUnlock *bool   `json:"clear_answers_on_unlock"`
	CopyCode             *string `json:"copy_code"`
	RefreshCode          *string `json:"refresh_code"`
	AllowLeaving         *bool   `json:"allow_leaving"`
	AllowClipboard       *bool   `json:"allow_clipboard"`
	MaxRuns              *int    `json:"max_runs"`
}

func setBool(target *bool, value *bool) {
	if value != nil {
		*target = *value
	}
}

func patchExam(c *gin.Context) {
	var req struct {
		Title           *string        `json:"title"`
		Instructions    *string        `json:"instructions"`
		Context         *string        `json:"context"`
		DurationMinutes *int           `json:"duration_minutes"`
		Settings        *settingsPatch `json:"settings"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	durationChange := 0 // minutes the duration moved; the deadlines of students writing move with it
	exam, err := modifyExam(ctx, c, func(e *Exam) (bson.M, error) {
		durationChange = 0
		fields := bson.M{}
		if req.Title != nil {
			title := strings.TrimSpace(*req.Title)
			if title == "" || len([]rune(title)) > 120 {
				return nil, newError(http.StatusBadRequest, "Give the exam a name (up to 120 characters).")
			}
			e.Title, fields["title"] = title, title
		}
		if req.Instructions != nil {
			instructions := strings.TrimSpace(*req.Instructions)
			if len([]rune(instructions)) > 4000 {
				return nil, newError(http.StatusBadRequest, "Instructions can be at most 4000 characters.")
			}
			e.Instructions, fields["instructions"] = instructions, instructions
		}
		if req.Context != nil {
			sharedContext := strings.TrimRight(*req.Context, " \t\n")
			if runeLen(sharedContext) > maxContext {
				return nil, newError(http.StatusBadRequest, "The shared context can be at most %d characters.", maxContext)
			}
			if sharedContext != e.Context && !ownsExam(c, e) {
				return nil, ownerOnly("change its tables")
			}
			if e.ContentLocked && sharedContext != e.Context {
				return nil, errLocked
			}
			e.Context, fields["context"] = sharedContext, sharedContext
		}
		if req.DurationMinutes != nil {
			if *req.DurationMinutes < 1 || *req.DurationMinutes > 600 {
				return nil, newError(http.StatusBadRequest, "Duration must be between 1 and 600 minutes.")
			}
			durationChange = *req.DurationMinutes - e.DurationMinutes
			e.DurationMinutes, fields["duration_minutes"] = *req.DurationMinutes, *req.DurationMinutes
		}
		if patch := req.Settings; patch != nil {
			s := e.Settings
			setBool(&s.ShuffleQuestions, patch.ShuffleQuestions)
			setBool(&s.ShuffleOptions, patch.ShuffleOptions)
			setBool(&s.RequireFullscreen, patch.RequireFullscreen)
			setBool(&s.RequireScreenShare, patch.RequireScreenShare)
			setBool(&s.BlockExtendedDisplay, patch.BlockExtendedDisplay)
			setBool(&s.LockOnRejoin, patch.LockOnRejoin)
			setBool(&s.ClearAnswersOnUnlock, patch.ClearAnswersOnUnlock)
			setBool(&s.AllowLeaving, patch.AllowLeaving)
			setBool(&s.AllowClipboard, patch.AllowClipboard)
			if v := patch.MaxRuns; v != nil {
				if *v < 0 || *v > 200 {
					return nil, newError(http.StatusBadRequest, "Checks per question must be between 0 and 200 (0 means no limit).")
				}
				s.MaxRuns = *v
			}
			if v := patch.ResultVisibility; v != nil {
				if *v != VisibilityNone && *v != VisibilityScore && *v != VisibilityFull {
					return nil, newError(http.StatusBadRequest, "Result visibility must be none, score or full.")
				}
				s.ResultVisibility = *v
			}
			if v := patch.MultiScoring; v != nil {
				if *v != MultiStrict && *v != MultiNet {
					return nil, newError(http.StatusBadRequest, "Multi-select scoring must be strict or net.")
				}
				if e.ContentLocked && *v != s.MultiScoring {
					return nil, newError(http.StatusConflict, "Scoring can't change after students have started, or results would be inconsistent.")
				}
				s.MultiScoring = *v
			}
			if v := patch.MaxViolations; v != nil {
				if *v < 0 || *v > 20 {
					return nil, newError(http.StatusBadRequest, "Auto-submit must be after 0–20 violations (0 turns it off).")
				}
				s.MaxViolations = *v
			}
			if v := patch.CopyCode; v != nil {
				code, err := cleanCode(*v)
				if err != nil {
					return nil, newError(http.StatusBadRequest, "Copy code: %s", err.Error())
				}
				s.CopyCode = code
			}
			if v := patch.RefreshCode; v != nil {
				code, err := cleanCode(*v)
				if err != nil {
					return nil, newError(http.StatusBadRequest, "Refresh code: %s", err.Error())
				}
				s.RefreshCode = code
			}
			if s.CopyCode == s.RefreshCode {
				return nil, newError(http.StatusBadRequest, "The copy code and the refresh code must be different.")
			}
			e.Settings, fields["settings"] = s, s
		}
		if len(fields) == 0 {
			return nil, newError(http.StatusBadRequest, "Nothing to update.")
		}
		return fields, nil
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	if durationChange != 0 {
		if err := shiftLiveDeadlines(ctx, exam.ID, durationChange); err != nil {
			respondErr(c, newError(http.StatusInternalServerError, "The new duration is saved, but the deadlines of students already writing didn't move. Use Add time for everyone on the Live tab."))
			return
		}
	}
	respondBundle(ctx, c, exam, nil)
}

// shiftLiveDeadlines moves the deadline of everyone still writing by the change
// in the exam's duration, so editing the duration during an exam reaches the
// students who have started, like Add time does. Submitted sheets aren't
// touched, and a shorter duration never ends a sheet on the spot: no deadline
// moves earlier than a minute from now.
func shiftLiveDeadlines(ctx context.Context, examID primitive.ObjectID, minutes int) error {
	deadline := any(bson.M{"$add": bson.A{"$deadline_at", int64(minutes) * int64(time.Minute/time.Millisecond)}})
	if minutes < 0 {
		deadline = bson.M{"$max": bson.A{deadline, bson.M{"$min": bson.A{"$deadline_at", time.Now().Add(time.Minute)}}}}
	}
	_, err := attemptsCol().UpdateMany(ctx,
		bson.M{"exam_id": examID, "status": AttemptInProgress},
		mongo.Pipeline{{{Key: "$set", Value: bson.M{"deadline_at": deadline}}}})
	return err
}

func deleteExam(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := loadOwnExam(ctx, c, "delete it")
	if err != nil {
		respondErr(c, err)
		return
	}
	if _, err := attemptsCol().DeleteMany(ctx, bson.M{"exam_id": exam.ID}); err != nil {
		respondErr(c, err)
		return
	}
	if _, err := examsCol().DeleteOne(ctx, bson.M{"_id": exam.ID, "owner_id": exam.OwnerID}); err != nil {
		respondErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// duplicateExam copies the questions, blueprint and settings into a new draft,
// without students, attempts or the old codes. Handy for the next batch.
func duplicateExam(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	source, err := loadExam(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	now := time.Now()
	user := userFrom(c)
	copied := *source
	copied.ID = primitive.NewObjectID()
	copied.OwnerID, copied.OwnerEmail = user.ID, user.Email
	copied.SharedWith = []string{}
	copied.Title = truncateRunes("Copy of "+source.Title, 120)
	copied.Status = StatusDraft
	copied.AllowedStudents = []string{}
	copied.ContentLocked = false
	copied.Version = 1
	copied.CreatedAt, copied.UpdatedAt = now, now
	copied.LiveAt, copied.EndedAt = nil, nil
	copied.Settings.CopyCode, copied.Settings.RefreshCode = newCodePair()
	regenerateSets(&copied)
	if _, err := examsCol().InsertOne(ctx, copied); err != nil {
		respondErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": copied.ID})
}

func truncateRunes(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n])
}

func addQuestions(c *gin.Context) {
	var req struct {
		Questions []Question `json:"questions"`
		// From a sheet with the teacher's own sets: switch the exam to them, and
		// keep each set's schema and data.
		CustomSets  bool         `json:"custom_sets"`
		SetContexts []SetContext `json:"set_contexts"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Questions) == 0 {
		respondErr(c, newError(http.StatusBadRequest, "Send at least one question."))
		return
	}

	ctx, cancel := dbCtx()
	defer cancel()
	var cleaned []Question
	exam, err := modifyOwnExam(ctx, c, "change its questions", func(e *Exam) (bson.M, error) {
		if e.ContentLocked {
			return nil, errLocked
		}
		cleaned = make([]Question, 0, len(req.Questions))
		for i, q := range req.Questions {
			q.ID = ""
			clean, err := cleanQuestion(q, e.Type)
			if err != nil {
				if len(req.Questions) == 1 {
					return nil, newError(http.StatusBadRequest, "%s", err.Error())
				}
				return nil, newError(http.StatusBadRequest, "Question %d: %s", i+1, err.Error())
			}
			cleaned = append(cleaned, clean)
		}
		if len(e.Questions)+len(cleaned) > maxQuestions {
			return nil, newError(http.StatusBadRequest, "An exam can hold at most %d questions.", maxQuestions)
		}
		// An empty exam takes the kind of sets the new questions come with.
		if len(e.Questions) == 0 {
			e.Blueprint.Custom = req.CustomSets || (e.Blueprint.Custom && allHaveSets(cleaned))
			if !e.Blueprint.Custom {
				e.Blueprint.SetContexts = nil
				if e.Blueprint.PerSet < 1 {
					e.Blueprint.PerSet = defaultPerSet[e.Type]
				}
			}
		}
		if req.CustomSets && !e.Blueprint.Custom {
			for _, q := range e.Questions {
				if q.Set <= 0 {
					return nil, newError(http.StatusBadRequest, "This exam already has questions without a set number. Delete them first, or import a sheet without a set column.")
				}
			}
			e.Blueprint.Custom = true
		}
		if e.Blueprint.Custom {
			for i, q := range cleaned {
				if q.Set <= 0 {
					return nil, newError(http.StatusBadRequest, "Question %d has no set number. This exam uses your own sets, so every question needs one.", i+1)
				}
			}
			merged, err := mergeSetContexts(e.Blueprint.SetContexts, req.SetContexts)
			if err != nil {
				return nil, newError(http.StatusBadRequest, "%s", err.Error())
			}
			e.Blueprint.SetContexts = merged
		}
		e.Questions = append(e.Questions, cleaned...)
		regenerateSets(e)
		return contentFields(e), nil
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	respondBundle(ctx, c, exam, gin.H{"added": len(cleaned)})
}

func allHaveSets(questions []Question) bool {
	for _, q := range questions {
		if q.Set <= 0 {
			return false
		}
	}
	return true
}

func updateQuestion(c *gin.Context) {
	var req struct {
		Question Question `json:"question"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	questionID := c.Param("qid")
	req.Question.ID = questionID

	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := modifyOwnExam(ctx, c, "change its questions", func(e *Exam) (bson.M, error) {
		if e.ContentLocked {
			return nil, errLocked
		}
		clean, err := cleanQuestion(req.Question, e.Type)
		if err != nil {
			return nil, newError(http.StatusBadRequest, "%s", err.Error())
		}
		if e.Blueprint.Custom && clean.Set <= 0 {
			return nil, newError(http.StatusBadRequest, "Pick the set this question belongs to.")
		}
		for i := range e.Questions {
			if e.Questions[i].ID == questionID {
				e.Questions[i] = clean
				regenerateSets(e)
				return contentFields(e), nil
			}
		}
		return nil, newError(http.StatusNotFound, "Question not found.")
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	respondBundle(ctx, c, exam, nil)
}

func deleteQuestions(c *gin.Context) {
	var req struct {
		IDs []string `json:"ids"`
		All bool     `json:"all"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || (len(req.IDs) == 0 && !req.All) {
		respondErr(c, newError(http.StatusBadRequest, "Choose the questions to delete."))
		return
	}
	remove := map[string]bool{}
	for _, id := range req.IDs {
		remove[id] = true
	}

	ctx, cancel := dbCtx()
	defer cancel()
	deleted := 0
	exam, err := modifyOwnExam(ctx, c, "change its questions", func(e *Exam) (bson.M, error) {
		if e.ContentLocked {
			return nil, errLocked
		}
		kept := []Question{}
		for _, q := range e.Questions {
			if !req.All && !remove[q.ID] {
				kept = append(kept, q)
			}
		}
		deleted = len(e.Questions) - len(kept)
		e.Questions = kept
		regenerateSets(e)
		return contentFields(e), nil
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	respondBundle(ctx, c, exam, gin.H{"deleted": deleted})
}

// previewBlueprint shows what a blueprint would produce, without saving it.
func previewBlueprint(c *gin.Context) {
	var bp Blueprint
	if err := c.ShouldBindJSON(&bp); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid blueprint."))
		return
	}
	bp.PerSet = min(bp.PerSet, 200)
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := loadExam(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	var report GenReport
	if bp.Custom {
		_, report = CustomSets(exam.Questions, exam.Blueprint.SetContexts)
	} else {
		_, report = GenerateSets(exam.Questions, bp, newRNG())
	}
	c.JSON(http.StatusOK, gin.H{"report": report})
}

func saveBlueprint(c *gin.Context) {
	var bp Blueprint
	if err := c.ShouldBindJSON(&bp); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid blueprint."))
		return
	}
	if err := validateBlueprint(bp); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "%s", err.Error()))
		return
	}
	if !bp.UseDifficulty {
		bp.Easy, bp.Medium, bp.Hard = 0, 0, 0
	}
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := modifyExam(ctx, c, func(e *Exam) (bson.M, error) {
		if e.ContentLocked {
			return nil, errLocked
		}
		if bp.Custom && !allHaveSets(e.Questions) {
			return nil, newError(http.StatusBadRequest, "Some questions have no set number. Give every question a set before using your own sets.")
		}
		if bp.SetContexts == nil || !ownsExam(c, e) {
			bp.SetContexts = e.Blueprint.SetContexts // switching back and forth keeps each set's schema
		}
		if bp.PerSet < 1 {
			bp.PerSet = defaultPerSet[e.Type]
		}
		e.Blueprint = bp
		regenerateSets(e)
		return contentFields(e), nil
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	respondBundle(ctx, c, exam, nil)
}

// reshuffleSets deals the same questions into fresh random sets.
func reshuffleSets(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := modifyExam(ctx, c, func(e *Exam) (bson.M, error) {
		if e.ContentLocked {
			return nil, errLocked
		}
		regenerateSets(e)
		return contentFields(e), nil
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	respondBundle(ctx, c, exam, nil)
}

func addStudents(c *gin.Context) {
	var req struct {
		Emails []string `json:"emails"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	var valid, invalid []string
	for _, raw := range req.Emails {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		if email, ok := normalizeEmail(raw); ok {
			valid = append(valid, email)
		} else {
			invalid = append(invalid, strings.TrimSpace(raw))
		}
	}
	if len(valid) == 0 {
		respondErr(c, newError(http.StatusBadRequest, "No valid email addresses found. Add students by their full email, like n210368@rguktn.ac.in."))
		return
	}

	ctx, cancel := dbCtx()
	defer cancel()
	added, already := 0, 0
	exam, err := modifyExam(ctx, c, func(e *Exam) (bson.M, error) {
		added, already = 0, 0
		existing := make(map[string]bool, len(e.AllowedStudents))
		for _, email := range e.AllowedStudents {
			existing[email] = true
		}
		var fresh []string
		for _, email := range valid {
			if existing[email] {
				already++
				continue
			}
			existing[email] = true
			fresh = append(fresh, email)
		}
		if len(e.AllowedStudents)+len(fresh) > maxStudents {
			return nil, newError(http.StatusBadRequest, "An exam can have at most %d students.", maxStudents)
		}
		e.AllowedStudents = append(e.AllowedStudents, fresh...)
		sort.Strings(e.AllowedStudents)
		if !e.ContentLocked {
			e.Assignments = dealSets(e.AllowedStudents, e.Sets)
		} else {
			// Students already writing keep their sets; newcomers join the emptiest set.
			for _, email := range fresh {
				e.Assignments = append(e.Assignments, Assignment{Email: email, Set: leastAssignedSet(e)})
			}
		}
		added = len(fresh)
		return bson.M{"allowed_students": e.AllowedStudents, "assignments": e.Assignments}, nil
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	if invalid == nil {
		invalid = []string{}
	}
	respondBundle(ctx, c, exam, gin.H{"added": added, "already": already, "invalid": invalid})
}

func removeStudents(c *gin.Context) {
	var req struct {
		Emails []string `json:"emails"`
		All    bool     `json:"all"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || (len(req.Emails) == 0 && !req.All) {
		respondErr(c, newError(http.StatusBadRequest, "Choose the students to remove."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()

	examID, err := idParam(c, "id")
	if err != nil {
		respondErr(c, err)
		return
	}
	startedEmails, err := attemptsCol().Distinct(ctx, "student_email", bson.M{"exam_id": examID})
	if err != nil {
		respondErr(c, err)
		return
	}
	started := map[string]bool{}
	for _, v := range startedEmails {
		if email, ok := v.(string); ok {
			started[email] = true
		}
	}
	requested := map[string]bool{}
	for _, raw := range req.Emails {
		if email, ok := normalizeEmail(raw); ok {
			requested[email] = true
		}
	}

	removed := 0
	kept := []string{}
	exam, err := modifyExam(ctx, c, func(e *Exam) (bson.M, error) {
		removed, kept = 0, []string{}
		remaining := []string{}
		for _, email := range e.AllowedStudents {
			switch {
			case !req.All && !requested[email]:
				remaining = append(remaining, email)
			case started[email]:
				// Students who already started stay, so their attempt keeps a home.
				remaining = append(remaining, email)
				kept = append(kept, email)
			default:
				removed++
			}
		}
		e.AllowedStudents = remaining
		if !e.ContentLocked {
			e.Assignments = dealSets(e.AllowedStudents, e.Sets)
		} else {
			stillAllowed := map[string]bool{}
			for _, email := range remaining {
				stillAllowed[email] = true
			}
			assignments := []Assignment{}
			for _, a := range e.Assignments {
				if stillAllowed[a.Email] {
					assignments = append(assignments, a)
				}
			}
			e.Assignments = assignments
		}
		return bson.M{"allowed_students": e.AllowedStudents, "assignments": e.Assignments}, nil
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	respondBundle(ctx, c, exam, gin.H{"removed": removed, "kept": kept})
}

var statusMoves = map[string][]string{
	StatusDraft: {StatusReady, StatusLive},
	StatusReady: {StatusDraft, StatusLive},
	StatusLive:  {StatusEnded},
	StatusEnded: {StatusLive},
}

func setStatus(c *gin.Context) {
	var req struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := modifyExam(ctx, c, func(e *Exam) (bson.M, error) {
		if e.Status == req.Status {
			return bson.M{"status": e.Status}, nil
		}
		allowed := false
		for _, next := range statusMoves[e.Status] {
			allowed = allowed || next == req.Status
		}
		if !allowed {
			return nil, newError(http.StatusBadRequest, "An exam can't go from %s to %s.", e.Status, req.Status)
		}
		if req.Status == StatusReady || req.Status == StatusLive {
			if missing := missingSetup(e); len(missing) > 0 {
				return nil, newError(http.StatusBadRequest, "Finish setting up first: %s", strings.Join(missing, ", "))
			}
		}
		now := time.Now()
		fields := bson.M{"status": req.Status}
		switch req.Status {
		case StatusLive:
			e.LiveAt, e.EndedAt = &now, nil
			fields["live_at"], fields["ended_at"] = now, nil
		case StatusEnded:
			e.EndedAt = &now
			fields["ended_at"] = now
		}
		e.Status = req.Status
		return fields, nil
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	if exam.Status == StatusEnded {
		// Ending the exam hands in everyone who is still writing, with what they saved.
		cursor, err := attemptsCol().Find(ctx, bson.M{"exam_id": exam.ID, "status": AttemptInProgress})
		if err == nil {
			var open []*Attempt
			if err = cursor.All(ctx, &open); err == nil {
				err = finalizeAttempts(ctx, exam, open, "exam_ended")
			}
		}
		if err != nil {
			respondErr(c, err)
			return
		}
	}
	respondBundle(ctx, c, exam, nil)
}

func regenerateCodes(c *gin.Context) {
	var req struct {
		Which string `json:"which"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := modifyExam(ctx, c, func(e *Exam) (bson.M, error) {
		s := e.Settings
		switch req.Which {
		case "copy":
			for s.CopyCode = newCode(); s.CopyCode == s.RefreshCode; s.CopyCode = newCode() {
			}
		case "refresh":
			for s.RefreshCode = newCode(); s.RefreshCode == s.CopyCode; s.RefreshCode = newCode() {
			}
		default:
			s.CopyCode, s.RefreshCode = newCodePair()
		}
		e.Settings = s
		return bson.M{"settings": s}, nil
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	respondBundle(ctx, c, exam, nil)
}
