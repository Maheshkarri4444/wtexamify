import { clearSession, getToken } from "./auth";

// The Go backends, comma-separated in VITE_API_URLS (or VITE_API_URL). Each browser
// tab picks one at random, so students spread across them, and keeps using it while
// it answers. When one fails, the request goes to another and that one is used from
// then on; the failed one is tried last for a minute.
export const API_URLS = [
  ...new Set(
    String(import.meta.env.VITE_API_URLS || import.meta.env.VITE_API_URL || "http://localhost:8080")
      .split(",")
      .map((url) => url.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  ),
];
const DOWN_FOR_MS = 60000;
const downUntil = new Map(); // backend index → time it may be tried first again
let current = Math.floor(Math.random() * API_URLS.length);

// The backend this tab uses now, then the others in random order, ones that failed lately last.
function backendOrder() {
  const now = Date.now();
  const others = API_URLS.map((_, i) => i).filter((i) => i !== current);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const order = [current, ...others];
  return [...order.filter((i) => !(downUntil.get(i) > now)), ...order.filter((i) => downUntil.get(i) > now)];
}

function markDown(index) {
  // With the student's own internet down every backend fails: that says nothing about them.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  downUntil.set(index, Date.now() + DOWN_FOR_MS);
}

// Render answers these itself when the app behind it is down or overloaded.
const BACKEND_DOWN = new Set([502, 503, 504]);
// Requests that do no harm if a slow backend did them after all and another does them
// again: reads, and the exam room's save, events (they carry an id), start and submit.
const REPEATABLE = /\/(sync|event|start|submit)$/;

// A backend that answers, for the Google sign-in redirect (a page load, not a request
// that can move on to another backend by itself).
export async function reachableBackend() {
  for (const index of backendOrder()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${API_URLS[index]}/`, { signal: controller.signal });
      if (!BACKEND_DOWN.has(response.status)) {
        current = index;
        return API_URLS[index];
      }
      markDown(index);
    } catch {
      markDown(index);
    } finally {
      clearTimeout(timer);
    }
  }
  return API_URLS[current];
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// A request that never answers (a Wi-Fi drop, a laptop waking from sleep) must
// not hang forever: the exam room waits on its syncs, so one stuck request would
// freeze it. AI checks get longer, since they can try more than one model.
const TIMEOUT_MS = 20000;
const AI_TIMEOUT_MS = 170000; // the server gives an AI check up to 150 s
const EXPORT_TIMEOUT_MS = 90000;

async function request(method, path, body, { timeout = TIMEOUT_MS, keepalive = false } = {}) {
  const token = getToken();
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const repeatable = method === "GET" || REPEATABLE.test(path.split("?")[0]);
  let response;
  let data;
  let timedOut = false;
  for (const index of backendOrder()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const answer = await fetch(API_URLS[index] + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        keepalive, // lets a request finish after the page is gone
      });
      if (BACKEND_DOWN.has(answer.status) && API_URLS.length > 1) {
        markDown(index);
        continue; // never reached the app: another backend can do it
      }
      response = answer;
      data = await response.json().catch(() => ({}));
      current = index; // it answered: keep using it
      break;
    } catch {
      markDown(index);
      timedOut = controller.signal.aborted;
      // A backend that was only slow may still do it; don't do it twice unless that's harmless.
      if (timedOut && !repeatable) break;
    } finally {
      clearTimeout(timer);
    }
  }
  if (!response) {
    // status 0 means no answer came back (offline, servers down, or too slow), so callers retry.
    throw new ApiError(timedOut ? "The Examify server took too long to answer. Trying again…" : "Can't reach the Examify server. Check your connection.", 0);
  }

  if (response.status === 401 && token) {
    clearSession();
    if (!window.location.pathname.startsWith("/login")) window.location.assign("/login?expired=1");
  }
  if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status})`, response.status, data);
  return data;
}

const get = (path, options) => request("GET", path, undefined, options);
const post = (path, body = {}, options) => request("POST", path, body, options);
const put = (path, body = {}) => request("PUT", path, body);
const patch = (path, body = {}) => request("PATCH", path, body);
const del = (path) => request("DELETE", path);

export const authApi = {
  devLogin: (email, role, name) => post("/auth/dev-login", { email, role, name }),
  googleCallback: (code) => get(`/auth/googlecallback?code=${encodeURIComponent(code)}`),
  googleLoginUrl: (state, base = API_URLS[current]) => `${base}/auth/google?state=${encodeURIComponent(state)}`,
};

const exam = (id) => `/api/v2/teacher/exams/${id}`;

export const teacherApi = {
  list: () => get("/api/v2/teacher/exams"),
  create: (body) => post("/api/v2/teacher/exams", body),
  get: (id) => get(exam(id)),
  update: (id, body) => patch(exam(id), body),
  remove: (id) => del(exam(id)),
  duplicate: (id) => post(`${exam(id)}/duplicate`),
  teachers: () => get("/api/v2/teacher/teachers"),
  share: (id, emails) => put(`${exam(id)}/share`, { emails }),
  setStatus: (id, status) => post(`${exam(id)}/status`, { status }),
  regenerateCodes: (id, which) => post(`${exam(id)}/codes/regenerate`, { which }),
  // extra: { custom_sets, set_contexts } from a sheet with the teacher's own sets.
  addQuestions: (id, questions, extra = {}) => post(`${exam(id)}/questions`, { questions, ...extra }),
  updateQuestion: (id, qid, question) => put(`${exam(id)}/questions/${qid}`, { question }),
  deleteQuestions: (id, ids, all = false) => post(`${exam(id)}/questions/delete`, { ids, all }),
  checkQuestion: (id, question, code, language) => post(`${exam(id)}/questions/check`, { question, code, language }, { timeout: AI_TIMEOUT_MS }),
  previewBlueprint: (id, blueprint) => post(`${exam(id)}/blueprint/preview`, blueprint),
  saveBlueprint: (id, blueprint) => put(`${exam(id)}/blueprint`, blueprint),
  reshuffleSets: (id) => post(`${exam(id)}/sets/regenerate`),
  addStudents: (id, emails) => post(`${exam(id)}/students`, { emails }),
  removeStudents: (id, emails, all = false) => post(`${exam(id)}/students/remove`, { emails, all }),
  monitor: (id) => get(`${exam(id)}/monitor`),
  extendAll: (id, minutes) => post(`${exam(id)}/extend`, { minutes }),
  unlockAll: (id) => post(`${exam(id)}/unlock-all`),
  reopenAll: (id) => post(`${exam(id)}/reopen-all`),
  results: (id) => get(`${exam(id)}/results`),
  attempt: (id, aid) => get(`${exam(id)}/attempts/${aid}`),
  answerSheets: (id) => get(`${exam(id)}/answer-sheets`, { timeout: EXPORT_TIMEOUT_MS }),
  attemptAction: (id, aid, action, minutes) => post(`${exam(id)}/attempts/${aid}/action`, { action, minutes }),
  setMarks: (id, aid, questionId, marks) => post(`${exam(id)}/attempts/${aid}/marks`, { question_id: questionId, marks }),
};

const attempt = (aid) => `/api/v2/student/attempts/${aid}`;

export const studentApi = {
  list: () => get("/api/v2/student/exams"),
  get: (id) => get(`/api/v2/student/exams/${id}`),
  start: (id, flags) => post(`/api/v2/student/exams/${id}/start`, { flags }),
  attempt: (aid) => get(attempt(aid)),
  sync: (aid, body) => post(`${attempt(aid)}/sync`, body),
  event: (aid, type, detail, id) => post(`${attempt(aid)}/event`, { type, detail, id }),
  // The exam page is closing: sent so it still arrives as the page goes away.
  closing: (aid) => request("POST", `${attempt(aid)}/event`, { type: "closed" }, { keepalive: true }).catch(() => {}),
  unlock: (aid, code) => post(`${attempt(aid)}/unlock`, { code }),
  refresh: (aid, code) => post(`${attempt(aid)}/refresh`, { code }),
  submit: (aid, answers) => post(`${attempt(aid)}/submit`, { answers }),
  run: (aid, questionId, code, language) => post(`${attempt(aid)}/run`, { question_id: questionId, code, language }, { timeout: AI_TIMEOUT_MS }),
};
