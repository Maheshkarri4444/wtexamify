// Package exams is the Examify 2.0 exam engine: question bank, set generation,
// student assignment, proctored attempts and grading. Viva is the first exam
// type built on it; internal and external exams will reuse the same pieces.
package exams

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	TypeViva     = "viva"
	TypeInternal = "internal"
	TypeExternal = "external"

	StatusDraft = "draft" // only the teacher sees it
	StatusReady = "ready" // published: students see it as upcoming
	StatusLive  = "live"  // students can start
	StatusEnded = "ended" // no new starts; unfinished attempts are submitted

	QMCQSingle   = "mcq_single"
	QMCQMulti    = "mcq_multi"
	QFill        = "fill"
	QDescriptive = "descriptive" // internal: shown on the paper, answered outside Examify
	QCode        = "code"        // external: answered in the editor, checked by AI

	// LangAny lets the student pick the language for a code question.
	LangAny = "any"

	DiffEasy   = "easy"
	DiffMedium = "medium"
	DiffHard   = "hard"

	AttemptInProgress = "in_progress"
	AttemptSubmitted  = "submitted"

	ResultCorrect    = "correct"
	ResultPartial    = "partial"
	ResultWrong      = "wrong"
	ResultUnanswered = "unanswered"
	ResultPending    = "pending"    // a code answer still waiting for its AI check
	ResultNotGraded  = "not_graded" // internal questions aren't marked in Examify

	// Grading of an external attempt after submit.
	GradingPending = "pending"
	GradingDone    = "done"
	GradingFailed  = "failed"

	// Multi-select scoring. Strict: any wrong option scores 0, otherwise marks are
	// proportional to the correct options picked. Net: wrong picks cancel right ones.
	MultiStrict = "strict"
	MultiNet    = "net"

	VisibilityNone  = "none"
	VisibilityScore = "score"
	VisibilityFull  = "full"
)

type Question struct {
	ID         string   `bson:"id" json:"id"`
	Type       string   `bson:"type" json:"type"`
	Text       string   `bson:"text" json:"text"`
	Options    []string `bson:"options" json:"options"`
	Correct    []int    `bson:"correct" json:"correct"` // option indexes, for MCQs
	Answers    []string `bson:"answers" json:"answers"` // accepted answers, for fill in the blank
	Difficulty string   `bson:"difficulty" json:"difficulty"`
	Marks      float64  `bson:"marks" json:"marks"`
	// Set is the teacher's own set number, used when the exam has custom sets.
	Set int `bson:"set,omitempty" json:"set"`
	// Context is reference material for this question alone, such as the tables
	// and rows it is about. Students see it, and the AI checks against it.
	Context string `bson:"context,omitempty" json:"context"`
	// Code questions only. Solution and hidden test cases never reach students.
	Language    string     `bson:"language,omitempty" json:"language"`
	Solution    string     `bson:"solution,omitempty" json:"solution"`
	StarterCode string     `bson:"starter_code,omitempty" json:"starter_code"`
	TestCases   []TestCase `bson:"test_cases,omitempty" json:"test_cases"`
}

type TestCase struct {
	ID     string `bson:"id" json:"id"`
	Input  string `bson:"input" json:"input"`
	Output string `bson:"output" json:"output"`
	// Hidden marks a private test: students see whether it passes, and its
	// contents only once their code fails it (as on LeetCode).
	Hidden bool `bson:"hidden" json:"hidden"`
}

// Blueprint describes what every set looks like. With Custom, the sets are the
// teacher's own: each question says which set it belongs to, and a set can
// come with its own reference material (SetContexts).
type Blueprint struct {
	PerSet        int          `bson:"per_set" json:"per_set"`
	UseDifficulty bool         `bson:"use_difficulty" json:"use_difficulty"`
	Easy          int          `bson:"easy" json:"easy"`
	Medium        int          `bson:"medium" json:"medium"`
	Hard          int          `bson:"hard" json:"hard"`
	Custom        bool         `bson:"custom" json:"custom"`
	SetContexts   []SetContext `bson:"set_contexts,omitempty" json:"set_contexts"`
}

// SetContext is reference material (tables, rows, notes) for one custom set.
type SetContext struct {
	Number  int    `bson:"number" json:"number"`
	Context string `bson:"context" json:"context"`
}

type QuestionSet struct {
	Number      int      `bson:"number" json:"number"`
	QuestionIDs []string `bson:"question_ids" json:"question_ids"`
	ReusedIDs   []string `bson:"reused_ids" json:"reused_ids"` // questions that also appear in an earlier set
	Context     string   `bson:"context,omitempty" json:"context"`
}

type BucketReport struct {
	Difficulty  string `bson:"difficulty" json:"difficulty"` // "any" when difficulty isn't used
	Pool        int    `bson:"pool" json:"pool"`
	PerSet      int    `bson:"per_set" json:"per_set"`
	Untagged    int    `bson:"untagged" json:"untagged"`
	ReusedSlots int    `bson:"reused_slots" json:"reused_slots"`
}

type GenReport struct {
	OK              bool           `bson:"ok" json:"ok"`
	SetCount        int            `bson:"set_count" json:"set_count"`
	FullyUniqueSets int            `bson:"fully_unique_sets" json:"fully_unique_sets"`
	ReusedSlots     int            `bson:"reused_slots" json:"reused_slots"`
	Buckets         []BucketReport `bson:"buckets" json:"buckets"`
	Errors          []string       `bson:"errors" json:"errors"`
	Warnings        []string       `bson:"warnings" json:"warnings"`
}

type Assignment struct {
	Email string `bson:"email" json:"email"`
	Set   int    `bson:"set" json:"set"`
}

type Settings struct {
	ShuffleQuestions     bool   `bson:"shuffle_questions" json:"shuffle_questions"`
	ShuffleOptions       bool   `bson:"shuffle_options" json:"shuffle_options"`
	ResultVisibility     string `bson:"result_visibility" json:"result_visibility"` // no longer shown to students: scores stay with the teacher
	MultiScoring         string `bson:"multi_scoring" json:"multi_scoring"`
	MaxViolations        int    `bson:"max_violations" json:"max_violations"` // 0 = never auto-submit
	RequireFullscreen    bool   `bson:"require_fullscreen" json:"require_fullscreen"`
	RequireScreenShare   bool   `bson:"require_screen_share" json:"require_screen_share"`
	BlockExtendedDisplay bool   `bson:"block_extended_display" json:"block_extended_display"`
	LockOnRejoin         bool   `bson:"lock_on_rejoin" json:"lock_on_rejoin"`
	ClearAnswersOnUnlock bool   `bson:"clear_answers_on_unlock" json:"clear_answers_on_unlock"`
	CopyCode             string `bson:"copy_code" json:"copy_code"`       // unlocks a locked student
	RefreshCode          string `bson:"refresh_code" json:"refresh_code"` // gives a student a new set
	// Phrased as permissions so exams saved before these existed keep the strict behaviour.
	AllowLeaving   bool `bson:"allow_leaving" json:"allow_leaving"`     // switching tabs doesn't lock (internals: students code in their own IDE)
	AllowClipboard bool `bson:"allow_clipboard" json:"allow_clipboard"` // copy and paste aren't blocked
	MaxRuns        int  `bson:"max_runs" json:"max_runs"`               // AI checks per code question; 0 = no limit
}

type Exam struct {
	ID         primitive.ObjectID `bson:"_id" json:"id"`
	OwnerID    primitive.ObjectID `bson:"owner_id" json:"owner_id"`
	OwnerEmail string             `bson:"owner_email" json:"owner_email"`
	// SharedWith are the other teachers (lowercase emails) who see this exam on
	// their dashboard and can run it like the owner, except change its questions.
	SharedWith   []string `bson:"shared_with,omitempty" json:"shared_with"`
	Type         string   `bson:"type" json:"type"`
	Title        string   `bson:"title" json:"title"`
	Instructions string   `bson:"instructions" json:"instructions"`
	// Context is shared reference material for code questions, such as table
	// definitions and sample rows. Students see it, and the AI checks against it.
	Context         string        `bson:"context,omitempty" json:"context"`
	DurationMinutes int           `bson:"duration_minutes" json:"duration_minutes"`
	Status          string        `bson:"status" json:"status"`
	Questions       []Question    `bson:"questions" json:"questions"`
	Blueprint       Blueprint     `bson:"blueprint" json:"blueprint"`
	Sets            []QuestionSet `bson:"sets" json:"sets"`
	Report          GenReport     `bson:"report" json:"report"`
	AllowedStudents []string      `bson:"allowed_students" json:"allowed_students"`
	Assignments     []Assignment  `bson:"assignments" json:"assignments"`
	Settings        Settings      `bson:"settings" json:"settings"`
	// ContentLocked flips on when the first student starts. After that questions,
	// blueprint and sets can't change, so every student's paper stays valid.
	ContentLocked bool       `bson:"content_locked" json:"content_locked"`
	Version       int        `bson:"version" json:"version"`
	CreatedAt     time.Time  `bson:"created_at" json:"created_at"`
	UpdatedAt     time.Time  `bson:"updated_at" json:"updated_at"`
	LiveAt        *time.Time `bson:"live_at,omitempty" json:"live_at"`
	EndedAt       *time.Time `bson:"ended_at,omitempty" json:"ended_at"`
}

type Answer struct {
	Selected []int  `bson:"selected" json:"selected"` // original option indexes
	Text     string `bson:"text" json:"text"`
	Marked   bool   `bson:"marked" json:"marked"` // marked for review
	Code     string `bson:"code,omitempty" json:"code"`
	Language string `bson:"language,omitempty" json:"language"` // what the student wrote in, for "any" questions
}

type TestOutcome struct {
	ID       string `bson:"id" json:"id"`
	Executes bool   `bson:"executes" json:"executes"`
	// Skipped marks a private test that wasn't checked because a public test failed.
	Skipped bool `bson:"skipped,omitempty" json:"skipped,omitempty"`
}

// RunResult is the AI's verdict on one version of a student's code.
type RunResult struct {
	CodeHash string        `bson:"code_hash" json:"-"` // which code it judged; any edit makes it stale
	Language string        `bson:"language" json:"language"`
	Percent  int           `bson:"percent" json:"percent"`
	Tests    []TestOutcome `bson:"tests" json:"tests"`
	At       time.Time     `bson:"at" json:"at"`
	Count    int           `bson:"count" json:"count"` // checks the student has used on this question
	Model    string        `bson:"model" json:"-"`
}

type Event struct {
	At     time.Time `bson:"at" json:"at"`
	Type   string    `bson:"type" json:"type"`
	Detail string    `bson:"detail,omitempty" json:"detail"`
}

type QuestionResult struct {
	QuestionID string  `bson:"question_id" json:"question_id"`
	Status     string  `bson:"status" json:"status"`
	Awarded    float64 `bson:"awarded" json:"awarded"`
	Max        float64 `bson:"max" json:"max"`
	Percent    *int    `bson:"percent,omitempty" json:"percent"` // code questions: the AI's correctness score
	Auto       float64 `bson:"auto" json:"auto"`                 // marks before any teacher override
	Overridden bool    `bson:"overridden" json:"overridden"`
}

// ClientFlags is what the student's browser last reported about proctoring.
type ClientFlags struct {
	Fullscreen bool `bson:"fullscreen" json:"fullscreen"`
	Sharing    bool `bson:"sharing" json:"sharing"`
	Visible    bool `bson:"visible" json:"visible"`
}

type Attempt struct {
	ID           primitive.ObjectID `bson:"_id" json:"id"`
	ExamID       primitive.ObjectID `bson:"exam_id" json:"exam_id"`
	StudentEmail string             `bson:"student_email" json:"student_email"`
	StudentName  string             `bson:"student_name" json:"student_name"`
	SetNumber    int                `bson:"set_number" json:"set_number"`
	// QuestionIDs and OptionOrder are this student's paper: the set's questions in
	// the order they see them, and each MCQ's options in display order.
	QuestionIDs      []string          `bson:"question_ids" json:"question_ids"`
	OptionOrder      map[string][]int  `bson:"option_order" json:"-"`
	PaperVersion     int               `bson:"paper_version" json:"paper_version"`
	Answers          map[string]Answer `bson:"answers" json:"answers"`
	AnsweredCount    int               `bson:"answered_count" json:"answered_count"`
	Status           string            `bson:"status" json:"status"`
	Locked           bool              `bson:"locked" json:"locked"`
	LockReason       string            `bson:"lock_reason" json:"lock_reason"`
	Violations       int               `bson:"violations" json:"violations"`
	ClipboardBlocks  int               `bson:"clipboard_blocks" json:"clipboard_blocks"`
	Refreshes        int               `bson:"refreshes" json:"refreshes"`
	CodeFailures     int               `bson:"code_failures" json:"code_failures"`
	CodeBlockedUntil *time.Time        `bson:"code_blocked_until,omitempty" json:"code_blocked_until"`
	Flags            ClientFlags       `bson:"flags" json:"flags"`
	StartedAt        time.Time         `bson:"started_at" json:"started_at"`
	DeadlineAt       time.Time         `bson:"deadline_at" json:"deadline_at"`
	LastSeenAt       time.Time         `bson:"last_seen_at" json:"last_seen_at"`
	SubmittedAt      *time.Time        `bson:"submitted_at,omitempty" json:"submitted_at"`
	SubmitReason     string            `bson:"submit_reason" json:"submit_reason"`
	Score            float64           `bson:"score" json:"score"`
	MaxScore         float64           `bson:"max_score" json:"max_score"`
	Results          []QuestionResult  `bson:"results" json:"results"`
	Events           []Event           `bson:"events" json:"events"`
	UserAgent        string            `bson:"user_agent" json:"user_agent"`
	// LastActiveAt is when the student last typed, clicked, scrolled or moved the
	// mouse in the exam, as their browser reports with each check-in; ClosedAt is
	// when their browser said the exam page was being closed. Together they tell an
	// idle student from one who went offline.
	LastActiveAt *time.Time `bson:"last_active_at,omitempty" json:"-"`
	ClosedAt     *time.Time `bson:"closed_at,omitempty" json:"-"`
	// External exams.
	Runs      map[string]RunResult `bson:"runs" json:"-"`
	RunCount  int                  `bson:"run_count" json:"run_count"`
	LastRunAt *time.Time           `bson:"last_run_at,omitempty" json:"last_run_at"`
	// LastEventID is the id of the last violation the browser reported, so a
	// resend after a lost reply doesn't lock the paper (and count) a second time.
	LastEventID  string `bson:"last_event_id,omitempty" json:"-"`
	Grading      string `bson:"grading" json:"grading"`
	GradingTries int    `bson:"grading_tries" json:"-"`
	// Marks the teacher set by hand, by question ID. They replace the automatic marks.
	Overrides map[string]float64 `bson:"overrides" json:"overrides"`
}

func defaultSettings(examType string) Settings {
	copyCode, refreshCode := newCodePair()
	settings := Settings{
		ShuffleQuestions:     true,
		ShuffleOptions:       true,
		ResultVisibility:     VisibilityNone,
		MultiScoring:         MultiStrict,
		MaxViolations:        5,
		RequireFullscreen:    true,
		RequireScreenShare:   true,
		BlockExtendedDisplay: true,
		LockOnRejoin:         true,
		CopyCode:             copyCode,
		RefreshCode:          refreshCode,
	}
	switch examType {
	case TypeInternal:
		// Students read the paper here and write their programs elsewhere, so
		// nothing stops them leaving the tab or copying the question.
		settings.ResultVisibility = VisibilityNone
		settings.MaxViolations = 0
		settings.RequireFullscreen = false
		settings.RequireScreenShare = false
		settings.BlockExtendedDisplay = false
		settings.LockOnRejoin = false
		settings.AllowLeaving = true
		settings.AllowClipboard = true
	case TypeExternal:
		settings.MaxRuns = 5 // AI checks per question
	}
	return settings
}
