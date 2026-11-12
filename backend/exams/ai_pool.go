package exams

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand/v2"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// The key pool gives every student writing an external a Gemini key of their
// own, so one student's checks never use up another student's quota:
//
//   - A student gets a key when they start, dealt in order from the keys nobody
//     holds, and every Run they make goes to that key.
//   - When their key fails them (Google refuses it, or it's over a per-minute
//     limit), they move to a key nobody holds; when every working key is held,
//     to a random one of the least shared. A daily limit on one model first
//     tries the next model on the same key, since each model has its own quota.
//   - Submitting frees the key. The background grader and a teacher's "check my
//     answer" borrow a key the same way and give it back when they're done.
//
// The pool, and its dashboard, live in the server's memory: every request
// updates its key's counts, and GET /api/v2/teacher/ai-keys shows them. After a
// restart, students get keys again on their next Run. Keys are named only by
// position (and on the dashboard by their last four characters), never logged.

func attemptOwner(id primitive.ObjectID) string { return "attempt:" + id.Hex() }
func gradingOwner(id primitive.ObjectID) string { return "grading:" + id.Hex() }

// aiOwner is whoever a check is for: a student's attempt, a grading job or a
// teacher. label names them in logs and on the dashboard (a roll number).
type aiOwner struct {
	id    string
	label string
}

type aiOwnerContext struct{}

// withAIOwner makes the checks made with ctx use the owner's key.
func withAIOwner(ctx context.Context, id, label string) context.Context {
	return context.WithValue(ctx, aiOwnerContext{}, aiOwner{id: id, label: label})
}

var borrowedChecks atomic.Uint64

// aiOwnerOf says whose key a check uses. A check with no owner (a teacher trying
// their answer) borrows a key for just that check: borrowed is then true.
func aiOwnerOf(ctx context.Context) (owner aiOwner, borrowed bool) {
	if o, ok := ctx.Value(aiOwnerContext{}).(aiOwner); ok && o.id != "" {
		return o, false
	}
	return aiOwner{id: fmt.Sprintf("check:%d", borrowedChecks.Add(1)), label: "a teacher's check"}, true
}

type keyPool struct {
	mu      sync.Mutex
	keys    []string
	list    string         // the key list the pool was built from
	held    map[string]int // owner id → the key they hold (a position in keys)
	labels  map[string]string
	holders []int // how many owners hold each key
	next    int   // where the search for a key nobody holds starts, so keys are dealt in order
	stats   []keyStats
	totals  poolTotals
	logged  poolTotals // totals at the last summary in the log
	since   time.Time
}

type keyStats struct {
	requests, answered, failed, movedOff int
	lastModel, lastError                 string
	lastUsed                             time.Time
}

type poolTotals struct{ requests, answered, failed, moves int }

var (
	poolMu     sync.Mutex
	currentKey *keyPool
)

// aiPool is the pool for these keys. The keys only change when the server
// restarts (or between tests), and a different list starts a fresh pool.
func aiPool(keys []string) *keyPool {
	list := strings.Join(keys, "\n")
	poolMu.Lock()
	defer poolMu.Unlock()
	if currentKey == nil || currentKey.list != list {
		currentKey = &keyPool{
			keys: keys, list: list, held: map[string]int{}, labels: map[string]string{},
			holders: make([]int, len(keys)), stats: make([]keyStats, len(keys)), since: time.Now(),
		}
	}
	return currentKey
}

// resetAIPool forgets every key held, for tests.
func resetAIPool() {
	poolMu.Lock()
	currentKey = nil
	poolMu.Unlock()
}

// assignAIKey gives an owner a key now (a student starting an external), so
// their first Run doesn't wait for one. Holding one already, they keep it.
func assignAIKey(id, label string) {
	if keys := aiKeys(); len(keys) > 0 {
		aiPool(keys).keyFor(aiOwner{id: id, label: label}, aiModels())
	}
}

// releaseAIKey frees the key an owner holds, if any: on submitting, or when a
// grading job or a teacher's check is done.
func releaseAIKey(id string) {
	if keys := aiKeys(); len(keys) > 0 {
		aiPool(keys).release(id)
	}
}

// keyWorks says whether key k can take a request now: Google hasn't refused it,
// and some model that isn't resting for everyone isn't resting for this key.
func keyWorks(k int, models []string) bool {
	if _, refused := pausedUntil(keyName(k)); refused {
		return false
	}
	for _, model := range models {
		if _, rests := pausedUntil(modelName(model)); rests {
			continue
		}
		if _, rests := pausedUntil(pairName(k, model)); !rests {
			return true
		}
	}
	return false
}

// keyFor is the key a check uses: the one its owner holds, or a new one when
// they hold none or theirs can't take requests just now. ok is false when no
// key can take a request now.
func (p *keyPool) keyFor(o aiOwner, models []string) (k int, ok bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	held, holds := p.held[o.id]
	if holds && keyWorks(held, models) {
		return held, true
	}
	avoid := -1
	if holds {
		avoid = held
	}
	if k = p.pickLocked(avoid, models); k < 0 {
		return held, false
	}
	p.holdLocked(o, k)
	if holds {
		p.totals.moves++
		p.stats[held].movedOff++
		log.Printf("ai keys: %s moves from key %d to key %d (key %d is resting)", o.label, held+1, k+1, held+1)
	} else {
		log.Printf("ai keys: %s gets key %d", o.label, k+1)
	}
	return k, true
}

// move gives the owner another key after theirs failed them. It reports false,
// leaving them where they are, when no other key can take a request now.
func (p *keyPool) move(o aiOwner, failed int, models []string, reason string) (int, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	k := p.pickLocked(failed, models)
	if k < 0 {
		return failed, false
	}
	p.stats[failed].movedOff++
	p.totals.moves++
	p.holdLocked(o, k)
	log.Printf("ai keys: %s moves from key %d to key %d (%s)", o.label, failed+1, k+1, reason)
	return k, true
}

// adopt hands the owner key k, one that just answered for them.
func (p *keyPool) adopt(o aiOwner, k int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if held, holds := p.held[o.id]; !holds || held != k {
		p.holdLocked(o, k)
	}
}

func (p *keyPool) release(id string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if k, holds := p.held[id]; holds {
		p.holders[k]--
		delete(p.held, id)
		delete(p.labels, id)
	}
}

// pickLocked chooses a key for someone: the next one nobody holds, in order, or,
// when every working key is held, a random one of the least shared. avoid is a
// key that just failed them. It returns -1 when no key can take a request now.
func (p *keyPool) pickLocked(avoid int, models []string) int {
	n := len(p.keys)
	for i := 0; i < n; i++ {
		k := (p.next + i) % n
		if k != avoid && p.holders[k] == 0 && keyWorks(k, models) {
			p.next = (k + 1) % n
			return k
		}
	}
	least, choices := 0, []int(nil)
	for k := 0; k < n; k++ {
		if k == avoid || !keyWorks(k, models) {
			continue
		}
		switch {
		case choices == nil || p.holders[k] < least:
			least, choices = p.holders[k], []int{k}
		case p.holders[k] == least:
			choices = append(choices, k)
		}
	}
	if len(choices) == 0 {
		return -1
	}
	return choices[rand.N(len(choices))]
}

func (p *keyPool) holdLocked(o aiOwner, k int) {
	if old, holds := p.held[o.id]; holds {
		p.holders[old]--
	}
	p.held[o.id] = k
	p.labels[o.id] = o.label
	p.holders[k]++
}

// record puts a request's outcome on the dashboard.
func (p *keyPool) record(k int, model string, err error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	s := &p.stats[k]
	s.requests++
	p.totals.requests++
	s.lastModel, s.lastUsed = model, time.Now()
	if err == nil {
		s.answered++
		p.totals.answered++
		s.lastError = ""
		return
	}
	s.failed++
	p.totals.failed++
	s.lastError = failureKind(err)
}

// failureKind names a failed request in a few words, for the dashboard. It never
// repeats Google's message, which can name the project behind a key.
func failureKind(err error) string {
	var refused *keyError
	var limited *rateLimitError
	var slow *slowModelError
	var rejected *modelError
	switch {
	case errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded):
		return "the check ran out of time"
	case errors.As(err, &refused):
		return "refused by Google"
	case errors.As(err, &limited) && limited.daily:
		return "over the daily limit"
	case errors.As(err, &limited) && strings.Contains(limited.body, "no capacity"):
		return "no capacity just now"
	case errors.As(err, &limited):
		return "over a per-minute limit"
	case errors.As(err, &slow):
		return "no answer in time"
	case errors.As(err, &rejected):
		return fmt.Sprintf("model rejected the request (HTTP %d)", rejected.status)
	default:
		return "server error or unreadable answer"
	}
}

// ---------- the dashboard ----------

type keyView struct {
	Key       int        `json:"key"`   // position in GEMINI_API_KEY, GEMINI_BACKUP_API_KEYS, from 1
	Ends      string     `json:"ends"`  // last four characters, to tell keys apart
	State     string     `json:"state"` // working, resting (every model over a limit) or refused
	Holders   []string   `json:"holders"`
	Requests  int        `json:"requests"`
	Answered  int        `json:"answered"`
	Failed    int        `json:"failed"`
	MovedOff  int        `json:"moved_off"` // owners moved to another key after this one failed
	LastModel string     `json:"last_model,omitempty"`
	LastError string     `json:"last_error,omitempty"`
	LastUsed  *time.Time `json:"last_used,omitempty"`
}

type poolView struct {
	Keys     int       `json:"keys"`
	Working  int       `json:"working"`
	Resting  int       `json:"resting"`
	Refused  int       `json:"refused"`
	Held     int       `json:"held"`   // keys someone holds
	Owners   int       `json:"owners"` // students, grading jobs and checks holding a key
	Requests int       `json:"requests"`
	Answered int       `json:"answered"`
	Failed   int       `json:"failed"`
	Moves    int       `json:"moves"`
	Since    time.Time `json:"since"`
	List     []keyView `json:"list"`
}

func keyState(k int, models []string) string {
	if _, refused := pausedUntil(keyName(k)); refused {
		return "refused"
	}
	if keyWorks(k, models) {
		return "working"
	}
	return "resting"
}

func (p *keyPool) view(models []string) poolView {
	p.mu.Lock()
	defer p.mu.Unlock()
	v := poolView{
		Keys: len(p.keys), Owners: len(p.held), Since: p.since,
		Requests: p.totals.requests, Answered: p.totals.answered, Failed: p.totals.failed, Moves: p.totals.moves,
		List: make([]keyView, len(p.keys)),
	}
	for k := range p.keys {
		s := p.stats[k]
		kv := keyView{
			Key: k + 1, State: keyState(k, models), Holders: []string{},
			Requests: s.requests, Answered: s.answered, Failed: s.failed, MovedOff: s.movedOff,
			LastModel: s.lastModel, LastError: s.lastError,
		}
		if key := p.keys[k]; len(key) > 4 {
			kv.Ends = key[len(key)-4:]
		}
		if !s.lastUsed.IsZero() {
			at := s.lastUsed
			kv.LastUsed = &at
		}
		switch kv.State {
		case "working":
			v.Working++
		case "resting":
			v.Resting++
		default:
			v.Refused++
		}
		v.List[k] = kv
	}
	for id, k := range p.held {
		v.List[k].Holders = append(v.List[k].Holders, p.labels[id])
	}
	for k := range v.List {
		if len(v.List[k].Holders) > 0 {
			v.Held++
		}
	}
	return v
}

// aiKeysStatus is the pool's dashboard, for teachers: GET /api/v2/teacher/ai-keys.
func aiKeysStatus(c *gin.Context) {
	keys := aiKeys()
	if len(keys) == 0 {
		c.JSON(http.StatusOK, gin.H{"keys": 0})
		return
	}
	c.JSON(http.StatusOK, aiPool(keys).view(aiModels()))
}

// logAIKeys writes a line about the pool to the log, when there was a check
// since the last one: how many keys work and are held, and how the checks went.
func logAIKeys() {
	keys := aiKeys()
	if len(keys) == 0 {
		return
	}
	p := aiPool(keys)
	v := p.view(aiModels())
	p.mu.Lock()
	last := p.logged
	p.logged = p.totals
	p.mu.Unlock()
	if v.Requests == last.requests && v.Moves == last.moves {
		return
	}
	log.Printf("ai keys: %d keys (%d working, %d resting, %d refused), %d held by %d students and checks; since the last line %d requests, %d answered, %d failed, %d moves to another key",
		v.Keys, v.Working, v.Resting, v.Refused, v.Held, v.Owners,
		v.Requests-last.requests, v.Answered-last.answered, v.Failed-last.failed, v.Moves-last.moves)
}
