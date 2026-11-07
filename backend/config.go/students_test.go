package config

import "testing"

func TestStudentRollForAListedEmail(t *testing.T) {
	for _, email := range []string{"gunakeerthana15@gmail.com", "Gunakeerthana15@gmail.com", " GUNAKEERTHANA15@GMAIL.COM "} {
		if roll, ok := StudentRoll(email); !ok || roll != "N230758" {
			t.Errorf("StudentRoll(%q) = %q, %v; want N230758", email, roll, ok)
		}
	}
	if _, ok := StudentRoll("someone.else@gmail.com"); ok {
		t.Error("an email that isn't listed has no roll number here")
	}
	if _, ok := StudentRoll("keerthanadarapaneni24@gmail.com"); ok {
		t.Error("her earlier Gmail was replaced, so it no longer signs in as a student")
	}
}
