package config

import "strings"

// Students who sign in with an email that isn't their RGUKT one (it was lost,
// say), with the roll number to show for them. They sign in as students, and
// their roll number appears wherever an RGUKT email's would: the live monitor,
// results, exports and answer sheets. The frontend has the same list in
// src/lib/format.js, so change both together.
var studentRollNumbers = map[string]string{
	"gunakeerthana15@gmail.com": "N230758",
}

// StudentRoll is the roll number of a student on that list.
func StudentRoll(email string) (string, bool) {
	roll, ok := studentRollNumbers[strings.ToLower(strings.TrimSpace(email))]
	return roll, ok
}
