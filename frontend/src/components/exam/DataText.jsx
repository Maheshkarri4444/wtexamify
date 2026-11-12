import { useState } from "react";
import { ChevronDown, Database } from "lucide-react";
import { cn } from "../../lib/cn";
import { hasTable, parseBlocks } from "../../lib/tables";

// Column names like Registration_Date may wrap after their underscores.
const wrapAtUnderscores = (name) => String(name).replace(/_/g, "_\u200b");

export function DataTable({ title, header, rows, className }) {
  const wide = header.length >= 6; // a little tighter, so wide tables fit beside the editor
  return (
    <figure className={cn("min-w-0", className)}>
      {title && <figcaption className="mb-1 text-[12.5px] font-semibold text-ink">{title}</figcaption>}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-left font-mono text-[12px] leading-snug">
          <thead className="bg-subtle text-ink-2">
            <tr>
              {header.map((cell, i) => (
                <th key={i} scope="col" className={cn("border-b border-line py-1.5 align-bottom font-semibold", wide ? "px-2" : "px-2.5")}>
                  {wrapAtUnderscores(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td key={i} className={cn("whitespace-nowrap py-1 text-ink", wide ? "px-2" : "px-2.5", cell === "NULL" && "italic text-muted")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

// CREATE TABLE statements: long, and the tables themselves show the columns.
const isDefinition = (text) => /^\s*create\s/i.test(text) && text.includes("\n");

function TextBlock({ text }) {
  // Definitions start folded.
  const [open, setOpen] = useState(false);
  if (isDefinition(text)) {
    return (
      <div className="rounded-lg border border-line">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-ink-2">
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition", open && "rotate-180")} />
          Table definitions (CREATE TABLE)
        </button>
        {open && <pre className="overflow-x-auto border-t border-line px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-2">{text}</pre>}
      </div>
    );
  }
  return <pre className="whitespace-pre-wrap break-words rounded-lg bg-subtle/70 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink">{text}</pre>;
}

/**
 * Text with tables in it, such as a schema with its rows, or a query's expected
 * output. With definitions off (students), CREATE TABLE statements are left out
 * whenever the tables themselves are shown.
 */
export function DataText({ text, sql = false, definitions = true, className }) {
  let blocks = parseBlocks(text, { sql });
  if (!definitions && blocks.some((block) => block.kind === "table")) blocks = blocks.filter((block) => block.kind === "table" || !isDefinition(block.text));
  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, i) => (block.kind === "table" ? <DataTable key={i} {...block} /> : <TextBlock key={i} text={block.text} />))}
    </div>
  );
}

/** A labelled input or output: a table when it is one, otherwise the text as written. */
export function OutputBlock({ label, text, sql = false, className }) {
  return (
    <div className={className}>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      {hasTable(text, { sql }) ? (
        <DataText text={text} sql={sql} />
      ) : (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-subtle/70 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink">{text}</pre>
      )}
    </div>
  );
}

/** A folding section of tables and data: for the whole exam, a set or one question. */
export function ContextSection({ title, text, sql = true, definitions = true, defaultOpen = true, className }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!text) return null;
  return (
    <section className={cn("rounded-xl border border-line", className)}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold text-ink">
        <Database className="h-4 w-4 text-muted" />
        {title}
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted transition", open && "rotate-180")} />
      </button>
      {open && <DataText text={text} sql={sql} definitions={definitions} className="border-t border-line px-4 py-3" />}
    </section>
  );
}
