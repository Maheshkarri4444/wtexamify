package exams

import (
	crand "crypto/rand"
	"crypto/subtle"
	"math/big"
	"math/rand/v2"
	"strings"
)

const (
	idAlphabet = "abcdefghijkmnpqrstuvwxyz23456789"
	// Teacher codes skip look-alike characters (0/O, 1/I/L) so they're easy to read out loud.
	codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
)

func randomString(n int, alphabet string) string {
	out := make([]byte, n)
	limit := big.NewInt(int64(len(alphabet)))
	for i := range out {
		v, err := crand.Int(crand.Reader, limit)
		if err != nil {
			panic(err)
		}
		out[i] = alphabet[v.Int64()]
	}
	return string(out)
}

func newQuestionID() string { return "q" + randomString(9, idAlphabet) }

func newCode() string { return randomString(6, codeAlphabet) }

// newCodePair returns a copy code and a refresh code that are never the same.
func newCodePair() (string, string) {
	copyCode, refreshCode := newCode(), newCode()
	for refreshCode == copyCode {
		refreshCode = newCode()
	}
	return copyCode, refreshCode
}

// newRNG is a fast generator seeded from crypto/rand, for shuffling sets and papers.
func newRNG() *rand.Rand {
	var seed [32]byte
	if _, err := crand.Read(seed[:]); err != nil {
		panic(err)
	}
	return rand.New(rand.NewChaCha8(seed))
}

func codesMatch(input, code string) bool {
	if code == "" {
		return false
	}
	given := strings.ToUpper(strings.TrimSpace(input))
	return subtle.ConstantTimeCompare([]byte(given), []byte(strings.ToUpper(code))) == 1
}

func validQuestionID(id string) bool {
	if len(id) < 6 || len(id) > 24 || id[0] != 'q' {
		return false
	}
	for _, r := range id {
		if !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9') {
			return false
		}
	}
	return true
}
