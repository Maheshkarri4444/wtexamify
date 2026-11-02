package exams

import (
	"math"
	"strings"
)

// NormalizeFill makes fill-in-the-blank answers comparable: letter case, every
// space and a trailing full stop are ignored, so "Program Counter." matches
// "programcounter". Other punctuation stays, so "C++" and "C" stay different.
func NormalizeFill(s string) string {
	s = strings.ToLower(strings.Join(strings.Fields(s), ""))
	if trimmed := strings.TrimRight(s, "."); trimmed != "" {
		s = trimmed
	}
	return s
}

func GradeQuestion(q Question, a Answer, multiScoring string) QuestionResult {
	result := QuestionResult{QuestionID: q.ID, Status: ResultUnanswered, Max: q.Marks}
	switch q.Type {
	case QMCQSingle:
		if len(a.Selected) == 0 {
			return result
		}
		result.Status = ResultWrong
		if len(a.Selected) == 1 && len(q.Correct) == 1 && a.Selected[0] == q.Correct[0] {
			result.Status, result.Awarded = ResultCorrect, q.Marks
		}
	case QMCQMulti:
		selected := uniqueInts(a.Selected)
		if len(selected) == 0 || len(q.Correct) == 0 {
			return result
		}
		correct := make(map[int]bool, len(q.Correct))
		for _, c := range q.Correct {
			correct[c] = true
		}
		hits, misses := 0, 0
		for _, s := range selected {
			if correct[s] {
				hits++
			} else {
				misses++
			}
		}
		var fraction float64
		switch {
		case multiScoring == MultiNet:
			fraction = float64(max(0, hits-misses)) / float64(len(q.Correct))
		case misses == 0:
			fraction = float64(hits) / float64(len(q.Correct))
		}
		result.Awarded = round2(q.Marks * fraction)
		switch {
		case misses == 0 && hits == len(q.Correct):
			result.Status = ResultCorrect
		case result.Awarded > 0:
			result.Status = ResultPartial
		default:
			result.Status = ResultWrong
		}
	case QFill:
		given := NormalizeFill(a.Text)
		if given == "" {
			return result
		}
		result.Status = ResultWrong
		for _, accepted := range q.Answers {
			if NormalizeFill(accepted) == given {
				result.Status, result.Awarded = ResultCorrect, q.Marks
				break
			}
		}
	}
	return result
}

// GradeAttempt scores every question on the student's paper.
func GradeAttempt(byID map[string]Question, att *Attempt, multiScoring string) (float64, float64, []QuestionResult) {
	var score, maxScore float64
	results := []QuestionResult{}
	for _, id := range att.QuestionIDs {
		q, ok := byID[id]
		if !ok {
			continue
		}
		r := GradeQuestion(q, att.Answers[id], multiScoring)
		results = append(results, r)
		score += r.Awarded
		maxScore += r.Max
	}
	return round2(score), round2(maxScore), results
}

func questionMap(e *Exam) map[string]Question {
	byID := make(map[string]Question, len(e.Questions))
	for _, q := range e.Questions {
		byID[q.ID] = q
	}
	return byID
}

func uniqueInts(values []int) []int {
	seen := make(map[int]bool, len(values))
	out := []int{}
	for _, v := range values {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func percent(score, maxScore float64) float64 {
	if maxScore <= 0 {
		return 0
	}
	return round2(score / maxScore * 100)
}
