package exams

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// askAs makes a check for an owner, as a student's Run does.
func askAs(t *testing.T, owner string) (aiVerdict, error) {
	t.Helper()
	return askGemini(withAIOwner(t.Context(), owner, owner), oneCheck(), "sql", "select 1", "")
}

// heldKey is the position of the key an owner holds, or -1.
func heldKey(owner string) int {
	p := aiPool(aiKeys())
	p.mu.Lock()
	defer p.mu.Unlock()
	if k, holds := p.held[owner]; holds {
		return k
	}
	return -1
}

func TestEachStudentKeepsTheirOwnKey(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "k1")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "k2,k3")
	t.Setenv("GEMINI_MODELS", "model-a")
	asked := fakeGemini(t, func(_, _ string) (int, string) { return http.StatusOK, geminiAnswer(80) })
	for _, owner := range []string{"ravi", "sita", "ravi", "sita", "ravi"} {
		if _, err := askAs(t, owner); err != nil {
			t.Fatal(err)
		}
	}
	if got := strings.Join(*asked, " "); got != "k1/model-a k2/model-a k1/model-a k2/model-a k1/model-a" {
		t.Fatalf("each student should keep the key they got, asked %s", got)
	}
}

func TestStartingGivesAKeyAndSubmittingFreesIt(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "k1")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "k2")
	t.Setenv("GEMINI_MODELS", "model-a")
	fakeGemini(t, func(_, _ string) (int, string) { return http.StatusOK, geminiAnswer(80) })
	assignAIKey("attempt:ravi", "N1")
	assignAIKey("attempt:sita", "N2")
	if heldKey("attempt:ravi") != 0 || heldKey("attempt:sita") != 1 {
		t.Fatalf("keys are dealt in order: ravi %d, sita %d", heldKey("attempt:ravi"), heldKey("attempt:sita"))
	}
	assignAIKey("attempt:ravi", "N1") // rejoining keeps the key
	if heldKey("attempt:ravi") != 0 {
		t.Fatal("a student coming back keeps their key")
	}
	releaseAIKey("attempt:ravi") // ravi submits
	assignAIKey("attempt:kiran", "N3")
	if heldKey("attempt:ravi") != -1 || heldKey("attempt:kiran") != 0 {
		t.Fatalf("the freed key goes to the next student: kiran %d", heldKey("attempt:kiran"))
	}
}

func TestFailedKeyMovesTheStudentToAKeyNobodyHolds(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "dead")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "k2,k3")
	t.Setenv("GEMINI_MODELS", "model-a")
	asked := fakeGemini(t, func(key, _ string) (int, string) {
		if key == "dead" {
			return http.StatusBadRequest, `{"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}}`
		}
		return http.StatusOK, geminiAnswer(90)
	})
	assignAIKey("ravi", "ravi") // dead
	assignAIKey("sita", "sita") // k2
	if v, err := askAs(t, "ravi"); err != nil || v.Percent != 90 {
		t.Fatalf("ravi's check should still be answered: %+v %v", v, err)
	}
	// Not sita's key: the one nobody holds.
	if got := strings.Join(*asked, " "); got != "dead/model-a k3/model-a" || heldKey("ravi") != 2 {
		t.Fatalf("asked %s, ravi holds key %d", got, heldKey("ravi")+1)
	}
	if _, err := askAs(t, "ravi"); err != nil || !strings.HasSuffix(strings.Join(*asked, " "), "k3/model-a k3/model-a") {
		t.Fatalf("ravi stays on the new key, asked %v (%v)", *asked, err)
	}
}

func TestWhenEveryKeyIsHeldTheLeastSharedOneIsShared(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "k1")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "k2")
	t.Setenv("GEMINI_MODELS", "model-a")
	fakeGemini(t, func(_, _ string) (int, string) { return http.StatusOK, geminiAnswer(80) })
	for _, owner := range []string{"a", "b", "c", "d"} {
		assignAIKey(owner, owner)
	}
	if heldKey("a") == heldKey("b") {
		t.Fatal("while keys are free, nobody shares one")
	}
	if heldKey("c") == heldKey("d") {
		t.Fatal("with every key held, the next student shares the least shared key")
	}
}

func TestDailyLimitTriesTheNextModelOnTheSameKey(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "k1")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "k2")
	t.Setenv("GEMINI_MODELS", "model-a,model-b")
	asked := fakeGemini(t, func(key, model string) (int, string) {
		if key == "k1" && model == "model-a" {
			return http.StatusTooManyRequests, dailyLimitBody
		}
		return http.StatusOK, geminiAnswer(70)
	})
	v, err := askAs(t, "ravi")
	if err != nil || v.Model != "model-b" {
		t.Fatalf("the next model on the same key should answer: %+v %v", v, err)
	}
	if got := strings.Join(*asked, " "); got != "k1/model-a k1/model-b" || heldKey("ravi") != 0 {
		t.Fatalf("each model has its own daily quota, so the key stays: asked %s, holds key %d", got, heldKey("ravi")+1)
	}
}

func TestATeachersCheckGivesItsKeyBack(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "k1")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "")
	t.Setenv("GEMINI_MODELS", "model-a")
	fakeGemini(t, func(_, _ string) (int, string) { return http.StatusOK, geminiAnswer(80) })
	if _, err := askOnce(t); err != nil {
		t.Fatal(err)
	}
	if v := aiPool(aiKeys()).view(aiModels()); v.Owners != 0 || v.Held != 0 || v.Requests != 1 || v.Answered != 1 {
		t.Fatalf("a check without an owner borrows a key and gives it back: %+v", v)
	}
}

func TestDashboardNeverShowsAWholeKey(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "secret-key-0001")
	t.Setenv("GEMINI_BACKUP_API_KEYS", "secret-key-0002")
	t.Setenv("GEMINI_MODELS", "model-a")
	fakeGemini(t, func(_, _ string) (int, string) { return http.StatusOK, geminiAnswer(80) })
	assignAIKey("attempt:ravi", "N230001")
	if _, err := askAs(t, "attempt:ravi"); err != nil {
		t.Fatal(err)
	}
	v := aiPool(aiKeys()).view(aiModels())
	if v.Held != 1 || v.List[0].Ends != "0001" || len(v.List[0].Holders) != 1 || v.List[0].Holders[0] != "N230001" || v.List[0].Answered != 1 {
		t.Fatalf("dashboard: %+v", v.List[0])
	}
	raw, _ := json.Marshal(v)
	if strings.Contains(string(raw), "secret-key") {
		t.Fatal("the dashboard must not show whole keys")
	}
}
