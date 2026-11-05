package exams

import (
	"context"
	"math"
	"regexp"
	"slices"
	"strings"
)

// nearMatch is how alike a student's code and the teacher's answer must be
// (0 to 1, after comments, spacing, letter case and semicolons are set aside)
// for the code to pass without asking the AI: the same answer, give or take a
// renamed alias or a small slip.
const nearMatch = 0.9

// maxMatchTokens bounds the comparison's work for very long answers.
const maxMatchTokens = 3000

// matchedModel marks a check decided by the comparison, not by the AI.
const matchedModel = "matches the teacher's answer"

// checkAnswer marks a student's code. Code that matches the teacher's answer
// passes every test case at once; anything else goes to the AI, whose verdict
// is then kept in line with its own test results.
func checkAnswer(ctx context.Context, q Question, language, code, sharedContext string) (aiVerdict, error) {
	if similarity := referenceSimilarity(language, q.Solution, code); similarity >= nearMatch {
		return matchVerdict(q, similarity), nil
	}
	verdict, err := checkWithAI(ctx, q, language, code, sharedContext)
	if err != nil {
		return verdict, err
	}
	return consistentVerdict(verdict), nil
}

// staleMatch says a saved check of code that matches the teacher's answer was
// the AI's (made before answers were compared), so it's redone, at once.
func staleMatch(q Question, language, code string, run RunResult) bool {
	return run.Model != matchedModel && referenceSimilarity(language, q.Solution, code) >= nearMatch
}

func matchVerdict(q Question, similarity float64) aiVerdict {
	verdict := aiVerdict{Percent: int(math.Round(similarity * 100)), Tests: make([]TestOutcome, 0, len(q.TestCases)), Model: matchedModel}
	for _, t := range q.TestCases {
		verdict.Tests = append(verdict.Tests, TestOutcome{ID: t.ID, Executes: true})
	}
	return verdict
}

// consistentVerdict keeps the percent believable: code that gives every
// expected output is at least 90% correct, whatever else the AI disliked.
func consistentVerdict(v aiVerdict) aiVerdict {
	if len(v.Tests) > 0 && allExecute(v.Tests) && v.Percent < 90 {
		v.Percent = 90
	}
	return v
}

// referenceSimilarity says how alike two pieces of code are, from 0 to 1: the
// share of their tokens that line up in order, ignoring comments, spacing,
// letter case (outside quoted text), semicolons and PL/SQL's closing slash.
func referenceSimilarity(language, reference, code string) float64 {
	a, b := codeTokens(language, reference), codeTokens(language, code)
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	if slices.Equal(a, b) {
		return 1
	}
	if len(a) > maxMatchTokens || len(b) > maxMatchTokens {
		return 0
	}
	return 2 * float64(commonTokens(a, b)) / float64(len(a)+len(b))
}

var (
	// Quoted text first, so comment markers inside quotes stay text.
	sqlComments   = regexp.MustCompile(`'(?:[^']|'')*'|"[^"]*"|--[^\n]*|/\*[\s\S]*?\*/`)
	cComments     = regexp.MustCompile(`'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|//[^\n]*|/\*[\s\S]*?\*/`)
	hashComments  = regexp.MustCompile(`'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|#[^\n]*`)
	plsqlSlash    = regexp.MustCompile(`(?m)^\s*/\s*$`)
	codeTokenizer = regexp.MustCompile(`'(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_$#]*|\d+(?:\.\d+)?|[^\sA-Za-z0-9_]`)
)

func codeTokens(language, code string) []string {
	var comments *regexp.Regexp
	switch language {
	case "sql", "plsql":
		comments = sqlComments
		code = plsqlSlash.ReplaceAllString(code, " ")
	case "c", "cpp", "java", "javascript", "php":
		comments = cComments
	case "python":
		comments = hashComments
	}
	if comments != nil {
		code = comments.ReplaceAllStringFunc(code, func(m string) string {
			if strings.HasPrefix(m, "'") || strings.HasPrefix(m, `"`) {
				return m
			}
			return " "
		})
	}
	var tokens []string
	for _, t := range codeTokenizer.FindAllString(code, -1) {
		switch {
		case t == ";":
			continue
		case strings.HasPrefix(t, "'") || strings.HasPrefix(t, `"`):
			tokens = append(tokens, t) // data like 'Research' keeps its case
		default:
			tokens = append(tokens, strings.ToLower(t))
		}
	}
	return tokens
}

// commonTokens counts the tokens the two share in the same order (their
// longest common subsequence), with gaps allowed.
func commonTokens(a, b []string) int {
	prev := make([]int, len(b)+1)
	cur := make([]int, len(b)+1)
	for i := 1; i <= len(a); i++ {
		for j := 1; j <= len(b); j++ {
			switch {
			case a[i-1] == b[j-1]:
				cur[j] = prev[j-1] + 1
			case prev[j] >= cur[j-1]:
				cur[j] = prev[j]
			default:
				cur[j] = cur[j-1]
			}
		}
		prev, cur = cur, prev
	}
	return prev[len(b)]
}
