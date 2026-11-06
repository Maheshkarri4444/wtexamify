import { clearSession, getToken } from "./auth";

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");

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

async function request(method, path, body, { timeout = TIMEOUT_MS } = {}) {
  const token = getToken();
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  let data;
  try {
    response = await fetch(API_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    data = await response.json().catch(() => ({}));
  } catch {
    // status 0 means no answer came back (offline, server down, or too slow), so callers retry.
    throw new ApiError(controller.signal.aborted ? "The Examify server took too long to answer. Trying again…" : "Can't reach the Examify server. Check your connection.", 0);
  } finally {
    clearTimeout(timer);
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
  googleLoginUrl: (state) => `${API_URL}/auth/google?state=${encodeURIComponent(state)}`,
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
  unlock: (aid, code) => post(`${attempt(aid)}/unlock`, { code }),
  refresh: (aid, code) => post(`${attempt(aid)}/refresh`, { code }),
  submit: (aid, answers) => post(`${attempt(aid)}/submit`, { answers }),
  run: (aid, questionId, code, language) => post(`${attempt(aid)}/run`, { question_id: questionId, code, language }, { timeout: AI_TIMEOUT_MS }),
};
