package exams

import (
	"math/rand/v2"
	"strings"
)

// PaperQuestion is what a student sees: no correct options, no accepted answers.
type PaperQuestion struct {
	ID      string        `json:"id"`
	Number  int           `json:"number"`
	Type    string        `json:"type"`
	Text    string        `json:"text"`
	Options []PaperOption `json:"options"`
	Marks   float64       `json:"marks"`
}

// PaperOption keeps the option's original index as its ID, so shuffled options
// still grade against the teacher's answer key.
type PaperOption struct {
	ID   int    `json:"id"`
	Text string `json:"text"`
}

func findSet(e *Exam, number int) *QuestionSet {
	for i := range e.Sets {
		if e.Sets[i].Number == number {
			return &e.Sets[i]
		}
	}
	return nil
}

// buildPaper lays out one student's copy of a set: question order and option
// order are shuffled per student when the exam's settings ask for it.
func buildPaper(e *Exam, setNumber int, rng *rand.Rand) ([]string, map[string][]int) {
	set := findSet(e, setNumber)
	if set == nil {
		return []string{}, map[string][]int{}
	}
	ids := append([]string(nil), set.QuestionIDs...)
	if e.Settings.ShuffleQuestions {
		rng.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })
	}
	byID := questionMap(e)
	order := map[string][]int{}
	for _, id := range ids {
		q := byID[id]
		if q.Type == QFill {
			continue
		}
		indexes := make([]int, len(q.Options))
		for i := range indexes {
			indexes[i] = i
		}
		if e.Settings.ShuffleOptions {
			rng.Shuffle(len(indexes), func(i, j int) { indexes[i], indexes[j] = indexes[j], indexes[i] })
		}
		order[id] = indexes
	}
	return ids, order
}

// pickOtherSet chooses a different set for a refresh. With a single set the
// student keeps it, and only the shuffle changes.
func pickOtherSet(e *Exam, current int, rng *rand.Rand) int {
	var others []int
	for _, s := range e.Sets {
		if s.Number != current {
			others = append(others, s.Number)
		}
	}
	if len(others) == 0 {
		return current
	}
	return others[rng.IntN(len(others))]
}

func paperQuestions(e *Exam, att *Attempt) []PaperQuestion {
	byID := questionMap(e)
	out := make([]PaperQuestion, 0, len(att.QuestionIDs))
	for i, id := range att.QuestionIDs {
		q, ok := byID[id]
		if !ok {
			continue
		}
		pq := PaperQuestion{ID: q.ID, Number: i + 1, Type: q.Type, Text: q.Text, Options: []PaperOption{}, Marks: q.Marks}
		for _, idx := range att.OptionOrder[id] {
			if idx >= 0 && idx < len(q.Options) {
				pq.Options = append(pq.Options, PaperOption{ID: idx, Text: q.Options[idx]})
			}
		}
		out = append(out, pq)
	}
	return out
}

// sanitizeAnswers keeps only answers to questions on this paper, with option IDs
// that exist on it. It returns the cleaned map and how many are answered.
func sanitizeAnswers(raw map[string]Answer, att *Attempt) (map[string]Answer, int) {
	onPaper := make(map[string]bool, len(att.QuestionIDs))
	for _, id := range att.QuestionIDs {
		onPaper[id] = true
	}
	clean := map[string]Answer{}
	answered := 0
	for id, a := range raw {
		if !onPaper[id] {
			continue
		}
		valid := map[int]bool{}
		for _, idx := range att.OptionOrder[id] {
			valid[idx] = true
		}
		selected := []int{}
		for _, s := range uniqueInts(a.Selected) {
			if valid[s] {
				selected = append(selected, s)
			}
		}
		text := strings.TrimSpace(a.Text)
		if len([]rune(text)) > maxAnswerText {
			text = string([]rune(text)[:maxAnswerText])
		}
		if len(selected) == 0 && text == "" && !a.Marked {
			continue
		}
		clean[id] = Answer{Selected: selected, Text: text, Marked: a.Marked}
		if len(selected) > 0 || text != "" {
			answered++
		}
	}
	return clean, answered
}
