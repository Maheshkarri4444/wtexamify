package exams

import (
	"fmt"
	"math/rand/v2"
	"sort"
	"strings"
)

// maxSets keeps a lopsided blueprint (say 1 easy question per set from a pool of
// 2000) from producing an unusable number of sets.
const maxSets = 500

type bucket struct {
	key      string
	need     int
	pool     []int // indexes into the question list
	untagged int
}

// GenerateSets splits the question bank into sets that follow the blueprint.
//
// The teacher never picks the number of sets. It is the smallest number that
// uses every question at least once: for each difficulty, pool size ÷ questions
// needed per set, rounded up, and the largest of those wins. Questions are used
// up before any is repeated. When a difficulty runs out (or the last set is short),
// the gap is filled with that same difficulty's least-used questions, never with
// a different difficulty and never twice in one set.
func GenerateSets(questions []Question, bp Blueprint, rng *rand.Rand) ([]QuestionSet, GenReport) {
	report := GenReport{Buckets: []BucketReport{}, Errors: []string{}, Warnings: []string{}}
	if bp.PerSet < 1 {
		report.Errors = append(report.Errors, "Questions per set must be at least 1.")
		return []QuestionSet{}, report
	}
	if len(questions) == 0 {
		report.Errors = append(report.Errors, "Add questions to generate sets.")
		return []QuestionSet{}, report
	}

	var buckets []*bucket
	if !bp.UseDifficulty {
		all := &bucket{key: "any", need: bp.PerSet}
		for i := range questions {
			all.pool = append(all.pool, i)
		}
		buckets = append(buckets, all)
	} else {
		if bp.Easy < 0 || bp.Medium < 0 || bp.Hard < 0 {
			report.Errors = append(report.Errors, "Difficulty counts can't be negative.")
			return []QuestionSet{}, report
		}
		if sum := bp.Easy + bp.Medium + bp.Hard; sum != bp.PerSet {
			report.Errors = append(report.Errors, fmt.Sprintf("Easy + medium + hard must add up to %d (it's %d now).", bp.PerSet, sum))
			return []QuestionSet{}, report
		}
		byDifficulty := map[string]*bucket{
			DiffEasy:   {key: DiffEasy, need: bp.Easy},
			DiffMedium: {key: DiffMedium, need: bp.Medium},
			DiffHard:   {key: DiffHard, need: bp.Hard},
		}
		for i, q := range questions {
			difficulty := q.Difficulty
			if difficulty == "" {
				difficulty = DiffMedium
				byDifficulty[DiffMedium].untagged++
			}
			b := byDifficulty[difficulty]
			b.pool = append(b.pool, i)
		}
		for _, key := range []string{DiffEasy, DiffMedium, DiffHard} {
			b := byDifficulty[key]
			if b.need == 0 {
				if len(b.pool) > 0 {
					report.Warnings = append(report.Warnings, fmt.Sprintf("%d %s question(s) aren't used because each set takes 0 %s.", len(b.pool), key, key))
				}
				continue
			}
			buckets = append(buckets, b)
		}
		if untagged := byDifficulty[DiffMedium].untagged; untagged > 0 && byDifficulty[DiffMedium].need > 0 {
			report.Warnings = append(report.Warnings, fmt.Sprintf("%d question(s) have no difficulty, so they count as medium.", untagged))
		}
	}

	for _, b := range buckets {
		report.Buckets = append(report.Buckets, BucketReport{Difficulty: b.key, Pool: len(b.pool), PerSet: b.need, Untagged: b.untagged})
		if len(b.pool) < b.need {
			label := b.key + " "
			if b.key == "any" {
				label = ""
			}
			report.Errors = append(report.Errors, fmt.Sprintf("Each set needs %d %squestion(s), but there are only %d.", b.need, label, len(b.pool)))
		}
	}
	if len(report.Errors) > 0 {
		return []QuestionSet{}, report
	}

	setCount := 0
	for _, b := range buckets {
		if n := (len(b.pool) + b.need - 1) / b.need; n > setCount {
			setCount = n
		}
	}
	if setCount > maxSets {
		report.Warnings = append(report.Warnings, fmt.Sprintf("Only the first %d sets are kept. Raise the questions per set to use more of the bank.", maxSets))
		setCount = maxSets
	}

	usage := make([]int, len(questions))
	sets := make([]QuestionSet, setCount)
	for s := range sets {
		inSet := map[int]bool{}
		var picked, reused []int
		for bi, b := range buckets {
			var fromBucket []int
			for k := 0; k < b.need; k++ {
				// Candidates are this bucket's least-used questions not already in
				// the set; pick one at random so reuse is spread evenly.
				least := -1
				var candidates []int
				for _, qi := range b.pool {
					if inSet[qi] {
						continue
					}
					switch {
					case least == -1 || usage[qi] < least:
						least = usage[qi]
						candidates = []int{qi}
					case usage[qi] == least:
						candidates = append(candidates, qi)
					}
				}
				choice := candidates[rng.IntN(len(candidates))]
				if usage[choice] > 0 {
					reused = append(reused, choice)
					report.Buckets[bi].ReusedSlots++
					report.ReusedSlots++
				}
				usage[choice]++
				inSet[choice] = true
				fromBucket = append(fromBucket, choice)
			}
			// Within a difficulty keep the teacher's original order; the per-student
			// shuffle handles the rest.
			sort.Ints(fromBucket)
			picked = append(picked, fromBucket...)
		}
		sets[s] = QuestionSet{Number: s + 1, QuestionIDs: idsOf(questions, picked), ReusedIDs: idsOf(questions, reused)}
		if len(reused) == 0 {
			report.FullyUniqueSets++
		}
	}

	report.OK = true
	report.SetCount = setCount
	if setCount == 1 {
		report.Warnings = append(report.Warnings, "Only one set can be made, so every student gets the same questions (in a shuffled order if shuffling is on).")
	}
	if report.ReusedSlots > 0 {
		var details []string
		for _, b := range report.Buckets {
			if b.ReusedSlots > 0 {
				details = append(details, fmt.Sprintf("%d %s", b.ReusedSlots, bucketLabel(b.Difficulty)))
			}
		}
		report.Warnings = append(report.Warnings, fmt.Sprintf("%d set(s) reuse questions from other sets to fill up (%s).", setCount-report.FullyUniqueSets, strings.Join(details, ", ")))
	}
	return sets, report
}

func bucketLabel(key string) string {
	if key == "any" {
		return "question slots"
	}
	return key + " slots"
}

func idsOf(questions []Question, indexes []int) []string {
	ids := make([]string, 0, len(indexes))
	for _, i := range indexes {
		ids = append(ids, questions[i].ID)
	}
	return ids
}

// AssignSets gives every student a set before the exam starts. Students are
// sorted by email, which is roll-number order for RGUKT addresses, and dealt
// sets in turn, so roll-number neighbours (who usually sit together) differ.
func AssignSets(emails []string, setCount int) []Assignment {
	numbers := make([]int, setCount)
	for i := range numbers {
		numbers[i] = i + 1
	}
	return assignSetNumbers(emails, numbers)
}

// dealSets deals an exam's sets, whatever their numbers (a teacher's own sets
// can skip numbers).
func dealSets(emails []string, sets []QuestionSet) []Assignment {
	numbers := make([]int, len(sets))
	for i, s := range sets {
		numbers[i] = s.Number
	}
	return assignSetNumbers(emails, numbers)
}

func assignSetNumbers(emails []string, numbers []int) []Assignment {
	assignments := []Assignment{}
	if len(numbers) == 0 {
		return assignments
	}
	sorted := append([]string(nil), emails...)
	sort.Strings(sorted)
	for i, email := range sorted {
		assignments = append(assignments, Assignment{Email: email, Set: numbers[i%len(numbers)]})
	}
	return assignments
}

// CustomSets builds the teacher's own sets: every question goes to the set it
// names, in sheet order, with that set's reference material attached.
func CustomSets(questions []Question, contexts []SetContext) ([]QuestionSet, GenReport) {
	report := GenReport{Buckets: []BucketReport{}, Errors: []string{}, Warnings: []string{}}
	byNumber := map[int]*QuestionSet{}
	numbers := []int{}
	missing := 0
	for _, q := range questions {
		if q.Set <= 0 {
			missing++
			continue
		}
		set, ok := byNumber[q.Set]
		if !ok {
			set = &QuestionSet{Number: q.Set, QuestionIDs: []string{}, ReusedIDs: []string{}}
			byNumber[q.Set] = set
			numbers = append(numbers, q.Set)
		}
		set.QuestionIDs = append(set.QuestionIDs, q.ID)
	}
	if missing > 0 {
		report.Errors = append(report.Errors, fmt.Sprintf("%d question(s) have no set number. With your own sets, every question needs one.", missing))
	}
	if len(numbers) == 0 {
		if len(questions) > 0 && missing == 0 {
			report.Errors = append(report.Errors, "No sets yet.")
		}
		return []QuestionSet{}, report
	}
	sort.Ints(numbers)
	context := map[int]string{}
	for _, c := range contexts {
		context[c.Number] = c.Context
	}
	sets := make([]QuestionSet, 0, len(numbers))
	sizes := map[int]bool{}
	for _, n := range numbers {
		set := *byNumber[n]
		set.Context = context[n]
		sizes[len(set.QuestionIDs)] = true
		sets = append(sets, set)
	}
	if len(sizes) > 1 {
		report.Warnings = append(report.Warnings, "Your sets have different numbers of questions, so some students get more questions than others.")
	}
	report.OK = missing == 0
	report.SetCount = len(sets)
	report.FullyUniqueSets = len(sets)
	return sets, report
}

// leastAssignedSet picks the set with the fewest students, for students added
// after the exam is locked (when existing assignments must not move).
func leastAssignedSet(e *Exam) int {
	if len(e.Sets) == 0 {
		return 0
	}
	counts := make(map[int]int, len(e.Sets))
	for _, a := range e.Assignments {
		counts[a.Set]++
	}
	best := e.Sets[0].Number
	for _, s := range e.Sets {
		if counts[s.Number] < counts[best] {
			best = s.Number
		}
	}
	return best
}

func assignedSet(e *Exam, email string) int {
	for _, a := range e.Assignments {
		if a.Email == email {
			return a.Set
		}
	}
	return 0
}

// regenerateSets rebuilds the sets after the questions or blueprint change and
// re-deals them to every student. Only valid while the exam is unlocked.
func regenerateSets(e *Exam) {
	if e.Blueprint.Custom {
		e.Sets, e.Report = CustomSets(e.Questions, e.Blueprint.SetContexts)
		// Sets may differ in size; students see the largest as "questions per set".
		e.Blueprint.PerSet = 0
		for _, s := range e.Sets {
			e.Blueprint.PerSet = max(e.Blueprint.PerSet, len(s.QuestionIDs))
		}
	} else {
		e.Sets, e.Report = GenerateSets(e.Questions, e.Blueprint, newRNG())
	}
	e.Assignments = dealSets(e.AllowedStudents, e.Sets)
}

// setContext is the reference material of a student's set, if it has any.
func setContext(e *Exam, number int) string {
	for _, s := range e.Sets {
		if s.Number == number {
			return s.Context
		}
	}
	return ""
}

// contextFor is all the reference material that comes with a question: the
// whole exam's, its set's and its own, labelled so the AI can tell them apart.
func contextFor(e *Exam, setNumber int, q Question) string {
	parts := []string{}
	add := func(label, text string) {
		if text = strings.TrimSpace(text); text != "" {
			parts = append(parts, label+":\n"+text)
		}
	}
	add("For every question", e.Context)
	add("For this set", setContext(e, setNumber))
	add("For this question", q.Context)
	if len(parts) == 1 {
		// One source needs no label.
		_, text, _ := strings.Cut(parts[0], ":\n")
		return text
	}
	return strings.Join(parts, "\n\n")
}
