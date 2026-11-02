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

	QMCQSingle = "mcq_single"
	QMCQMulti  = "mcq_multi"
	QFill      = "fill"

	DiffEasy   = "easy"
	DiffMedium = "medium"
	DiffHard   = "hard"

	AttemptInProgress = "in_progress"
	AttemptSubmitted  = "submitted"

	ResultCorrect    = "correct"
	ResultPartial    = "partial"
	ResultWrong      = "wrong"
	ResultUnanswered = "unanswered"

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
}

// Blueprint describes what every set looks like.
type Blueprint struct {
	PerSet        int  `bson:"per_set" json:"per_set"`
	UseDifficulty bool `bson:"use_difficulty" json:"use_difficulty"`
	Easy          int  `bson:"easy" json:"easy"`
	Medium        int  `bson:"medium" json:"medium"`
	Hard          int  `bson:"hard" json:"hard"`
}

type QuestionSet struct {
	Number      int      `bson:"number" json:"number"`
	QuestionIDs []string `bson:"question_ids" json:"question_ids"`
	ReusedIDs   []string `bson:"reused_ids" json:"reused_ids"` // questions that also appear in an earlier set
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
	ResultVisibility     string `bson:"result_visibility" json:"result_visibility"`
	MultiScoring         string `bson:"multi_scoring" json:"multi_scoring"`
	MaxViolations        int    `bson:"max_violations" json:"max_violations"` // 0 = never auto-submit
	RequireFullscreen    bool   `bson:"require_fullscreen" json:"require_fullscreen"`
	RequireScreenShare   bool   `bson:"require_screen_share" json:"require_screen_share"`
	BlockExtendedDisplay bool   `bson:"block_extended_display" json:"block_extended_display"`
	LockOnRejoin         bool   `bson:"lock_on_rejoin" json:"lock_on_rejoin"`
	ClearAnswersOnUnlock bool   `bson:"clear_answers_on_unlock" json:"clear_answers_on_unlock"`
	CopyCode             string `bson:"copy_code" json:"copy_code"`       // unlocks a locked student
	RefreshCode          string `bson:"refresh_code" json:"refresh_code"` // gives a student a new set
}

type Exam struct {
	ID              primitive.ObjectID `bson:"_id" json:"id"`
	OwnerID         primitive.ObjectID `bson:"owner_id" json:"owner_id"`
	OwnerEmail      string             `bson:"owner_email" json:"owner_email"`
	Type            string             `bson:"type" json:"type"`
	Title           string             `bson:"title" json:"title"`
	Instructions    string             `bson:"instructions" json:"instructions"`
	DurationMinutes int                `bson:"duration_minutes" json:"duration_minutes"`
	Status          string             `bson:"status" json:"status"`
	Questions       []Question         `bson:"questions" json:"questions"`
	Blueprint       Blueprint          `bson:"blueprint" json:"blueprint"`
	Sets            []QuestionSet      `bson:"sets" json:"sets"`
	Report          GenReport          `bson:"report" json:"report"`
	AllowedStudents []string           `bson:"allowed_students" json:"allowed_students"`
	Assignments     []Assignment       `bson:"assignments" json:"assignments"`
	Settings        Settings           `bson:"settings" json:"settings"`
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
}

func defaultSettings() Settings {
	copyCode, refreshCode := newCodePair()
	return Settings{
		ShuffleQuestions:     true,
		ShuffleOptions:       true,
		ResultVisibility:     VisibilityScore,
		MultiScoring:         MultiStrict,
		MaxViolations:        3,
		RequireFullscreen:    true,
		RequireScreenShare:   true,
		BlockExtendedDisplay: true,
		LockOnRejoin:         true,
		CopyCode:             copyCode,
		RefreshCode:          refreshCode,
	}
}
