package exams

import (
	"crypto/sha256"
	"encoding/hex"
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

// codeHash identifies one version of a code answer, so a check is only reused
// for exactly the code it judged.
func codeHash(language, code string) string {
	sum := sha256.Sum256([]byte(language + "\x00" + strings.TrimSpace(code)))
	return hex.EncodeToString(sum[:12])
}

// answerLanguage is the language a code answer is written in.
func answerLanguage(q Question, a Answer) string {
	if q.Language != LangAny {
		return q.Language
	}
	if _, ok := languages[a.Language]; ok {
		return a.Language
	}
	return "other"
}

// GradeQuestion marks one answer. Code answers need the AI's check of that
// exact code (run); without one the result is pending.
func GradeQuestion(q Question, a Answer, run *RunResult, multiScoring string) QuestionResult {
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
	case QDescriptive:
		result.Status = ResultNotGraded
	case QCode:
		if strings.TrimSpace(a.Code) == "" {
			return result
		}
		if run == nil || run.CodeHash != codeHash(answerLanguage(q, a), a.Code) {
			result.Status = ResultPending
			return result
		}
		percent := max(0, min(100, run.Percent))
		result.Percent = &percent
		result.Awarded = round2(q.Marks * float64(percent) / 100)
		switch {
		case percent >= 100:
			result.Status = ResultCorrect
		case percent > 0:
			result.Status = ResultPartial
		default:
			result.Status = ResultWrong
		}
	}
	return result
}

// GradeAttempt scores every question on the student's paper, applying any marks
// the teacher set by hand. pending is true while some code answer is unchecked.
func GradeAttempt(byID map[string]Question, att *Attempt, multiScoring string) (score, maxScore float64, results []QuestionResult, pending bool) {
	results = []QuestionResult{}
	for _, id := range att.QuestionIDs {
		q, ok := byID[id]
		if !ok {
			continue
		}
		var run *RunResult
		if r, ok := att.Runs[id]; ok {
			run = &r
		}
		r := GradeQuestion(q, att.Answers[id], run, multiScoring)
		r.Auto = r.Awarded
		if marks, ok := att.Overrides[id]; ok {
			r.Awarded, r.Overridden = round2(max(0, min(r.Max, marks))), true
		}
		if r.Status == ResultPending && !r.Overridden {
			pending = true
		}
		results = append(results, r)
		score += r.Awarded
		maxScore += r.Max
	}
	return round2(score), round2(maxScore), results, pending
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
