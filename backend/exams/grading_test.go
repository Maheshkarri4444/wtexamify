package exams

import (
	"fmt"
	"testing"
)

func TestNormalizeFill(t *testing.T) {
	cases := map[string]string{
		"Program Counter.":    "programcounter",
		"  program   counter": "programcounter",
		"PROGRAM\tCOUNTER":    "programcounter",
		"C++":                 "c++",
		"O(n log n)":          "o(nlogn)",
		"...":                 "...",
	}
	for in, want := range cases {
		if got := NormalizeFill(in); got != want {
			t.Errorf("NormalizeFill(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestGradeSingle(t *testing.T) {
	q := Question{ID: "q1", Type: QMCQSingle, Options: []string{"a", "b", "c", "d"}, Correct: []int{1}, Marks: 2}
	cases := []struct {
		selected []int
		status   string
		awarded  float64
	}{
		{[]int{1}, ResultCorrect, 2},
		{[]int{0}, ResultWrong, 0},
		{[]int{1, 2}, ResultWrong, 0},
		{nil, ResultUnanswered, 0},
	}
	for _, c := range cases {
		r := GradeQuestion(q, Answer{Selected: c.selected}, MultiStrict)
		if r.Status != c.status || r.Awarded != c.awarded || r.Max != 2 {
			t.Errorf("selected %v: got %s %.2f, want %s %.2f", c.selected, r.Status, r.Awarded, c.status, c.awarded)
		}
	}
}

func TestGradeMultiStrictAndNet(t *testing.T) {
	q := Question{ID: "q2", Type: QMCQMulti, Options: []string{"a", "b", "c", "d"}, Correct: []int{0, 2, 3}, Marks: 3}
	cases := []struct {
		selected       []int
		strictStatus   string
		strictAwarded  float64
		netAwarded     float64
		netStatusAfter string
	}{
		{[]int{0, 2, 3}, ResultCorrect, 3, 3, ResultCorrect},
		{[]int{0, 2}, ResultPartial, 2, 2, ResultPartial},
		{[]int{0}, ResultPartial, 1, 1, ResultPartial},
		{[]int{0, 1}, ResultWrong, 0, 0, ResultWrong},         // a wrong pick: strict gives 0, net gives (1-1)/3 = 0
		{[]int{0, 2, 1}, ResultWrong, 0, 1, ResultPartial},    // net: (2-1)/3 × 3 = 1
		{[]int{0, 1, 2, 3}, ResultWrong, 0, 2, ResultPartial}, // ticking everything isn't full marks
		{[]int{2, 2, 2}, ResultPartial, 1, 1, ResultPartial},  // duplicates count once
	}
	for _, c := range cases {
		strict := GradeQuestion(q, Answer{Selected: c.selected}, MultiStrict)
		if strict.Status != c.strictStatus || strict.Awarded != c.strictAwarded {
			t.Errorf("strict %v: got %s %.2f, want %s %.2f", c.selected, strict.Status, strict.Awarded, c.strictStatus, c.strictAwarded)
		}
		net := GradeQuestion(q, Answer{Selected: c.selected}, MultiNet)
		if net.Awarded != c.netAwarded || net.Status != c.netStatusAfter {
			t.Errorf("net %v: got %s %.2f, want %s %.2f", c.selected, net.Status, net.Awarded, c.netStatusAfter, c.netAwarded)
		}
	}
}

func TestGradeFill(t *testing.T) {
	q := Question{ID: "q3", Type: QFill, Answers: []string{"Program Counter", "PC"}, Marks: 1}
	for text, want := range map[string]string{
		"program counter": ResultCorrect,
		"ProgramCounter.": ResultCorrect,
		" pc ":            ResultCorrect,
		"stack pointer":   ResultWrong,
		"   ":             ResultUnanswered,
	} {
		if got := GradeQuestion(q, Answer{Text: text}, MultiStrict).Status; got != want {
			t.Errorf("%q: got %s, want %s", text, got, want)
		}
	}
}

func TestGradeAttemptTotals(t *testing.T) {
	e := &Exam{Questions: []Question{
		{ID: "qa", Type: QMCQSingle, Options: []string{"x", "y"}, Correct: []int{0}, Marks: 1},
		{ID: "qb", Type: QFill, Answers: []string{"ram"}, Marks: 2},
		{ID: "qc", Type: QMCQMulti, Options: []string{"x", "y", "z"}, Correct: []int{0, 1}, Marks: 2},
	}}
	att := &Attempt{
		QuestionIDs: []string{"qa", "qb", "qc"},
		Answers: map[string]Answer{
			"qa": {Selected: []int{0}},
			"qb": {Text: "RAM"},
			"qc": {Selected: []int{1}},
		},
	}
	score, maxScore, results := GradeAttempt(questionMap(e), att, MultiStrict)
	if score != 4 || maxScore != 5 || len(results) != 3 {
		t.Fatalf("got %.2f / %.2f with %d results, want 4 / 5 with 3", score, maxScore, len(results))
	}
}

func TestCleanQuestion(t *testing.T) {
	q, err := cleanQuestion(Question{Type: "MCQ_SINGLE", Text: "  Pick  ", Options: []string{"a", " ", "b", "c"}, Correct: []int{2}, Difficulty: "Hard"})
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(q.Options) != "[a b c]" || fmt.Sprint(q.Correct) != "[1]" || q.Difficulty != DiffHard || q.Marks != 1 || !validQuestionID(q.ID) {
		t.Fatalf("blank option should be dropped and the answer moved: %+v", q)
	}

	bad := []Question{
		{Type: QMCQSingle, Text: "two answers", Options: []string{"a", "b"}, Correct: []int{0, 1}},
		{Type: QMCQSingle, Text: "no answer", Options: []string{"a", "b"}},
		{Type: QMCQMulti, Text: "one option", Options: []string{"a"}, Correct: []int{0}},
		{Type: QMCQSingle, Text: "duplicate", Options: []string{"a", "A"}, Correct: []int{0}},
		{Type: QFill, Text: "no accepted answer", Answers: []string{"  "}},
		{Type: QFill, Text: "", Answers: []string{"x"}},
		{Type: "essay", Text: "unknown type"},
		{Type: QFill, Text: "bad difficulty", Answers: []string{"x"}, Difficulty: "tricky"},
	}
	for _, b := range bad {
		if _, err := cleanQuestion(b); err == nil {
			t.Errorf("expected an error for %q", b.Text)
		}
	}

	fill, err := cleanQuestion(Question{Type: QFill, Text: "f", Answers: []string{"RAM", "ram ", "Random Access Memory"}})
	if err != nil || len(fill.Answers) != 2 {
		t.Fatalf("answers that normalize the same should merge: %+v %v", fill.Answers, err)
	}
}

func TestNormalizeStudent(t *testing.T) {
	for in, want := range map[string]string{
		"N210368":               "n210368@rguktn.ac.in",
		" n220147@RGUKTN.ac.in": "n220147@rguktn.ac.in",
		"Someone@Gmail.com":     "someone@gmail.com",
	} {
		if got, ok := normalizeStudent(in); !ok || got != want {
			t.Errorf("normalizeStudent(%q) = %q %v, want %q", in, got, ok, want)
		}
	}
	for _, bad := range []string{"", "N21036", "hello", "a@b"} {
		if _, ok := normalizeStudent(bad); ok {
			t.Errorf("%q should be rejected", bad)
		}
	}
}

func TestSanitizeAnswers(t *testing.T) {
	att := &Attempt{QuestionIDs: []string{"qa", "qb"}, OptionOrder: map[string][]int{"qa": {2, 0, 1}}}
	clean, answered := sanitizeAnswers(map[string]Answer{
		"qa":    {Selected: []int{1, 7, 1}},
		"qb":    {Text: "  hello  ", Marked: true},
		"other": {Text: "not on this paper"},
	}, att)
	if answered != 2 || len(clean) != 2 || fmt.Sprint(clean["qa"].Selected) != "[1]" || clean["qb"].Text != "hello" {
		t.Fatalf("unexpected sanitize result %+v (answered %d)", clean, answered)
	}
}
