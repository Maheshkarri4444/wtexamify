package exams

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// A student counts as offline when their browser hasn't checked in for this long.
const offlineAfter = 45 * time.Second

type monitorRow struct {
	Email           string      `json:"email"`
	Name            string      `json:"name"`
	Roll            string      `json:"roll"`
	Set             int         `json:"set"`
	Allowed         bool        `json:"allowed"`
	AttemptID       string      `json:"attempt_id"`
	Status          string      `json:"status"` // not_started, in_progress or submitted
	Locked          bool        `json:"locked"`
	LockReason      string      `json:"lock_reason"`
	Online          bool        `json:"online"`
	Answered        int         `json:"answered"`
	Total           int         `json:"total"`
	Violations      int         `json:"violations"`
	ClipboardBlocks int         `json:"clipboard_blocks"`
	Refreshes       int         `json:"refreshes"`
	CodeFailures    int         `json:"code_failures"`
	Flags           ClientFlags `json:"flags"`
	StartedAt       *time.Time  `json:"started_at"`
	DeadlineAt      *time.Time  `json:"deadline_at"`
	LastSeenAt      *time.Time  `json:"last_seen_at"`
	SubmittedAt     *time.Time  `json:"submitted_at"`
	SubmitReason    string      `json:"submit_reason"`
	Score           *float64    `json:"score"`
	MaxScore        *float64    `json:"max_score"`
	Percent         *float64    `json:"percent"`
	Runs            int         `json:"runs"`
	Grading         string      `json:"grading"`
}

func studentNames(ctx context.Context, emails []string) map[string]string {
	names := map[string]string{}
	if len(emails) == 0 {
		return names
	}
	cursor, err := usersCol().Find(ctx, bson.M{"email": bson.M{"$in": emails}}, options.Find().SetProjection(bson.M{"email": 1, "name": 1}))
	if err != nil {
		return names
	}
	var users []struct {
		Email string `bson:"email"`
		Name  string `bson:"name"`
	}
	if cursor.All(ctx, &users) == nil {
		for _, u := range users {
			names[u.Email] = u.Name
		}
	}
	return names
}

func attemptsFor(ctx context.Context, e *Exam, projection bson.M) ([]*Attempt, error) {
	cursor, err := attemptsCol().Find(ctx, bson.M{"exam_id": e.ID}, options.Find().SetProjection(projection))
	if err != nil {
		return nil, err
	}
	var attempts []*Attempt
	err = cursor.All(ctx, &attempts)
	return attempts, err
}

func rowFor(email, name string, set int, allowed bool, att *Attempt, now time.Time) monitorRow {
	row := monitorRow{Email: email, Name: name, Roll: rollNumber(email), Set: set, Allowed: allowed, Status: "not_started"}
	if att == nil {
		return row
	}
	if att.StudentName != "" {
		row.Name = att.StudentName
	}
	row.AttemptID = att.ID.Hex()
	row.Status = att.Status
	row.Set = att.SetNumber
	row.Locked, row.LockReason = att.Locked, att.LockReason
	row.Answered, row.Total = att.AnsweredCount, len(att.QuestionIDs)
	row.Violations, row.ClipboardBlocks, row.Refreshes, row.CodeFailures = att.Violations, att.ClipboardBlocks, att.Refreshes, att.CodeFailures
	row.Flags = att.Flags
	row.StartedAt, row.DeadlineAt, row.LastSeenAt = &att.StartedAt, &att.DeadlineAt, &att.LastSeenAt
	row.SubmittedAt, row.SubmitReason = att.SubmittedAt, att.SubmitReason
	row.Runs, row.Grading = att.RunCount, att.Grading
	row.Online = att.Status == AttemptInProgress && now.Sub(att.LastSeenAt) < offlineAfter
	if att.Status == AttemptSubmitted {
		score, maxScore, pct := att.Score, att.MaxScore, percent(att.Score, att.MaxScore)
		row.Score, row.MaxScore, row.Percent = &score, &maxScore, &pct
	}
	return row
}

// monitor is the live invigilation view: every allowed student and where they are.
func monitor(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := loadOwnedExam(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	attempts, err := attemptsFor(ctx, exam, bson.M{"answers": 0, "events": 0, "option_order": 0, "results": 0})
	if err != nil {
		respondErr(c, err)
		return
	}
	byEmail := map[string]*Attempt{}
	for _, att := range attempts {
		byEmail[att.StudentEmail] = att
	}
	names := studentNames(ctx, exam.AllowedStudents)
	sets := map[string]int{}
	for _, a := range exam.Assignments {
		sets[a.Email] = a.Set
	}

	now := time.Now()
	rows := []monitorRow{}
	allowed := map[string]bool{}
	for _, email := range exam.AllowedStudents {
		allowed[email] = true
		rows = append(rows, rowFor(email, names[email], sets[email], true, byEmail[email], now))
	}
	for _, att := range attempts {
		if !allowed[att.StudentEmail] {
			rows = append(rows, rowFor(att.StudentEmail, att.StudentName, att.SetNumber, false, att, now))
		}
	}

	summary := map[string]int{"allowed": len(exam.AllowedStudents)}
	for _, row := range rows {
		switch {
		case row.Status == AttemptSubmitted:
			summary["submitted"]++
		case row.Status == AttemptInProgress && row.Locked:
			summary["locked"]++
			summary["in_progress"]++
		case row.Status == AttemptInProgress:
			summary["writing"]++
			summary["in_progress"]++
		default:
			summary["not_started"]++
		}
		if row.Status == AttemptInProgress && !row.Online {
			summary["offline"]++
		}
	}
	c.JSON(http.StatusOK, gin.H{"rows": rows, "summary": summary, "server_now": now})
}

type questionStats struct {
	ID           string   `json:"id"`
	Number       int      `json:"number"`
	Type         string   `json:"type"`
	Text         string   `json:"text"`
	Difficulty   string   `json:"difficulty"`
	Marks        float64  `json:"marks"`
	Options      []string `json:"options"`
	Correct      []int    `json:"correct"`
	Answers      []string `json:"answers"`
	Shown        int      `json:"shown"`
	CorrectCount int      `json:"correct_count"`
	Partial      int      `json:"partial"`
	Wrong        int      `json:"wrong"`
	Unanswered   int      `json:"unanswered"`
	Pending      int      `json:"pending"` // code answers the AI hasn't checked yet
	AvgAwarded   float64  `json:"avg_awarded"`
	OptionCounts []int    `json:"option_counts"`
	Language     string   `json:"language,omitempty"`
	AvgPercent   *float64 `json:"avg_percent"` // code questions: mean AI correctness
	awardedSum   float64
	percentSum   float64
	percentCount int
}

// results lists every attempt with its score, plus how each question performed.
func results(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := loadOwnedExam(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	attempts, err := attemptsFor(ctx, exam, bson.M{"events": 0, "option_order": 0})
	if err != nil {
		respondErr(c, err)
		return
	}

	stats := map[string]*questionStats{}
	ordered := []*questionStats{}
	for i, q := range exam.Questions {
		s := &questionStats{ID: q.ID, Number: i + 1, Type: q.Type, Text: q.Text, Difficulty: q.Difficulty, Marks: q.Marks,
			Options: q.Options, Correct: q.Correct, Answers: q.Answers, OptionCounts: make([]int, len(q.Options)), Language: q.Language}
		stats[q.ID] = s
		ordered = append(ordered, s)
	}

	now := time.Now()
	rows := []monitorRow{}
	var percents []float64
	for _, att := range attempts {
		row := rowFor(att.StudentEmail, att.StudentName, att.SetNumber, true, att, now)
		rows = append(rows, row)
		if att.Status != AttemptSubmitted {
			continue
		}
		percents = append(percents, *row.Percent)
		for _, r := range att.Results {
			s, ok := stats[r.QuestionID]
			if !ok {
				continue
			}
			s.Shown++
			s.awardedSum += r.Awarded
			if r.Percent != nil {
				s.percentSum += float64(*r.Percent)
				s.percentCount++
			}
			switch r.Status {
			case ResultCorrect:
				s.CorrectCount++
			case ResultPartial:
				s.Partial++
			case ResultWrong:
				s.Wrong++
			case ResultPending:
				s.Pending++
			case ResultNotGraded:
			default:
				s.Unanswered++
			}
			for _, picked := range att.Answers[r.QuestionID].Selected {
				if picked >= 0 && picked < len(s.OptionCounts) {
					s.OptionCounts[picked]++
				}
			}
		}
	}
	for _, s := range ordered {
		if s.Shown > 0 {
			s.AvgAwarded = round2(s.awardedSum / float64(s.Shown))
		}
		if s.percentCount > 0 {
			avg := round2(s.percentSum / float64(s.percentCount))
			s.AvgPercent = &avg
		}
		if s.Options == nil {
			s.Options = []string{}
		}
		if s.Correct == nil {
			s.Correct = []int{}
		}
		if s.Answers == nil {
			s.Answers = []string{}
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Email < rows[j].Email })

	summary := gin.H{"submitted": len(percents), "attempts": len(attempts), "allowed": len(exam.AllowedStudents)}
	if len(percents) > 0 {
		sort.Float64s(percents)
		total := 0.0
		for _, p := range percents {
			total += p
		}
		middle := len(percents) / 2
		median := percents[middle]
		if len(percents)%2 == 0 {
			median = (percents[middle-1] + percents[middle]) / 2
		}
		summary["average"] = round2(total / float64(len(percents)))
		summary["median"] = round2(median)
		summary["highest"] = percents[len(percents)-1]
		summary["lowest"] = percents[0]
		summary["distribution"] = distribution(percents)
	}
	c.JSON(http.StatusOK, gin.H{"rows": rows, "questions": ordered, "summary": summary})
}

// distribution buckets percentages into ten bands: 0–9, 10–19, ... 90–100.
func distribution(percents []float64) []int {
	bands := make([]int, 10)
	for _, p := range percents {
		band := int(p / 10)
		if band > 9 {
			band = 9
		}
		if band < 0 {
			band = 0
		}
		bands[band]++
	}
	return bands
}

type reviewQuestion struct {
	Number       int      `json:"number"`
	ID           string   `json:"id"`
	Type         string   `json:"type"`
	Text         string   `json:"text"`
	Difficulty   string   `json:"difficulty"`
	Options      []string `json:"options"`
	DisplayOrder []int    `json:"display_order"`
	Correct      []int    `json:"correct"`
	Accepted     []string `json:"accepted"`
	Selected     []int    `json:"selected"`
	AnswerText   string   `json:"answer_text"`
	Marked       bool     `json:"marked"`
	Status       string   `json:"status"`
	Awarded      float64  `json:"awarded"`
	Max          float64  `json:"max"`
	Auto         float64  `json:"auto"`
	Overridden   bool     `json:"overridden"`
	// Code questions.
	Language    string      `json:"language,omitempty"`
	Code        string      `json:"code,omitempty"`
	Solution    string      `json:"solution,omitempty"`
	StarterCode string      `json:"starter_code,omitempty"`
	TestCases   []TestCase  `json:"test_cases,omitempty"`
	Percent     *int        `json:"percent"`
	Run         *runSummary `json:"run"`
}

// runSummary is the latest AI check of a student's code, for the teacher.
type runSummary struct {
	Percent int           `json:"percent"`
	Tests   []TestOutcome `json:"tests"`
	Count   int           `json:"count"`
	At      time.Time     `json:"at"`
	Current bool          `json:"current"` // false if the student changed the code after this check
	Model   string        `json:"model"`
}

// attemptDetail is one student's paper with their answers against the key.
func attemptDetail(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := loadOwnedExam(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	att, err := loadAttemptForExam(ctx, exam.ID, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	byID := questionMap(exam)
	stored := map[string]QuestionResult{}
	for _, r := range att.Results {
		stored[r.QuestionID] = r
	}
	items := []reviewQuestion{}
	for i, id := range att.QuestionIDs {
		q, ok := byID[id]
		if !ok {
			continue
		}
		answer := att.Answers[id]
		var run *RunResult
		if r, ok := att.Runs[id]; ok {
			run = &r
		}
		result, graded := stored[id]
		if !graded {
			// Still writing: show how the answers would score right now.
			result = GradeQuestion(q, answer, run, exam.Settings.MultiScoring)
			result.Auto = result.Awarded
			if marks, ok := att.Overrides[id]; ok {
				result.Awarded, result.Overridden = marks, true
			}
		}
		selected := answer.Selected
		if selected == nil {
			selected = []int{}
		}
		order := att.OptionOrder[id]
		if order == nil {
			order = []int{}
		}
		item := reviewQuestion{
			Number: i + 1, ID: id, Type: q.Type, Text: q.Text, Difficulty: q.Difficulty,
			Options: q.Options, DisplayOrder: order, Correct: q.Correct, Accepted: q.Answers,
			Selected: selected, AnswerText: answer.Text, Marked: answer.Marked,
			Status: result.Status, Awarded: result.Awarded, Max: result.Max, Auto: result.Auto, Overridden: result.Overridden,
			Percent: result.Percent,
		}
		if q.Type == QCode {
			item.Language, item.Code, item.Solution, item.StarterCode, item.TestCases = answerLanguage(q, answer), answer.Code, q.Solution, q.StarterCode, q.TestCases
			if run != nil {
				item.Run = &runSummary{Percent: run.Percent, Tests: run.Tests, Count: run.Count, At: run.At, Model: run.Model,
					Current: run.CodeHash == codeHash(answerLanguage(q, answer), answer.Code)}
			}
		}
		items = append(items, item)
	}
	now := time.Now()
	row := rowFor(att.StudentEmail, att.StudentName, att.SetNumber, true, att, now)
	if att.Events == nil {
		att.Events = []Event{}
	}
	c.JSON(http.StatusOK, gin.H{"student": row, "events": att.Events, "items": items, "user_agent": att.UserAgent, "grading": att.Grading})
}

// setMarks lets the teacher replace the automatic marks for one answer (or
// clear their override with marks: null). The total is recalculated.
func setMarks(c *gin.Context) {
	var req struct {
		QuestionID string   `json:"question_id"`
		Marks      *float64 `json:"marks"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := loadOwnedExam(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	att, err := loadAttemptForExam(ctx, exam.ID, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	byID := questionMap(exam)
	q, ok := byID[req.QuestionID]
	if !ok || !paperHas(att, req.QuestionID) {
		respondErr(c, newError(http.StatusBadRequest, "That question isn't on this student's paper."))
		return
	}
	if q.Type == QDescriptive {
		respondErr(c, newError(http.StatusBadRequest, "Internal questions aren't marked in Examify."))
		return
	}
	if att.Overrides == nil {
		att.Overrides = map[string]float64{}
	}
	if req.Marks == nil {
		delete(att.Overrides, req.QuestionID)
	} else {
		if *req.Marks < 0 || *req.Marks > q.Marks {
			respondErr(c, newError(http.StatusBadRequest, "Marks must be between 0 and %s.", formatMarks(q.Marks)))
			return
		}
		att.Overrides[req.QuestionID] = round2(*req.Marks)
	}
	set := bson.M{"overrides": att.Overrides}
	if att.Status == AttemptSubmitted {
		score, maxScore, results, _ := GradeAttempt(byID, att, exam.Settings.MultiScoring)
		set["score"], set["max_score"], set["results"] = score, maxScore, results
	}
	if _, err := attemptsCol().UpdateOne(ctx, bson.M{"_id": att.ID}, bson.M{"$set": set}); err != nil {
		respondErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func formatMarks(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

// attemptAction lets the teacher help or act on one student from the dashboard.
func attemptAction(c *gin.Context) {
	var req struct {
		Action  string `json:"action"`
		Minutes int    `json:"minutes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := loadOwnedExam(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	att, err := loadAttemptForExam(ctx, exam.ID, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	if req.Action == "regrade" {
		// Check every code answer again from scratch, for example after the AI was down.
		if exam.Type != TypeExternal || att.Status != AttemptSubmitted {
			respondErr(c, newError(http.StatusBadRequest, "Only submitted external exams can be checked again."))
			return
		}
		_, err := attemptsCol().UpdateOne(ctx, bson.M{"_id": att.ID, "status": AttemptSubmitted}, bson.M{"$set": bson.M{
			"runs": map[string]RunResult{}, "grading": GradingPending, "grading_tries": 0,
		}})
		if err != nil {
			respondErr(c, err)
			return
		}
		queueGrading(att.ID)
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	if att.Status != AttemptInProgress {
		respondErr(c, newError(http.StatusConflict, "This student has already submitted."))
		return
	}
	now := time.Now()
	inProgress := bson.M{"_id": att.ID, "status": AttemptInProgress}
	var update bson.M
	switch req.Action {
	case "unlock":
		update = bson.M{
			"$set":  bson.M{"locked": false, "lock_reason": "", "code_failures": 0, "code_blocked_until": nil},
			"$push": bson.M{"events": eventPush(Event{At: now, Type: "teacher_unlock", Detail: "Unlocked from the dashboard"})},
		}
	case "new_set":
		rng := newRNG()
		next := pickOtherSet(exam, att.SetNumber, rng)
		ids, order := buildPaper(exam, next, rng)
		update = bson.M{
			"$set": bson.M{
				"set_number": next, "question_ids": ids, "option_order": order,
				"answers": map[string]Answer{}, "answered_count": 0, "runs": map[string]RunResult{}, "locked": false, "lock_reason": "",
			},
			"$inc":  bson.M{"paper_version": 1, "refreshes": 1},
			"$push": bson.M{"events": eventPush(Event{At: now, Type: "teacher_new_set", Detail: setChange(att.SetNumber, next)})},
		}
	case "extend":
		if req.Minutes < 1 || req.Minutes > 120 {
			respondErr(c, newError(http.StatusBadRequest, "Add between 1 and 120 minutes."))
			return
		}
		update = bson.M{
			"$set":  bson.M{"deadline_at": att.DeadlineAt.Add(time.Duration(req.Minutes) * time.Minute)},
			"$push": bson.M{"events": eventPush(Event{At: now, Type: "time_added", Detail: minutesLabel(req.Minutes)})},
		}
	case "submit":
		if err := finalizeAttempts(ctx, exam, []*Attempt{att}, "teacher"); err != nil {
			respondErr(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	default:
		respondErr(c, newError(http.StatusBadRequest, "Unknown action."))
		return
	}
	if _, err := attemptsCol().UpdateOne(ctx, inProgress, update); err != nil {
		respondErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// extendAll adds time for everyone who is still writing.
func extendAll(c *gin.Context) {
	var req struct {
		Minutes int `json:"minutes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Minutes < 1 || req.Minutes > 120 {
		respondErr(c, newError(http.StatusBadRequest, "Add between 1 and 120 minutes."))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	exam, err := loadOwnedExam(ctx, c)
	if err != nil {
		respondErr(c, err)
		return
	}
	res, err := attemptsCol().UpdateMany(ctx,
		bson.M{"exam_id": exam.ID, "status": AttemptInProgress},
		mongo.Pipeline{{{Key: "$set", Value: bson.M{
			"deadline_at": bson.M{"$add": bson.A{"$deadline_at", int64(req.Minutes) * int64(time.Minute/time.Millisecond)}},
		}}}})
	if err != nil {
		respondErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"extended": res.ModifiedCount})
}
