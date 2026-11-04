import { jsPDF } from "jspdf";
import { QUESTION_TYPES, SUBMIT_REASONS, formatDateTime, formatNumber, formatSpan, languageLabel, letter, paperLabels, partGroups, splitShared, testLabels, testOutcome } from "./format";

// A4 portrait, in points.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 46;
const WIDTH = PAGE_W - MARGIN * 2;
const FOOTER = 26;

const INK = [17, 24, 39];
const INK_2 = [55, 65, 81];
const MUTED = [107, 114, 128];
const LINE = [226, 232, 240];
const TINT = [245, 246, 249];
const GOOD = [21, 128, 61];
const BAD = [185, 28, 28];
const WARN = [161, 98, 7];

// Outcome boxes: text colour, fill and border.
const BOX = {
  good: [GOOD, [220, 252, 231], [134, 239, 172]],
  bad: [BAD, [254, 226, 226], [252, 165, 165]],
  warn: [WARN, [254, 243, 199], [252, 211, 77]],
  muted: [MUTED, [241, 245, 249], [203, 213, 225]],
};
const TEST_BOX = { passed: ["Passed", "good"], failed: ["Not passed", "bad"], skipped: ["Not run", "muted"], none: ["Not checked", "muted"] };

const RESULT = {
  correct: ["Correct", GOOD],
  partial: ["Partly correct", WARN],
  wrong: ["Wrong", BAD],
  unanswered: ["Not answered", MUTED],
  pending: ["Waiting for the AI check", WARN],
  not_graded: ["", MUTED],
};

// The PDF's built-in fonts only cover Western European characters, so other
// symbols get a readable stand-in instead of a garbled glyph.
const STAND_INS = {
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~", "−": "-", "–": "-", "—": "-",
  "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "•": "*", "✓": "v", "✔": "v", "✗": "x", "σ": "sigma", "π": "pi",
  "ρ": "rho", "⋈": "|><|", "∪": " union ", "∩": " intersect ", "∈": " in ", "∉": " not in ", "⊆": " subset of ", "¬": "not ",
  "∧": " and ", "∨": " or ", "\t": "    ",
};
const safe = (text) =>
  String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\x20-\x7e\xa0-\xff]/g, (ch) => STAND_INS[ch] ?? "?");

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exam";
const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : "");

/** Lays text out top to bottom, starting a new page whenever the current one is full. */
class Writer {
  constructor(doc) {
    this.doc = doc;
    this.y = MARGIN;
    this.owner = "";
    this.owners = {}; // page number → whose sheet it is, for the footer
  }

  newPage() {
    this.doc.addPage();
    this.y = MARGIN;
    this.owners[this.doc.getNumberOfPages()] = this.owner;
  }

  room(height) {
    if (this.y + height > PAGE_H - MARGIN - FOOTER) this.newPage();
  }

  font(size, style = "normal", color = INK, family = "helvetica") {
    this.doc.setFont(family, style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  text(value, { x = MARGIN, width = WIDTH, size = 10, style = "normal", color = INK, family = "helvetica", leading = 1.38 } = {}) {
    this.font(size, style, color, family);
    const height = size * leading;
    for (const line of this.doc.splitTextToSize(safe(value), width)) {
      this.room(height);
      this.doc.text(line, x, this.y + size * 0.82);
      this.y += height;
    }
  }

  /** A monospace block on a tinted background, continuing onto the next page if long. */
  code(value) {
    const size = 8.6;
    const height = size * 1.42;
    const pad = 6;
    const empty = !String(value ?? "").trim();
    this.font(size, "normal", empty ? MUTED : INK, "courier");
    const lines = empty ? ["(nothing written)"] : this.doc.splitTextToSize(safe(value), WIDTH - pad * 2);
    lines.forEach((line, i) => {
      const top = i === 0 ? pad : 0;
      const box = height + top + (i === lines.length - 1 ? pad : 0);
      if (this.y + box > PAGE_H - MARGIN - FOOTER) {
        this.newPage();
        this.font(size, "normal", empty ? MUTED : INK, "courier");
      }
      // Text and shapes share one fill colour in a PDF, so set the tint every time.
      this.doc.setFillColor(...TINT);
      this.doc.rect(MARGIN, this.y, WIDTH, box, "F");
      this.doc.setTextColor(...(empty ? MUTED : INK));
      this.doc.text(line, MARGIN + pad, this.y + top + size * 0.85);
      this.y += box;
    });
    this.y += 5;
  }

  /** Coloured boxes in a row, wrapping onto more rows: [{ text, tone }]. */
  boxes(items) {
    const size = 8.2;
    const height = 15;
    const gap = 5;
    let x = MARGIN;
    this.room(height + gap);
    for (const { text, tone } of items) {
      const [color, fill, border] = BOX[tone];
      this.font(size, "bold", color);
      const label = safe(text);
      const width = this.doc.getTextWidth(label) + 14;
      if (x > MARGIN && x + width > MARGIN + WIDTH) {
        x = MARGIN;
        this.y += height + gap;
        this.room(height + gap);
        this.font(size, "bold", color);
      }
      this.doc.setFillColor(...fill);
      this.doc.setDrawColor(...border);
      this.doc.setLineWidth(0.6);
      this.doc.roundedRect(x, this.y, width, height, 3, 3, "FD");
      this.doc.setTextColor(...color);
      this.doc.text(label, x + 7, this.y + 10.4);
      x += width + gap;
    }
    this.y += height + gap + 2;
  }

  rule(gap = 10) {
    this.room(gap * 2);
    this.y += gap;
    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.7);
    this.doc.line(MARGIN, this.y, MARGIN + WIDTH, this.y);
    this.y += gap;
  }
}

function statusOf(student, internal) {
  if (student.status === "in_progress") return "Still writing";
  if (student.status !== "submitted") return "Not started";
  if (internal) return "Finished";
  return student.submit_reason && student.submit_reason !== "submitted" ? SUBMIT_REASONS[student.submit_reason] || "Submitted" : "Submitted";
}

function scoreOf(student) {
  if (student.score === null || student.score === undefined) return "Not marked yet";
  return `${formatNumber(student.score)} / ${formatNumber(student.max_score)} (${formatNumber(student.percent)}%)`;
}

function summary(w, exam, sheets) {
  const internal = exam.type === "internal";
  w.text(exam.title, { size: 17, style: "bold" });
  w.text(`${internal ? "Question papers" : "Answer sheets"} · ${sheets.length} ${sheets.length === 1 ? "student" : "students"} · made ${formatDateTime(new Date())}`, { size: 9.5, color: MUTED });
  w.y += 14;
  const columns = internal
    ? [["Roll number", 0], ["Name", 92], ["Set", 270], ["Started", 305], ["Finished", 405]]
    : [["Roll number", 0], ["Name", 92], ["Set", 250], ["Status", 285], ["Score", 395]];
  const row = (cells, { bold = false, tint = false } = {}) => {
    w.room(17);
    if (tint) {
      w.doc.setFillColor(...TINT);
      w.doc.rect(MARGIN, w.y, WIDTH, 17, "F");
    }
    w.font(8.8, bold ? "bold" : "normal", bold ? MUTED : INK);
    cells.forEach((cell, i) => {
      const next = columns[i + 1]?.[1] ?? WIDTH;
      const [text] = w.doc.splitTextToSize(safe(cell), next - columns[i][1] - 6);
      w.doc.text(text || "", MARGIN + 4 + columns[i][1], w.y + 11.5);
    });
    w.y += 17;
  };
  row(columns.map(([label]) => label), { bold: true });
  sheets.forEach(({ student: s }, i) =>
    row(
      internal
        ? [s.roll, s.name || s.email, String(s.set), formatDateTime(s.started_at), s.submitted_at ? formatDateTime(s.submitted_at) : "Still writing"]
        : [s.roll, s.name || s.email, String(s.set), statusOf(s, false), s.status === "submitted" ? scoreOf(s) : "-"],
      { tint: i % 2 === 0 }
    )
  );
}

function details(w, exam, s) {
  const internal = exam.type === "internal";
  const taken = s.started_at && s.submitted_at ? formatSpan(new Date(s.submitted_at) - new Date(s.started_at)) : "-";
  const pairs = [
    ["Student", s.name ? `${s.roll} · ${s.name}` : s.roll],
    ["Email", s.email],
    ["Set", String(s.set)],
    ["Status", statusOf(s, internal)],
    ["Started", formatDateTime(s.started_at)],
    ["Submitted", s.submitted_at ? formatDateTime(s.submitted_at) : "-"],
    ["Time taken", taken],
    internal ? null : ["Score", scoreOf(s)],
    ["Violations", `${s.violations} · ${s.clipboard_blocks} copy/paste blocked${s.runs ? ` · ${s.runs} code checks` : ""}`],
  ].filter(Boolean);
  const half = WIDTH / 2;
  for (let i = 0; i < pairs.length; i += 2) {
    w.room(16);
    pairs.slice(i, i + 2).forEach(([label, value], column) => {
      const x = MARGIN + column * half;
      w.font(8.6, "bold", MUTED);
      w.doc.text(label.toUpperCase(), x, w.y + 9);
      w.font(9.6, "normal", INK);
      const [text] = w.doc.splitTextToSize(safe(value), half - 78);
      w.doc.text(text || "", x + 72, w.y + 9);
    });
    w.y += 16;
  }
}

function options(w, item) {
  const choices = item.options || [];
  const selected = item.selected || [];
  const order = item.display_order?.length ? item.display_order : choices.map((_, i) => i);
  order.forEach((index, position) => {
    const picked = selected.includes(index);
    const correct = (item.correct || []).includes(index);
    const note = picked && correct ? "   (picked, correct)" : correct ? "   (correct answer)" : picked ? "   (picked)" : "";
    w.text(`${picked ? "[x]" : "[  ]"}  ${letter(position)}.  ${choices[index]}${note}`, {
      x: MARGIN + 10,
      width: WIDTH - 10,
      size: 9.6,
      style: picked ? "bold" : "normal",
      color: correct ? GOOD : picked ? BAD : INK_2,
    });
  });
  if (!selected.length) w.text("No option picked.", { x: MARGIN + 10, size: 9, color: MUTED });
}

function code(w, item, aiFailed) {
  w.text(`Student's code · ${languageLabel(item.language)}`, { size: 8.6, style: "bold", color: MUTED });
  w.y += 2;
  w.code(item.code);
  const tests = item.test_cases || [];
  if (item.run) {
    w.text(`AI check: ${item.run.percent}% correct${item.run.current ? "" : " (this check was of an earlier version of the code)"}`, { size: 9.6, style: "bold", color: INK_2 });
    w.y += 2;
    if (tests.length) {
      const labels = testLabels(tests);
      w.boxes(
        tests.map((t, i) => {
          const [text, tone] = TEST_BOX[testOutcome(item.run, t)];
          return { text: `${labels[i]}: ${text}`, tone };
        })
      );
    } else {
      // No test cases: the AI's correctness decides, with the same 80% bar students see.
      w.boxes([item.run.percent >= 80 ? { text: "Passed", tone: "good" } : { text: "Not passed", tone: "bad" }]);
    }
  } else if (String(item.code || "").trim()) {
    w.y += 2;
    if (aiFailed) {
      w.boxes([{ text: "AI error", tone: "warn" }]);
      w.text("The AI evaluation pipeline couldn't check this answer, so the teacher marks it by hand.", { size: 9, color: WARN });
    } else {
      w.boxes([{ text: "Not checked by the AI yet", tone: "muted" }]);
    }
  }
}

/** A shaded bar over a part's questions (II (a) to II (e)), with the marks for all of it. */
function partHeader(w, part, items, internal, shared) {
  const awarded = items.reduce((sum, item) => sum + (item.awarded || 0), 0);
  const max = items.reduce((sum, item) => sum + (item.max || 0), 0);
  w.room(90); // keep the bar with its first question
  w.doc.setFillColor(...TINT);
  w.doc.rect(MARGIN, w.y, WIDTH, 20, "F");
  w.font(10.5, "bold", INK);
  w.doc.text(safe(`Part ${part}  ·  ${items.length} questions`), MARGIN + 7, w.y + 13.6);
  w.font(9.6, "bold", INK_2);
  w.doc.text(safe(internal ? `${formatNumber(max)} marks` : `${formatNumber(awarded)} / ${formatNumber(max)} marks`), MARGIN + WIDTH - 7, w.y + 13.6, { align: "right" });
  w.y += 26;
  if (shared) {
    w.text(shared, { size: 9.4, color: INK_2 });
    w.y += 8;
  }
}

function question(w, item, internal, grading, label, text = item.text) {
  w.room(64); // keep a question's heading with its first lines
  const heading = [label || `Q${item.number}`, item.type === "code" ? languageLabel(item.language) : internal ? "" : QUESTION_TYPES[item.type]?.label, capitalize(item.difficulty)]
    .filter(Boolean)
    .join("  ·  ");
  const aiFailed = grading === "failed" && item.status === "pending";
  const [result, color] = aiFailed ? ["AI error", WARN] : RESULT[item.status] || RESULT.unanswered;
  const marks = internal
    ? `${formatNumber(item.max)} marks`
    : `${formatNumber(item.awarded)} / ${formatNumber(item.max)} marks${result ? `  ·  ${result}` : ""}${item.overridden ? "  ·  set by the teacher" : ""}`;
  w.font(10, "bold", INK);
  w.doc.text(safe(heading), MARGIN, w.y + 9);
  w.font(9.4, "bold", internal ? MUTED : color);
  w.doc.text(safe(marks), MARGIN + WIDTH, w.y + 9, { align: "right" });
  w.y += 17;
  w.text(text, { size: 10.4 });
  w.y += 4;
  if (item.type === "code") code(w, item, aiFailed);
  else if (item.type === "fill") {
    w.text(`Student wrote: ${item.answer_text || "(nothing)"}`, { x: MARGIN + 10, width: WIDTH - 10, size: 9.6, style: "bold", color: item.status === "correct" ? GOOD : item.answer_text ? BAD : MUTED });
    w.text(`Accepted: ${(item.accepted || []).join("  |  ")}`, { x: MARGIN + 10, width: WIDTH - 10, size: 9.2, color: MUTED });
  } else if (item.type !== "descriptive") options(w, item);
  if (item.marked) w.text("Marked for review by the student.", { size: 8.6, color: WARN });
  w.rule(9);
}

function sheet(w, exam, { student, items }) {
  const internal = exam.type === "internal";
  w.owner = `${student.roll}${student.name ? ` · ${student.name}` : ""}`;
  if (w.doc.getNumberOfPages() > 1 || w.y > MARGIN) w.newPage();
  else w.owners[1] = w.owner;
  w.text(exam.title, { size: 14, style: "bold" });
  w.text(internal ? "Question paper" : "Answer sheet", { size: 9.5, color: MUTED });
  w.y += 10;
  details(w, exam, student);
  w.rule(10);
  if (!items.length) w.text("This student hasn't been dealt a paper yet.", { size: 10, color: MUTED });
  const labels = paperLabels(items.map((item) => item.text));
  for (const group of partGroups(items)) {
    const parts = group.part && group.items.length > 1;
    const { shared, own } = parts ? splitShared(group.items.map((item) => item.text)) : { shared: "", own: [] };
    if (parts) partHeader(w, group.part, group.items, internal, shared);
    group.items.forEach((item, j) => question(w, item, internal, student.grading, labels?.[items.indexOf(item)], own[j]));
  }
}

/**
 * Builds one PDF of answer sheets: a summary page (for more than one student),
 * then each student's sheet starting on its own page.
 */
export function buildAnswerSheets(exam, sheets) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = new Writer(doc);
  doc.setProperties({ title: `${exam.title} · answer sheets`, creator: "Examify" });
  if (sheets.length > 1) {
    w.owners[1] = "Summary";
    summary(w, exam, sheets);
  }
  for (const s of sheets) sheet(w, exam, s);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, PAGE_H - MARGIN + 4, MARGIN + WIDTH, PAGE_H - MARGIN + 4);
    w.font(8, "normal", MUTED);
    const [left] = doc.splitTextToSize(safe(`Examify · ${exam.title}${w.owners[page] ? ` · ${w.owners[page]}` : ""}`), WIDTH - 80);
    doc.text(left, MARGIN, PAGE_H - MARGIN + 16);
    doc.text(`Page ${page} of ${pages}`, MARGIN + WIDTH, PAGE_H - MARGIN + 16, { align: "right" });
  }
  return doc;
}

export function downloadAnswerSheets(exam, sheets, fileName) {
  buildAnswerSheets(exam, sheets).save(fileName || `${slug(exam.title)}-answer-sheets.pdf`);
}

export const answerSheetFileName = (exam, student) => `${slug(exam.title)}-${slug(student?.roll || "student")}.pdf`;
