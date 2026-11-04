export const STUDENT_DOMAIN = "@rguktn.ac.in";

export const QUESTION_TYPES = {
  mcq_single: { label: "Single correct", short: "Single" },
  mcq_multi: { label: "Multiple correct", short: "Multiple" },
  fill: { label: "Fill in the blank", short: "Fill blank" },
  descriptive: { label: "Question", short: "Question" },
  code: { label: "Code", short: "Code" },
};

// Languages a code question can be answered in; "any" lets the student pick.
export const LANGUAGES = {
  sql: "SQL",
  python: "Python",
  c: "C",
  cpp: "C++",
  java: "Java",
  javascript: "JavaScript",
  php: "PHP",
  other: "Other",
};

export const languageLabel = (language) => (language === "any" ? "Any language" : LANGUAGES[language] || language);

export const DIFFICULTY = {
  easy: { label: "Easy", tone: "success" },
  medium: { label: "Medium", tone: "warning" },
  hard: { label: "Hard", tone: "danger" },
};

export const EXAM_STATUS = {
  draft: { label: "Draft", tone: "neutral" },
  ready: { label: "Published", tone: "info" },
  live: { label: "Live", tone: "success", pulse: true },
  ended: { label: "Ended", tone: "neutral" },
};

export const SUBMIT_REASONS = {
  submitted: "Submitted by the student",
  time_up: "Time ran out",
  violations: "Too many violations",
  teacher: "Submitted by the teacher",
  exam_ended: "Exam ended",
};

export const letter = (index) => String.fromCharCode(65 + index);

export function rollFromEmail(email = "") {
  const local = email.split("@")[0] || "";
  return /^[a-z]\d{6}$/i.test(local) ? local.toUpperCase() : local;
}

export function initials(name = "", email = "") {
  const source = name.trim() || email.split("@")[0] || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function firstName(name = "") {
  const first = name.trim().split(/\s+/)[0] || "";
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "";
}

export const pluralize = (count, word, plural = `${word}s`) => `${count} ${count === 1 ? word : plural}`;

export function formatMinutes(minutes) {
  if (!minutes) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Countdown text: 4:05, or 1:04:05 past an hour.
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatSpan(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a minute";
  return formatMinutes(minutes);
}

export function timeAgo(value, now = Date.now()) {
  if (!value) return "—";
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDate(value);
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export const formatNumber = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

// Severity for "how well did this go" values: fine, needs a look, a problem.
export function scoreTone(percent) {
  if (percent >= 70) return "primary";
  if (percent >= 40) return "warning";
  return "danger";
}

export function isAnswered(answer) {
  return Boolean(answer && ((answer.selected?.length ?? 0) > 0 || (answer.text ?? "").trim() !== "" || (answer.code ?? "").trim() !== ""));
}
