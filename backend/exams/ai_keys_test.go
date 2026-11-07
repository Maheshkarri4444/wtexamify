package exams

import (
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"
)

// oneCheck is a question with only public tests, so a check is one request.
func oneCheck() Question {
	q := codeQuestion()
	q.TestCases = q.TestCases[:1]
	return q
}

func askOnce(t *testing.T) (aiVerdict, error) {
	t.Helper()
	return askGemini(t.Context(), oneCheck(), "sql", "select 1", "")
}

const dailyLimitBody = `{"error": {"code": 429, "message": "You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20", "status": "RESOURCE_EXHAUSTED", "details": [{"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}, {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "30s"}]}}`

func TestChecksTakeTurnsOverTheKeys(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "k1")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "k2,k3")
	t.Setenv("GEMINI_MODELS", "model-a")
	asked := fakeGemini(t, func(_, _ string) (int, string) { return http.StatusOK, geminiAnswer(80) })
	for i := 0; i < 4; i++ {
		if _, err := askOnce(t); err != nil {
			t.Fatal(err)
		}
	}
	if got := strings.Join(*asked, " "); got != "k1/model-a k2/model-a k3/model-a k1/model-a" {
		t.Fatalf("each check should start from the next key, asked %s", got)
	}
}

func TestKeyOverItsDailyLimitRestsAWhile(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "spent")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "fresh")
	t.Setenv("GEMINI_MODELS", "model-a")
	asked := fakeGemini(t, func(key, _ string) (int, string) {
		if key == "spent" {
			return http.StatusTooManyRequests, dailyLimitBody
		}
		return http.StatusOK, geminiAnswer(70)
	})
	if v, err := askOnce(t); err != nil || v.Percent != 70 {
		t.Fatalf("the fresh key should answer: %+v %v", v, err)
	}
	until, resting := pausedUntil(pairName(0, "model-a"))
	if !resting {
		t.Fatal("the spent key should rest")
	}
	// Google suggests 30 s, but the daily quota comes back only at the reset, so
	// the key rests 15 minutes (or until the reset, if that's sooner) and is then tried again.
	want := min(untilQuotaReset(time.Now()), dailyQuotaRest)
	if gap := time.Until(until) - want; gap > 5*time.Second || gap < -5*time.Second {
		t.Fatalf("the spent key should rest %s, rests %s", want.Round(time.Second), time.Until(until).Round(time.Second))
	}
	*asked = (*asked)[:0]
	for i := 0; i < 3; i++ {
		if _, err := askOnce(t); err != nil {
			t.Fatal(err)
		}
	}
	if got := strings.Join(*asked, " "); got != "fresh/model-a fresh/model-a fresh/model-a" {
		t.Fatalf("a key over its daily limit isn't asked again while it rests, asked %s", got)
	}
}

func TestEveryKeyOverTheDailyLimitIsBusyWithoutAWait(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "one")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "two")
	t.Setenv("GEMINI_MODELS", "model-a")
	fakeGemini(t, func(_, _ string) (int, string) { return http.StatusTooManyRequests, dailyLimitBody })
	_, err := askOnce(t)
	var busy *aiBusyError
	if !errors.As(err, &busy) || busy.wait != 0 {
		t.Fatalf("students shouldn't be told to wait until tomorrow: %v", err)
	}
}

func TestQuotaResetsAtMidnightPacific(t *testing.T) {
	morning := time.Date(2026, time.November, 6, 10, 0, 0, 0, pacificTime)
	if got := untilQuotaReset(morning); got != 14*time.Hour+time.Minute {
		t.Fatalf("10:00 Pacific should wait until 00:01, got %s", got)
	}
	if !dailyQuota(dailyLimitBody) || dailyQuota(`{"error": {"code": 429, "details": [{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]}}`) {
		t.Fatal("only per-day limits wait for the reset")
	}
	both := `{"error": {"code": 429, "details": [{"violations": [{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}, {"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}`
	if dailyQuota(both) {
		t.Fatal("an error that names a per-minute limit is a per-minute rest, even if it also names the daily one")
	}
}

func TestOverloadedModelGivesWayAfterTwoKeys(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "k1")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "k2,k3,k4,k5")
	t.Setenv("GEMINI_MODELS", "model-a,model-b")
	asked := fakeGemini(t, func(_, model string) (int, string) {
		if model == "model-a" {
			return http.StatusServiceUnavailable, `{"error": {"code": 503, "message": "The model is overloaded.", "status": "UNAVAILABLE"}}`
		}
		return http.StatusOK, geminiAnswer(85)
	})
	v, err := askOnce(t)
	if err != nil || v.Model != "model-b" {
		t.Fatalf("the next model should answer: %+v %v", v, err)
	}
	// Two keys, each tried twice, then the next model, not all five keys.
	if got := strings.Join(*asked, " "); got != "k1/model-a k1/model-a k2/model-a k2/model-a k1/model-b" {
		t.Fatalf("asked %s", got)
	}
}

func TestMissingModelIsSkippedForEveryone(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "k1")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "k2,k3")
	t.Setenv("GEMINI_MODELS", "model-gone,model-b")
	asked := fakeGemini(t, func(_, model string) (int, string) {
		if model == "model-gone" {
			return http.StatusNotFound, `{"error": {"code": 404, "message": "models/model-gone is not found", "status": "NOT_FOUND"}}`
		}
		return http.StatusOK, geminiAnswer(60)
	})
	for i := 0; i < 2; i++ {
		if v, err := askOnce(t); err != nil || v.Model != "model-b" {
			t.Fatalf("check %d: %+v %v", i+1, v, err)
		}
	}
	if got := strings.Join(*asked, " "); got != "k1/model-gone k1/model-b k2/model-b" {
		t.Fatalf("a missing model is asked once, then skipped, asked %s", got)
	}
}

func TestRestingKeysAreStillTriedBeforeBusy(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "k1")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "k2")
	t.Setenv("GEMINI_MODELS", "model-a")
	asked := fakeGemini(t, func(_, _ string) (int, string) { return http.StatusOK, geminiAnswer(70) })
	// Both keys are resting after earlier failures, but Google would answer now.
	pause(pairName(0, "model-a"), time.Hour)
	pause(pairName(1, "model-a"), 30*time.Minute)
	v, err := askOnce(t)
	if err != nil || v.Percent != 70 {
		t.Fatalf("a resting key should be tried before the student is told it's busy: %+v %v", v, err)
	}
	if got := strings.Join(*asked, " "); got != "k2/model-a" {
		t.Fatalf("the key that wakes soonest is tried first, asked %s", got)
	}
}

func TestSlowKeyDoesNotRestTheModelForEveryone(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "slow")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "quick")
	t.Setenv("GEMINI_MODELS", "model-a,model-b")
	asked := fakeGemini(t, func(key, model string) (int, string) {
		if key == "slow" && model == "model-a" {
			time.Sleep(300 * time.Millisecond)
		}
		return http.StatusOK, geminiAnswer(80)
	})
	previous := aiHTTP
	aiHTTP = &http.Client{Timeout: 100 * time.Millisecond}
	t.Cleanup(func() { aiHTTP = previous })

	v, err := askOnce(t) // starts with the slow key
	if err != nil || v.Model != "model-b" {
		t.Fatalf("after a timeout the check should move on and get an answer: %+v %v", v, err)
	}
	if _, resting := pausedUntil(modelName("model-a")); resting {
		t.Fatal("one slow key must not rest the model for every student")
	}
	if _, resting := pausedUntil(pairName(0, "model-a")); !resting {
		t.Fatal("the slow key and model should rest")
	}
	v, err = askOnce(t) // the next check starts with the quick key
	if err != nil || v.Model != "model-a" {
		t.Fatalf("other keys keep using the best model: %+v %v", v, err)
	}
	if !strings.HasSuffix(strings.Join(*asked, " "), "quick/model-a") {
		t.Fatalf("asked %s", strings.Join(*asked, " "))
	}
}
