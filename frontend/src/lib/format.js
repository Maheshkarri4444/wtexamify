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
  plsql: "PL/SQL",
  python: "Python",
  c: "C",
  cpp: "C++",
  java: "Java",
  javascript: "JavaScript",
  php: "PHP",
  other: "Other",
};

export const languageLabel = (language) => (language === "any" ? "Any language" : LANGUAGES[language] || language);

// Code questions keep up to 10 public tests (shown with the question, and
// checked first) and up to 10 private ones (checked only once every public test
// passes, and shown when a student's code fails them), public first.
export const MAX_PUBLIC_TESTS = 10;
export const MAX_PRIVATE_TESTS = 10;

/**
 * How one test case went in an AI check: "passed", "failed", "skipped" (a
 * private test that waited for the public ones to pass) or "none" (not checked).
 */
export function testOutcome(run, test) {
  const outcome = (run?.tests || []).find((t) => t.id === test.id);
  if (!outcome) return "none";
  if (outcome.executes) return "passed";
  return outcome.skipped ? "skipped" : "failed";
}

// A part number at the start of a question: "I. …", "II (a). …", "IV: …".
const PART_NUMBER = /^\s*([IVX]{1,4})\s*(?:\(([a-z])\)\s*[.:)]?|[.:)])/;

/** A question's part number, if its text starts with one: { label: "II (a)", part: "II", sub: "a" }. */
export function questionLabel(text = "") {
  const match = String(text).match(PART_NUMBER);
  if (!match) return null;
  return { label: match[2] ? `${match[1]} (${match[2]})` : match[1], part: match[1], sub: match[2] || "" };
}

/**
 * Short names for a paper's questions, ["I", "II (a)", …], when every one
 * starts with a part number. Otherwise null, and they keep plain numbers.
 */
export function paperLabels(texts) {
  const labels = texts.map((text) => questionLabel(text)?.label);
  return labels.length > 0 && labels.every(Boolean) ? labels : null;
}

/**
 * Splits a paper's items into runs of one part: II (a) to II (e) become one
 * group with part "II"; anything else is a group of its own with part null.
 */
export function partGroups(items, textOf = (item) => item.text) {
  const groups = [];
  for (const item of items) {
    const label = questionLabel(textOf(item));
    const last = groups[groups.length - 1];
    if (label?.sub && last?.part === label.part) last.items.push(item);
    else groups.push({ part: label?.sub ? label.part : null, items: [item] });
  }
  return groups;
}

/**
 * Parts that repeat the same text after their first paragraph (the schema of
 * II (a) to II (e)) can show it once: returns that shared text and each part's
 * own first paragraph. Parts that don't share it keep their whole text.
 */
export function splitShared(texts) {
  const split = texts.map((text) => {
    const at = text.indexOf("\n\n");
    return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 2)];
  });
  const shared = split[0]?.[1] || "";
  if (texts.length < 2 || !shared.trim() || !split.every(([, rest]) => rest === shared)) return { shared: "", own: texts };
  return { shared, own: split.map(([first]) => first) };
}

/** Names each test the way students see it: "Public test 1", "Private test 2". */
export function testLabels(tests = []) {
  let shown = 0;
  let hidden = 0;
  return tests.map((t) => (t.hidden ? `Private test ${++hidden}` : `Public test ${++shown}`));
}

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
