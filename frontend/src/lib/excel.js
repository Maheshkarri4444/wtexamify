import * as XLSX from "xlsx";
import { MAX_PRIVATE_TESTS, MAX_PUBLIC_TESTS, QUESTION_TYPES, SUBMIT_REASONS, formatDateTime, languageLabel } from "./format";

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

const INTERNAL_COLUMNS = ["question", "difficulty", "marks"];
const INTERNAL_SAMPLES = [
  ["Create a table STUDENT(roll, name, branch, cgpa), insert five records and display the students with a CGPA above 8.", "easy", 10],
  ["Write a PL/SQL block that prints the first 10 Fibonacci numbers.", "medium", 10],
  ["Create a trigger that stops any update from reducing an employee's salary.", "hard", 10],
];
const INTERNAL_HELP = [
  ["Column", "What to put in it"],
  ["question", "The question as students should read it."],
  ["difficulty", "Optional: easy, medium or hard. Needed only if you balance sets by difficulty."],
  ["marks", "Optional. Shown on the paper. Defaults to 1."],
];

const EXTERNAL_COLUMNS = [
  "question", "language", "answer", "starter_code", "marks", "difficulty",
  "public_1_input", "public_1_output", "public_2_input", "public_2_output",
  "private_1_input", "private_1_output", "private_2_input", "private_2_output", "private_3_input", "private_3_output",
];
const EXTERNAL_SAMPLES = [
  [
    "List the names of CSE employees who earn more than 50000, highest salary first.", "sql",
    "SELECT name FROM employees WHERE dept = 'CSE' AND salary > 50000 ORDER BY salary DESC;", "", 10, "easy",
    "The employees table in the shared schema", "Arjun\nRavi", "", "",
    "The same table plus (5, 'Kiran', 'CSE', 50001)", "Arjun\nRavi\nKiran", "", "", "", "",
  ],
  [
    "Read a number n and print the sum of its digits.", "python", "n = input().strip()\nprint(sum(int(d) for d in n))", "n = input()", 10, "medium",
    "1234", "10", "9", "9", "1000000", "1", "99999", "45", "", "",
  ],
  ["Write a function that returns the factorial of n.", "any", "def fact(n):\n    return 1 if n <= 1 else n * fact(n - 1)", "", 5, "easy", "", "", "", "", "", "", "", "", "", ""],
];
const EXTERNAL_HELP = [
  ["Column", "What to put in it"],
  ["question", "The question as students should read it. For SQL, refer to the tables in the exam's shared schema."],
  ["language", "sql, python, c, cpp, java, javascript, php, other, or any (the student picks their language)."],
  ["answer", "Your answer: code or text. Students never see it; the AI compares their code with it."],
  ["starter_code", "Optional. Code the editor starts with, such as a function signature."],
  ["marks", "Optional. Defaults to 1. A student who is 80% correct gets 80% of the marks."],
  ["difficulty", "Optional: easy, medium or hard. Needed only if you balance sets by difficulty."],
  ["public_1_* / public_2_*", "Up to 2 public test cases (input and expected output). Students see them next to the question."],
  ["private_N_input / private_N_output", "Up to 10 private test cases (add columns up to private_10_*). Students see only whether they pass; when their code fails one, they're shown that test, like LeetCode. Leave every test column empty to have the AI only compare the code with your answer."],
];

function writeTemplate(columns, rows, help, widths, fileName) {
  const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  const helpSheet = XLSX.utils.aoa_to_sheet(help);
  helpSheet["!cols"] = [{ wch: 26 }, { wch: 120 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Questions");
  XLSX.utils.book_append_sheet(book, helpSheet, "How to fill it");
  XLSX.writeFile(book, fileName);
}

export function downloadQuestionTemplate(kind = "mixed", examType = "viva") {
  if (examType === "internal") {
    writeTemplate(INTERNAL_COLUMNS, INTERNAL_SAMPLES, INTERNAL_HELP, [90, 11, 7], "examify-internal-template.xlsx");
    return;
  }
  if (examType === "external") {
    writeTemplate(EXTERNAL_COLUMNS, EXTERNAL_SAMPLES, EXTERNAL_HELP, [60, 10, 60, 24, 7, 11, 28, 18, 28, 18, 28, 18, 28, 18, 28, 18], "examify-external-template.xlsx");
    return;
  }
  const rows = kind === "mixed" ? [...SAMPLES.mcq_single, ...SAMPLES.mcq_multi, ...SAMPLES.fill] : SAMPLES[kind];
  writeTemplate(COLUMNS, rows, HELP, [12, 60, 20, 20, 20, 20, 20, 20, 24, 11, 7], `examify-viva-${TEMPLATE_FILES[kind]}-template.xlsx`);
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

const LANGUAGE_ALIASES = {
  sql: ["sql", "mysql", "plsql", "pl/sql", "oracle", "postgres", "postgresql", "sqlite"],
  python: ["python", "py", "python3"],
  c: ["c"],
  cpp: ["cpp", "c++", "cplusplus"],
  java: ["java"],
  javascript: ["javascript", "js", "node", "nodejs"],
  php: ["php"],
  other: ["other", "text", "plain", "plaintext", "pseudocode"],
  any: ["any", "anylanguage", "choice", "student", "studentschoice", "*"],
};

function parseLanguage(raw) {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s'’_-]+/g, "");
  if (!value) return "";
  for (const [language, aliases] of Object.entries(LANGUAGE_ALIASES)) {
    if (aliases.includes(value)) return language;
  }
  return null;
}

// public_1_input, private 3 output, public_test_2_expected → { group, n, part }. The
// older test_1_input / input_1 columns (with hidden_tests) read as group "legacy".
function testColumn(header) {
  const parts = "(input|output|in|out|expected|expected_output)";
  let match = header.match(new RegExp(`^(public|private)_?(?:test_?)?(\\d+)_?${parts}$`));
  if (match) return { group: match[1], n: Number(match[2]), part: match[3].startsWith("in") ? "input" : "output" };
  match = header.match(new RegExp(`^test_?(\\d+)_?${parts}$`)) || header.match(new RegExp(`^${parts}_?(\\d+)$`));
  if (!match) return null;
  const [n, part] = /^\d+$/.test(match[1]) ? [Number(match[1]), match[2]] : [Number(match[2]), match[1]];
  return { group: "legacy", n, part: part.startsWith("in") ? "input" : "output" };
}

// Shared row checks for internal and external sheets: header, duplicates, difficulty and marks.
function parseRowsWith(rows, existingTexts, extraFields, buildQuestion) {
  const issues = [];
  const questions = [];
  const aliases = { ...FIELD_ALIASES, ...extraFields };
  const headerAt = rows.findIndex((row, i) => i < 15 && row.some((cell) => aliases.question.includes(normalizeHeader(cell))));
  if (headerAt < 0) {
    issues.push({ row: 1, level: "error", message: "No header row with a “question” column was found. Download the template to see the layout." });
    return { questions, issues, total: 0 };
  }
  const col = {};
  const tests = {};
  rows[headerAt].forEach((cell, i) => {
    const header = normalizeHeader(cell);
    for (const [field, names] of Object.entries(aliases)) {
      if (col[field] === undefined && names.includes(header)) {
        col[field] = i;
        return;
      }
    }
    const test = testColumn(header);
    if (test) {
      const key = `${test.group}:${test.n}`;
      tests[key] = { group: test.group, n: test.n, ...tests[key], [test.part]: i };
    }
  });

  const seen = new Map(existingTexts.map((text) => [normalizeText(text), 0]));
  let total = 0;
  for (let r = headerAt + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.every((value) => String(value ?? "").trim() === "")) continue;
    total++;
    const rowNumber = r + 1;
    const cell = (index) => (index === undefined ? "" : String(row[index] ?? "").trim());
    const raw = (index) => (index === undefined ? "" : String(row[index] ?? ""));
    const error = (message) => issues.push({ row: rowNumber, level: "error", message });
    const warn = (message) => issues.push({ row: rowNumber, level: "warning", message });

    const text = cell(col.question);
    if (!text) {
      error("The question is empty.");
      continue;
    }
    const question = { text, difficulty: "", marks: 1, row: rowNumber };
    if (!buildQuestion(question, { cell, raw, col, tests, error, warn })) continue;

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

function parseInternalRows(rows, existingTexts) {
  return parseRowsWith(rows, existingTexts, {}, (question) => {
    question.type = "descriptive";
    return true;
  });
}

function parseExternalRows(rows, existingTexts) {
  const extra = {
    language: ["language", "lang"],
    answer: ["answer", "solution", "reference", "reference_answer", "teacher_answer", "key"],
    starter: ["starter_code", "starter", "template", "boilerplate"],
    hidden: ["hidden_tests", "hidden", "hidden_test_cases"],
  };
  return parseRowsWith(rows, existingTexts, extra, (question, { cell, raw, col, tests, error }) => {
    question.type = "code";
    const language = parseLanguage(cell(col.language));
    if (language === null || !language) {
      error(language === null ? `Unknown language “${cell(col.language)}”. Use sql, python, c, cpp, java, javascript, php, other or any.` : "The language is empty.");
      return false;
    }
    question.language = language;
    question.solution = raw(col.answer).trim();
    if (!question.solution) {
      error("Your answer is empty. The AI needs it to check students' code.");
      return false;
    }
    question.starter_code = raw(col.starter).replace(/\s+$/, "");
    const hiddenRaw = cell(col.hidden).toLowerCase();
    const legacyHidden = hiddenRaw.split(/[\s,;]+/).filter(Boolean).map(Number);
    const public_ = [];
    const private_ = [];
    const order = { public: 0, private: 1, legacy: 2 };
    for (const test of Object.values(tests).sort((a, b) => order[a.group] - order[b.group] || a.n - b.n)) {
      const input = raw(test.input).trim();
      const output = raw(test.output).trim();
      if (!input && !output) continue;
      const hidden = test.group === "private" || (test.group === "legacy" && (hiddenRaw === "all" || legacyHidden.includes(test.n)));
      const name = test.group === "legacy" ? `Test ${test.n}` : `${test.group === "public" ? "Public" : "Private"} test ${test.n}`;
      if (!output) {
        error(`${name} has an input but no expected output.`);
        return false;
      }
      (hidden ? private_ : public_).push({ input, output, hidden });
    }
    if (public_.length > MAX_PUBLIC_TESTS) {
      error(`Use at most ${MAX_PUBLIC_TESTS} public test cases. Move the others to private_N columns.`);
      return false;
    }
    if (private_.length > MAX_PRIVATE_TESTS) {
      error(`Use at most ${MAX_PRIVATE_TESTS} private test cases.`);
      return false;
    }
    question.test_cases = [...public_, ...private_];
    return true;
  });
}

/**
 * Turns spreadsheet rows into questions, with a row-by-row report.
 * existingTexts are questions already in the exam, so re-imports don't duplicate.
 */
export function parseQuestionRows(rows, existingTexts = [], examType = "viva") {
  if (examType === "internal") return parseInternalRows(rows, existingTexts);
  if (examType === "external") return parseExternalRows(rows, existingTexts);
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

export async function parseQuestionFile(file, existingTexts = [], examType = "viva") {
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return parseQuestionRows(readRows(book.Sheets[book.SheetNames[0]]), existingTexts, examType);
}

const ROLL_RE = /^[a-z]\d{6}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A student's email as a lowercase address. Only full emails count: students
// sign in with more than one kind of email, so a roll number alone isn't enough.
export function normalizeStudent(raw) {
  const value = String(raw ?? "").trim().replace(/^["'<(]+|["'>),;.]+$/g, "").toLowerCase();
  return EMAIL_RE.test(value) ? value : null;
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

// Any sheet, any column: picks up every email it can find and ignores names,
// headers and other text. Roll numbers on their own are reported, not added.
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
          } else if (!email && (token.includes("@") || ROLL_RE.test(token))) {
            invalid.push(token);
          }
        }
      }
    }
  }
  return { valid, invalid };
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exam";

const GRADING_LABELS = { pending: "AI still checking", failed: "AI check failed", done: "Checked" };

/** Writes a sheet from [header, width, value(row)] columns. */
function sheetFrom(columns, items) {
  const sheet = XLSX.utils.aoa_to_sheet([columns.map(([header]) => header), ...items.map((item) => columns.map(([, , value]) => value(item)))]);
  sheet["!cols"] = columns.map(([, wch]) => ({ wch }));
  return sheet;
}

export function exportResults(title, rows, questions, examType = "viva") {
  const statusLabel = { submitted: "Submitted", in_progress: "Writing", not_started: "Not started" };
  const marked = examType !== "internal";
  const studentColumns = [
    ["Roll number", 12, (r) => r.roll],
    ["Name", 24, (r) => r.name],
    ["Email", 28, (r) => r.email],
    ["Set", 5, (r) => r.set],
    ["Status", 11, (r) => statusLabel[r.status] || r.status],
    ...(marked
      ? [
          ["Score", 7, (r) => r.score ?? ""],
          ["Out of", 7, (r) => r.max_score ?? ""],
          ["Percent", 8, (r) => r.percent ?? ""],
        ]
      : []),
    ...(examType === "external"
      ? [
          ["Code checks", 11, (r) => r.runs],
          ["AI marking", 16, (r) => GRADING_LABELS[r.grading] || ""],
        ]
      : []),
    ["Violations", 10, (r) => r.violations],
    ["Refreshes", 9, (r) => r.refreshes],
    ["Copy/paste blocked", 16, (r) => r.clipboard_blocks],
    ["Started", 18, (r) => formatDateTime(r.started_at)],
    ["Submitted", 18, (r) => formatDateTime(r.submitted_at)],
    ["How it was submitted", 24, (r) => SUBMIT_REASONS[r.submit_reason] || ""],
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheetFrom(studentColumns, rows), "Students");
  if (marked) {
    const questionColumns = [
      ["#", 4, (q) => q.number],
      [examType === "external" ? "Language" : "Type", 16, (q) => (q.type === "code" ? languageLabel(q.language) : QUESTION_TYPES[q.type]?.label || q.type)],
      ["Difficulty", 10, (q) => q.difficulty || ""],
      ["Question", 70, (q) => q.text],
      ["Times shown", 11, (q) => q.shown],
      [examType === "external" ? "Full marks" : "Correct", 10, (q) => q.correct_count],
      ["Partly correct", 13, (q) => q.partial],
      [examType === "external" ? "Zero" : "Wrong", 7, (q) => q.wrong],
      ["Unanswered", 11, (q) => q.unanswered],
      examType === "external"
        ? ["Average AI %", 12, (q) => (q.avg_percent ?? "")]
        : ["% correct", 10, (q) => (q.shown ? Math.round((q.correct_count / q.shown) * 100) : "")],
    ];
    XLSX.utils.book_append_sheet(book, sheetFrom(questionColumns, questions), "Questions");
  }
  XLSX.writeFile(book, `${slug(title)}-${marked ? "results" : "attendance"}.xlsx`);
}
