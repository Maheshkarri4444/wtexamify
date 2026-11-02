package exams

import (
	"fmt"
	"math/rand/v2"
	"testing"
)

func testRNG(seed uint64) *rand.Rand { return rand.New(rand.NewPCG(seed, seed*7+1)) }

func makeQuestions(prefix string, n int, difficulty string) []Question {
	qs := make([]Question, n)
	for i := range qs {
		qs[i] = Question{ID: fmt.Sprintf("q%s%04d", prefix, i), Type: QFill, Text: fmt.Sprintf("%s %d", prefix, i), Answers: []string{"x"}, Difficulty: difficulty, Marks: 1}
	}
	return qs
}

// checkSets verifies the invariants every generated set must hold.
func checkSets(t *testing.T, qs []Question, sets []QuestionSet, perSet int) map[string]int {
	t.Helper()
	known := map[string]bool{}
	for _, q := range qs {
		known[q.ID] = true
	}
	usage := map[string]int{}
	for _, s := range sets {
		if len(s.QuestionIDs) != perSet {
			t.Fatalf("set %d has %d questions, want %d", s.Number, len(s.QuestionIDs), perSet)
		}
		seen := map[string]bool{}
		for _, id := range s.QuestionIDs {
			if !known[id] {
				t.Fatalf("set %d has unknown question %s", s.Number, id)
			}
			if seen[id] {
				t.Fatalf("set %d repeats question %s", s.Number, id)
			}
			seen[id] = true
			usage[id]++
		}
	}
	for _, q := range qs {
		if usage[q.ID] == 0 {
			t.Fatalf("question %s was never used", q.ID)
		}
	}
	return usage
}

func TestGenerateSetsWithoutDifficulty(t *testing.T) {
	qs := makeQuestions("a", 25, "")
	sets, report := GenerateSets(qs, Blueprint{PerSet: 10}, testRNG(1))
	if !report.OK || len(sets) != 3 || report.SetCount != 3 {
		t.Fatalf("want 3 sets, got %d (report %+v)", len(sets), report)
	}
	checkSets(t, qs, sets, 10)
	if report.FullyUniqueSets != 2 || report.ReusedSlots != 5 {
		t.Fatalf("want 2 unique sets and 5 reused slots, got %d and %d", report.FullyUniqueSets, report.ReusedSlots)
	}
	if len(sets[2].ReusedIDs) != 5 {
		t.Fatalf("last set should top up with 5 reused questions, got %d", len(sets[2].ReusedIDs))
	}
}

func TestGenerateSetsExactSplitHasNoReuse(t *testing.T) {
	qs := makeQuestions("b", 30, "")
	sets, report := GenerateSets(qs, Blueprint{PerSet: 10}, testRNG(2))
	usage := checkSets(t, qs, sets, 10)
	if len(sets) != 3 || report.ReusedSlots != 0 || report.FullyUniqueSets != 3 {
		t.Fatalf("want 3 fully unique sets, got %d sets, %d reused", len(sets), report.ReusedSlots)
	}
	for id, n := range usage {
		if n != 1 {
			t.Fatalf("question %s used %d times", id, n)
		}
	}
}

func TestGenerateSetsNotEnoughQuestions(t *testing.T) {
	sets, report := GenerateSets(makeQuestions("c", 5, ""), Blueprint{PerSet: 10}, testRNG(3))
	if report.OK || len(sets) != 0 || len(report.Errors) == 0 {
		t.Fatalf("expected an error, got %+v", report)
	}
}

func TestGenerateSetsByDifficultyReusesSameDifficulty(t *testing.T) {
	var qs []Question
	qs = append(qs, makeQuestions("e", 12, DiffEasy)...)
	qs = append(qs, makeQuestions("m", 6, DiffMedium)...)
	qs = append(qs, makeQuestions("h", 4, DiffHard)...)
	difficulty := map[string]string{}
	for _, q := range qs {
		difficulty[q.ID] = q.Difficulty
	}

	bp := Blueprint{PerSet: 10, UseDifficulty: true, Easy: 4, Medium: 4, Hard: 2}
	sets, report := GenerateSets(qs, bp, testRNG(4))
	if !report.OK || len(sets) != 3 {
		t.Fatalf("easy needs 12/4 = 3 sets; got %d (%+v)", len(sets), report)
	}
	usage := checkSets(t, qs, sets, 10)

	for _, s := range sets {
		counts := map[string]int{}
		for _, id := range s.QuestionIDs {
			counts[difficulty[id]]++
		}
		if counts[DiffEasy] != 4 || counts[DiffMedium] != 4 || counts[DiffHard] != 2 {
			t.Fatalf("set %d has wrong mix %v", s.Number, counts)
		}
	}

	reused := map[string]int{}
	for _, b := range report.Buckets {
		reused[b.Difficulty] = b.ReusedSlots
	}
	if reused[DiffEasy] != 0 || reused[DiffMedium] != 6 || reused[DiffHard] != 2 {
		t.Fatalf("unexpected reuse per difficulty: %v", reused)
	}

	// Reuse is spread evenly: no medium question is used twice more than another.
	low, high := 99, 0
	for _, q := range qs {
		if q.Difficulty == DiffMedium {
			low, high = min(low, usage[q.ID]), max(high, usage[q.ID])
		}
	}
	if high-low > 1 {
		t.Fatalf("medium reuse is uneven: min %d max %d", low, high)
	}
}

func TestGenerateSetsDifficultyErrors(t *testing.T) {
	qs := append(makeQuestions("e", 10, DiffEasy), makeQuestions("h", 1, DiffHard)...)
	if _, report := GenerateSets(qs, Blueprint{PerSet: 5, UseDifficulty: true, Easy: 3, Hard: 1}, testRNG(5)); report.OK {
		t.Fatal("counts that don't add up to the set size must fail")
	}
	if _, report := GenerateSets(qs, Blueprint{PerSet: 5, UseDifficulty: true, Easy: 3, Hard: 2}, testRNG(5)); report.OK {
		t.Fatal("needing 2 hard questions with only 1 must fail")
	}
}

func TestGenerateSetsUntaggedCountAsMedium(t *testing.T) {
	qs := append(makeQuestions("m", 3, DiffMedium), makeQuestions("u", 3, "")...)
	sets, report := GenerateSets(qs, Blueprint{PerSet: 2, UseDifficulty: true, Medium: 2}, testRNG(6))
	if !report.OK || len(sets) != 3 {
		t.Fatalf("6 medium (3 untagged) / 2 = 3 sets, got %d (%+v)", len(sets), report)
	}
	if report.Buckets[0].Untagged != 3 || len(report.Warnings) == 0 {
		t.Fatalf("expected an untagged warning, got %+v", report)
	}
}

func TestAssignSetsDealsInRollOrder(t *testing.T) {
	emails := []string{"n210007@rguktn.ac.in", "n210001@rguktn.ac.in", "n210003@rguktn.ac.in", "n210002@rguktn.ac.in"}
	got := AssignSets(emails, 3)
	want := map[string]int{"n210001@rguktn.ac.in": 1, "n210002@rguktn.ac.in": 2, "n210003@rguktn.ac.in": 3, "n210007@rguktn.ac.in": 1}
	for _, a := range got {
		if want[a.Email] != a.Set {
			t.Fatalf("%s got set %d, want %d", a.Email, a.Set, want[a.Email])
		}
	}
	if len(AssignSets(emails, 0)) != 0 {
		t.Fatal("no sets means no assignments")
	}
}

func TestBuildPaperKeepsOrderWhenShuffleIsOff(t *testing.T) {
	e := &Exam{
		Questions: []Question{
			{ID: "qaaaaaa1", Type: QMCQSingle, Options: []string{"a", "b", "c"}, Correct: []int{0}},
			{ID: "qaaaaaa2", Type: QFill, Answers: []string{"x"}},
		},
		Sets: []QuestionSet{{Number: 1, QuestionIDs: []string{"qaaaaaa1", "qaaaaaa2"}}},
	}
	ids, order := buildPaper(e, 1, testRNG(7))
	if fmt.Sprint(ids) != "[qaaaaaa1 qaaaaaa2]" || fmt.Sprint(order["qaaaaaa1"]) != "[0 1 2]" {
		t.Fatalf("unexpected paper %v %v", ids, order)
	}
	if _, hasOrder := order["qaaaaaa2"]; hasOrder {
		t.Fatal("fill-in-the-blank questions have no options to order")
	}
}
