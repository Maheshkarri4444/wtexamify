package exams

import (
	"testing"
	"time"
)

func TestIdleIsToldApartFromOffline(t *testing.T) {
	now := time.Date(2026, time.November, 13, 10, 0, 0, 0, time.UTC)
	ago := func(d time.Duration) *time.Time { at := now.Add(-d); return &at }
	att := func(seen time.Duration, active, closed *time.Time) *Attempt {
		return &Attempt{Status: AttemptInProgress, LastSeenAt: now.Add(-seen), LastActiveAt: active, ClosedAt: closed}
	}
	cases := []struct {
		name         string
		att          *Attempt
		online, idle bool
	}{
		{"writing: checked in, did something a moment ago", att(5*time.Second, ago(20*time.Second), nil), true, false},
		{"writing: thinking for a minute isn't idle yet", att(5*time.Second, ago(119*time.Second), nil), true, false},
		{"idle: checks in, nothing done for 2 minutes", att(5*time.Second, ago(idleAfter), nil), true, true},
		{"idle: checks in, nothing done for 20 minutes", att(5*time.Second, ago(20*time.Minute), nil), true, true},
		{"offline: was active, then stopped checking in (internet dropped)", att(time.Minute, ago(70*time.Second), nil), false, false},
		{"offline: stopped checking in after an idle spell is offline too", att(2*time.Minute, ago(6*time.Minute), nil), false, false},
		{"offline: just past the check-in limit", att(offlineAfter, ago(offlineAfter), nil), false, false},
		{"offline: the page was closed, even a moment ago", att(10*time.Second, ago(10*time.Second), ago(10*time.Second)), false, false},
		{"offline: the page was closed after an idle spell", att(10*time.Second, ago(5*time.Minute), ago(5*time.Second)), false, false},
		{"back: checked in again after closing the page", att(5*time.Second, ago(5*time.Second), ago(time.Minute)), true, false},
		{"older browser: no activity reported, online by check-ins", att(5*time.Second, nil, nil), true, false},
		{"older browser: no check-in for a minute is offline", att(time.Minute, nil, nil), false, false},
	}
	for _, c := range cases {
		online, idle := presence(c.att, now)
		if online != c.online || idle != c.idle {
			t.Errorf("%s: online %v idle %v, want online %v idle %v", c.name, online, idle, c.online, c.idle)
		}
	}
	submitted := att(5*time.Second, ago(time.Hour), nil)
	submitted.Status = AttemptSubmitted
	if online, idle := presence(submitted, now); online || idle {
		t.Error("a submitted paper is neither online nor idle")
	}
}
