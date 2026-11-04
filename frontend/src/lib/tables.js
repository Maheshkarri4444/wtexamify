// Tables written as text: one row per line, columns separated by |, blocks
// separated by blank lines. Schemas, expected outputs and the PDF share these.

const cellsOf = (line) => line.split("|").map((cell) => cell.trim());

// Rows of values separated by |, all as wide as the heading row. A query's
// one-column result has no |, so for SQL a single capitalised heading
// (SNAME, COUNT) over its values counts as a table too.
function asTable(lines, sql) {
  if (lines.length < 2) return null;
  if (lines.every((line) => line.includes("|"))) {
    const width = cellsOf(lines[0]).length;
    if (!lines.every((line) => cellsOf(line).length === width)) return null;
    return { header: cellsOf(lines[0]), rows: lines.slice(1).map(cellsOf) };
  }
  if (sql && /^[A-Z][A-Z0-9_]*$/.test(lines[0].trim()) && !lines.some((line) => line.includes("|"))) {
    return { header: [lines[0].trim()], rows: lines.slice(1).map((line) => [line.trim()]) };
  }
  return null;
}

/**
 * Splits text at blank lines into tables and plain text. A block whose rows
 * are separated by | is a table; with a title line first (Table: Employee) it
 * is a titled table.
 */
export function parseBlocks(text, { sql = false } = {}) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.replace(/\s+$/, "")).filter((line) => line.trim() !== "");
      const table = asTable(lines, sql);
      if (table) return { kind: "table", title: "", ...table };
      if (lines.length >= 3 && !lines[0].includes("|")) {
        const titled = asTable(lines.slice(1), sql);
        if (titled) return { kind: "table", title: lines[0].trim().replace(/^table\s*:\s*/i, "").replace(/:$/, ""), ...titled };
      }
      return { kind: "text", text: lines.join("\n") };
    })
    .filter((block) => block.kind === "table" || block.text);
}

export const hasTable = (text, options) => parseBlocks(text, options).some((block) => block.kind === "table");
