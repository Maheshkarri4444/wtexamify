import * as XLSX from "xlsx";
import { QUESTION_TYPES, STUDENT_DOMAIN, SUBMIT_REASONS, formatDateTime } from "./format";

const COLUMNS = ["type", "question", "option_a", "option_b", "option_c", "option_d", "option_e", "option_f", "answer", "difficulty", "marks"];

const SAMPLES = {
  mcq_single: [
    ["mcq_single", "Which register holds the address of the next instruction?", "Accumulator", "Program Counter", "Instruction Register", "Memory Address Register", "", "", "B", "easy", 1],
    ["mcq_single", "Which HTML tag creates the largest heading?", "<h6>", "<head>", "<h1>", "<header>", "", "", "C", "easy", 1],
  ],
  mcq_multi: [
    ["mcq_multi", "Which of these memories are volatile?", "RAM", "ROM", "Cache", "Flash", "", "", "A,C", "medium", 2],
    ["mcq_multi", "Which are SQL aggregate functions?", "COUNT", "SUM", "TOTAL", "AVG", "", "", "A,B,D", "hard", 2],
  ],
  fill: [
    ["fill", "The ____ holds the address of the next instruction to execute.", "", "", "", "", "", "", "program counter | PC", "easy", 1],
    ["fill", "CSS stands for Cascading ____ Sheets.", "", "", "", "", "", "", "Style", "easy", 1],
  ],
};

const HELP = [
  ["Column", "What to put in it"],
  ["type", "mcq_single (one correct option), mcq_multi (one or more correct options) or fill (fill in the blank). Leave it empty and Examify works it out: options with one answer letter = mcq_single, several letters = mcq_multi, no options = fill."],
  ["question", "The question. For fill in the blank, mark the blank with ____ (four underscores)."],
  ["option_a … option_f", "Up to six options for an MCQ. Leave the ones you don't need empty."],
  ["answer", "MCQ: the letter of the correct option (B), or letters for mcq_multi (A,C). Fill in the blank: the accepted answer; separate several with | (program counter | PC). Capital letters and spaces are ignored when marking."],
  ["difficulty", "Optional: easy, medium or hard. Needed only if you balance sets by difficulty."],
  ["marks", "Optional. Defaults to 1."],
];

const TEMPLATE_FILES = { mixed: "mixed", mcq_single: "single-correct", mcq_multi: "multiple-correct", fill: "fill-in-the-blank" };

export function downloadQuestionTemplate(kind = "mixed") {
  const rows = kind === "mixed" ? [...SAMPLES.mcq_single, ...SAMPLES.mcq_multi, ...SAMPLES.fill] : SAMPLES[kind];
  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows]);
  sheet["!cols"] = [{ wch: 12 }, { wch: 60 }, ...Array.from({ length: 6 }, () => ({ wch: 20 })), { wch: 24 }, { wch: 11 }, { wch: 7 }];
  const help = XLSX.utils.aoa_to_sheet(HELP);
  help["!cols"] = [{ wch: 20 }, { wch: 120 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Questions");
  XLSX.utils.book_append_sheet(book, help, "How to fill it");
  XLSX.writeFile(book, `examify-viva-${TEMPLATE_FILES[kind]}-template.xlsx`);
}

const FIELD_ALIASES = {
  type: ["type", "question_type", "qtype", "kind"],
  question: ["question", "question_text", "questions", "q"],
  answer: ["answer", "answers", "correct", "correct_answer", "correct_answers", "key"],
  difficulty: ["difficulty", "level", "difficulty_level"],
  marks: ["marks", "mark", "points"],
};

const TYPE_ALIASES = {
  mcq_single: ["mcq_single", "single", "mcq", "scq", "single_correct", "mcq_single_correct"],
  mcq_multi: ["mcq_multi", "multi", "multiple", "msq", "mcq_multiple", "multiple_correct", "mcq_multiple_correct"],
  fill: ["fill", "fib", "blank", "fill_blank", "fill_in_the_blank", "fill_in_the_blanks", "fill_up", "fillup"],
};

const DIFFICULTY_ALIASES = { easy: "easy", e: "easy", medium: "medium", med: "medium", m: "medium", hard: "hard", h: "hard" };

const normalizeHeader = (value) => String(value ?? "").trim().toLowerCase().replace(/[\s.\-()]+/g, "_").replace(/^_+|_+$/g, "");
const normalizeText = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// option_a, option a, a, opt_a, option_1, choice_b ... → option index.
function optionIndex(header) {
  const match = header.match(/^(?:option|opt|choice)?_?([a-h]|[1-8])$/);
  if (!match) return -1;
  return /\d/.test(match[1]) ? Number(match[1]) - 1 : match[1].charCodeAt(0) - 97;
}

function parseType(raw) {
  const value = normalizeHeader(raw);
  if (!value) return "";
  for (const [type, aliases] of Object.entries(TYPE_ALIASES)) {
    if (aliases.includes(value)) return type;
  }
  return null;
}

// "B", "A,C", "a c", "AC", "1,3" → option indexes. Falls back to matching an
// option's text. Returns null when the answer can't be read.
function parseOptionAnswer(raw, options) {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const tokens = text.split(/[\s,;/&+]+|\band\b/i).filter(Boolean);
  const indexes = [];
  let readable = tokens.length > 0;
  for (const token of tokens) {
    const part = token.replace(/^option_?/i, "").replace(/[().]/g, "");
    let found = [];
    if (/^[a-h]$/i.test(part)) found = [part.toUpperCase().charCodeAt(0) - 65];
    else if (/^[1-8]$/.test(part)) found = [Number(part) - 1];
    else if (/^[a-h]{2,8}$/i.test(part)) found = [...part.toUpperCase()].map((c) => c.charCodeAt(0) - 65);
    else readable = false;
    for (const i of found) if (!indexes.includes(i)) indexes.push(i);
  }
  if (readable) return indexes;
  const byText = options.findIndex((option) => option && option.toLowerCase() === text.toLowerCase());
  return byText >= 0 ? [byText] : null;
}

/**
 * Turns spreadsheet rows into questions, with a row-by-row report.
 * existingTexts are questions already in the exam, so re-imports don't duplicate.
 */
export function parseQuestionRows(rows, existingTexts = []) {
  const issues = [];
  const questions = [];
  const headerAt = rows.findIndex((row, i) => i < 15 && row.some((cell) => FIELD_ALIASES.question.includes(normalizeHeader(cell))));
  if (headerAt < 0) {
    issues.push({ row: 1, level: "error", message: "No header row with a “question” column was found. Download a template to see the layout." });
    return { questions, issues, total: 0 };
  }

  const col = {};
  const optionCols = [];
  rows[headerAt].forEach((cell, i) => {
    const header = normalizeHeader(cell);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (col[field] === undefined && aliases.includes(header)) {
        col[field] = i;
        return;
      }
    }
    const index = optionIndex(header);
    if (index >= 0 && optionCols[index] === undefined) optionCols[index] = i;
  });
  if (col.answer === undefined) {
    issues.push({ row: headerAt + 1, level: "error", message: "There's no “answer” column, so the questions can't be marked." });
    return { questions, issues, total: 0 };
  }

  const seen = new Map(existingTexts.map((text) => [normalizeText(text), 0]));
  let total = 0;
  for (let r = headerAt + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rowNumber = r + 1;
    const cell = (index) => (index === undefined ? "" : String(row[index] ?? "").trim());
    if (row.every((value) => String(value ?? "").trim() === "")) continue;
    total++;

    const error = (message) => issues.push({ row: rowNumber, level: "error", message });
    const warn = (message) => issues.push({ row: rowNumber, level: "warning", message });

    const text = cell(col.question);
    if (!text) {
      error("The question is empty.");
      continue;
    }
    const options = Array.from({ length: optionCols.length }, (_, i) => cell(optionCols[i]));
    const filled = options.filter(Boolean);
    const answerRaw = cell(col.answer);

    let type = parseType(cell(col.type));
    if (type === null) {
      error(`Unknown type “${cell(col.type)}”. Use mcq_single, mcq_multi or fill.`);
      continue;
    }
    let correct = [];
    if (type !== "fill" && filled.length > 0) {
      correct = parseOptionAnswer(answerRaw, options);
      if (correct === null) {
        error(`Couldn't read the answer “${answerRaw}”. Use option letters like B or A,C.`);
        continue;
      }
    }
    if (!type) type = filled.length >= 2 ? (correct.length > 1 ? "mcq_multi" : "mcq_single") : "fill";

    const question = { type, text, options: [], correct: [], answers: [], difficulty: "", marks: 1, row: rowNumber };
    if (type === "fill") {
      if (filled.length) warn("Options are ignored for fill in the blank.");
      question.answers = answerRaw.split("|").map((a) => a.trim()).filter(Boolean);
      if (!question.answers.length) {
        error("No accepted answer given.");
        continue;
      }
    } else {
      if (filled.length < 2) {
        error("An MCQ needs at least two options.");
        continue;
      }
      if (!correct.length) {
        error("No correct option given in the answer column.");
        continue;
      }
      const blank = correct.find((i) => !options[i]);
      if (blank !== undefined) {
        error(`The answer points to option ${String.fromCharCode(65 + blank)}, which is empty.`);
        continue;
      }
      if (type === "mcq_single" && correct.length > 1) {
        error(`A single-correct question can have one answer, but this one lists ${correct.length}.`);
        continue;
      }
      const lower = filled.map((o) => o.toLowerCase());
      if (new Set(lower).size !== lower.length) {
        error("Two options are the same.");
        continue;
      }
      // Drop empty option cells and move the correct indexes with the rest.
      const newIndex = new Map();
      options.forEach((option, i) => {
        if (option) {
          newIndex.set(i, question.options.length);
          question.options.push(option);
        }
      });
      question.correct = correct.map((i) => newIndex.get(i)).sort((a, b) => a - b);
    }

    const difficultyRaw = cell(col.difficulty);
    if (difficultyRaw) {
      const difficulty = DIFFICULTY_ALIASES[difficultyRaw.toLowerCase()];
      if (difficulty) question.difficulty = difficulty;
      else warn(`Difficulty “${difficultyRaw}” isn't easy, medium or hard, so it was left empty.`);
    }
    const marksRaw = cell(col.marks);
    if (marksRaw) {
      const marks = Number(marksRaw);
      if (marks > 0 && marks <= 100) question.marks = marks;
      else warn(`Marks “${marksRaw}” isn't a number between 0 and 100, so it's 1.`);
    }

    const key = normalizeText(text);
    if (seen.has(key)) {
      warn(seen.get(key) === 0 ? "Already in this exam, so it was skipped." : `Same question as row ${seen.get(key)}, so it was skipped.`);
      continue;
    }
    seen.set(key, rowNumber);
    questions.push(question);
  }
  return { questions, issues, total };
}

function readRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });
}

export async function parseQuestionFile(file, existingTexts = []) {
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return parseQuestionRows(readRows(book.Sheets[book.SheetNames[0]]), existingTexts);
}

const ROLL_RE = /^[a-z]\d{6}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// An email, or an RGUKT roll number like N210368, as a lowercase email.
export function normalizeStudent(raw) {
  const value = String(raw ?? "").trim().replace(/^["'<(]+|["'>),;.]+$/g, "").toLowerCase();
  if (ROLL_RE.test(value)) return value + STUDENT_DOMAIN;
  if (EMAIL_RE.test(value)) return value;
  return null;
}

export function extractStudents(text) {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  for (const token of String(text).split(/[\s,;]+/).filter(Boolean)) {
    const email = normalizeStudent(token);
    if (!email) invalid.push(token);
    else if (!seen.has(email)) {
      seen.add(email);
      valid.push(email);
    }
  }
  return { valid, invalid };
}

// Any sheet, any column: picks up every email or roll number it can find and
// ignores names, headers and other text.
export async function parseStudentFile(file) {
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const valid = [];
  const invalid = [];
  const seen = new Set();
  for (const name of book.SheetNames) {
    for (const row of readRows(book.Sheets[name])) {
      for (const cell of row) {
        for (const token of String(cell ?? "").split(/[\s,;]+/).filter(Boolean)) {
          const email = normalizeStudent(token);
          if (email && !seen.has(email)) {
            seen.add(email);
            valid.push(email);
          } else if (!email && token.includes("@")) {
            invalid.push(token);
          }
        }
      }
    }
  }
  return { valid, invalid };
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exam";

export function exportResults(title, rows, questions) {
  const statusLabel = { submitted: "Submitted", in_progress: "Writing", not_started: "Not started" };
  const students = [
    ["Roll number", "Name", "Email", "Set", "Status", "Score", "Out of", "Percent", "Violations", "Refreshes", "Copy/paste blocked", "Started", "Submitted", "How it was submitted"],
    ...rows.map((r) => [
      r.roll, r.name, r.email, r.set, statusLabel[r.status] || r.status, r.score ?? "", r.max_score ?? "", r.percent ?? "",
      r.violations, r.refreshes, r.clipboard_blocks, formatDateTime(r.started_at), formatDateTime(r.submitted_at), SUBMIT_REASONS[r.submit_reason] || "",
    ]),
  ];
  const analysis = [
    ["#", "Type", "Difficulty", "Question", "Times shown", "Correct", "Partly correct", "Wrong", "Unanswered", "% correct"],
    ...questions.map((q) => [
      q.number, QUESTION_TYPES[q.type]?.label || q.type, q.difficulty || "", q.text, q.shown, q.correct_count, q.partial, q.wrong, q.unanswered,
      q.shown ? Math.round((q.correct_count / q.shown) * 100) : "",
    ]),
  ];
  const book = XLSX.utils.book_new();
  const studentSheet = XLSX.utils.aoa_to_sheet(students);
  studentSheet["!cols"] = [{ wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 5 }, { wch: 11 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 10 }, { wch: 9 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 24 }];
  const analysisSheet = XLSX.utils.aoa_to_sheet(analysis);
  analysisSheet["!cols"] = [{ wch: 4 }, { wch: 16 }, { wch: 10 }, { wch: 70 }, { wch: 11 }, { wch: 8 }, { wch: 13 }, { wch: 7 }, { wch: 11 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(book, studentSheet, "Students");
  XLSX.utils.book_append_sheet(book, analysisSheet, "Questions");
  XLSX.writeFile(book, `${slug(title)}-results.xlsx`);
}
