package exams

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	maxQuestions    = 2000
	maxStudents     = 3000
	maxOptions      = 8
	maxQuestionText = 4000
	maxAnswerText   = 500
	studentDomain   = "@rguktn.ac.in"
)

var (
	rollNumberRe = regexp.MustCompile(`^[a-z]\d{6}$`)
	emailRe      = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	codeRe       = regexp.MustCompile(`^[A-Z0-9]{4,20}$`)
)

// cleanQuestion trims and checks a question from the teacher. Blank options are
// dropped and the correct-option indexes move with the options that remain.
func cleanQuestion(q Question) (Question, error) {
	q.Type = strings.ToLower(strings.TrimSpace(q.Type))
	q.Text = strings.TrimSpace(q.Text)
	if q.Text == "" {
		return q, errors.New("the question text is empty")
	}
	if utf8.RuneCountInString(q.Text) > maxQuestionText {
		return q, fmt.Errorf("the question is longer than %d characters", maxQuestionText)
	}
	q.Difficulty = strings.ToLower(strings.TrimSpace(q.Difficulty))
	switch q.Difficulty {
	case "", DiffEasy, DiffMedium, DiffHard:
	default:
		return q, errors.New("difficulty must be easy, medium or hard")
	}
	if q.Marks <= 0 {
		q.Marks = 1
	}
	if q.Marks > 100 {
		return q, errors.New("marks can't be more than 100")
	}
	q.Marks = round2(q.Marks)
	if !validQuestionID(q.ID) {
		q.ID = newQuestionID()
	}

	switch q.Type {
	case QMCQSingle, QMCQMulti:
		options := []string{}
		newIndex := map[int]int{}
		for i, option := range q.Options {
			if option = strings.TrimSpace(option); option != "" {
				newIndex[i] = len(options)
				options = append(options, option)
			}
		}
		if len(options) < 2 {
			return q, errors.New("add at least two options")
		}
		if len(options) > maxOptions {
			return q, fmt.Errorf("use at most %d options", maxOptions)
		}
		seen := map[string]bool{}
		for _, option := range options {
			key := strings.ToLower(option)
			if seen[key] {
				return q, fmt.Errorf("the option %q appears twice", option)
			}
			seen[key] = true
		}
		correct := []int{}
		picked := map[int]bool{}
		for _, old := range q.Correct {
			if i, ok := newIndex[old]; ok && !picked[i] {
				picked[i] = true
				correct = append(correct, i)
			}
		}
		sort.Ints(correct)
		if len(correct) == 0 {
			return q, errors.New("mark the correct option")
		}
		if q.Type == QMCQSingle && len(correct) != 1 {
			return q, errors.New("a single-correct question needs exactly one correct option")
		}
		q.Options, q.Correct, q.Answers = options, correct, []string{}
	case QFill:
		answers := []string{}
		seen := map[string]bool{}
		for _, answer := range q.Answers {
			answer = strings.TrimSpace(answer)
			key := NormalizeFill(answer)
			if key == "" || seen[key] {
				continue
			}
			seen[key] = true
			answers = append(answers, answer)
		}
		if len(answers) == 0 {
			return q, errors.New("add at least one accepted answer")
		}
		q.Options, q.Correct, q.Answers = []string{}, []int{}, answers
	default:
		return q, errors.New("type must be mcq_single, mcq_multi or fill")
	}
	return q, nil
}

func validateBlueprint(bp Blueprint) error {
	if bp.PerSet < 1 || bp.PerSet > 200 {
		return errors.New("questions per set must be between 1 and 200")
	}
	if bp.Easy < 0 || bp.Medium < 0 || bp.Hard < 0 {
		return errors.New("difficulty counts can't be negative")
	}
	if bp.UseDifficulty && bp.Easy+bp.Medium+bp.Hard != bp.PerSet {
		return fmt.Errorf("easy + medium + hard must add up to %d", bp.PerSet)
	}
	return nil
}

// normalizeStudent turns an email or an RGUKT roll number (N210368) into a
// lowercase email address.
func normalizeStudent(raw string) (string, bool) {
	value := strings.ToLower(strings.Trim(strings.TrimSpace(raw), `"'<>,;`))
	if rollNumberRe.MatchString(value) {
		return value + studentDomain, true
	}
	if emailRe.MatchString(value) {
		return value, true
	}
	return "", false
}

func cleanCode(raw string) (string, error) {
	code := strings.ToUpper(strings.TrimSpace(raw))
	if !codeRe.MatchString(code) {
		return "", errors.New("codes must be 4–20 letters or digits")
	}
	return code, nil
}
