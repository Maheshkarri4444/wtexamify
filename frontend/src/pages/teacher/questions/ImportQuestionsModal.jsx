import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud, XCircle } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Feedback";
import { Modal } from "../../../components/ui/Overlay";
import { cn } from "../../../lib/cn";
import { downloadQuestionTemplate, parseQuestionFile } from "../../../lib/excel";
import { QUESTION_TYPES, letter, pluralize } from "../../../lib/format";

function answerSummary(q) {
  if (q.type === "fill") return q.answers.join(" | ");
  return q.correct.map((i) => `${letter(i)}. ${q.options[i]}`).join(", ");
}

export default function ImportQuestionsModal({ open, onClose, existingTexts, onImport }) {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setResult(null);
      setFileName("");
    }
  }, [open]);

  const readFile = async (file) => {
    if (!file) return;
    setParsing(true);
    setFileName(file.name);
    try {
      setResult(await parseQuestionFile(file, existingTexts));
    } catch {
      toast.error("Couldn't read that file. Save it as .xlsx or .csv and try again.");
      setResult(null);
    } finally {
      setParsing(false);
    }
  };

  const confirm = async () => {
    setImporting(true);
    const questions = result.questions.map((question) => {
      const copy = { ...question };
      delete copy.row;
      return copy;
    });
    const ok = await onImport(questions);
    setImporting(false);
    if (ok) onClose();
  };

  const errors = result?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = result?.issues.filter((i) => i.level === "warning") ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={FileSpreadsheet}
      title="Import questions from Excel"
      description="Each row becomes a question. You'll see what's ready, and why any row is skipped, before anything is added."
      footer={
        result ? (
          <>
            <Button variant="ghost" onClick={() => inputRef.current?.click()} className="mr-auto">
              Choose another file
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={confirm} loading={importing} disabled={!result.questions.length}>
              Import {pluralize(result.questions.length, "question")}
            </Button>
          </>
        ) : null
      }
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => {
        readFile(e.target.files?.[0]);
        e.target.value = "";
      }} />

      {!result ? (
        <div className="space-y-4 pt-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              readFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition",
              dragging ? "border-primary bg-primary-soft" : "border-line-strong bg-subtle/40 hover:border-primary/50 hover:bg-primary-soft/40"
            )}
          >
            {parsing ? (
              <Spinner className="h-8 w-8 text-primary" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-primary-text shadow-sm ring-1 ring-line">
                <UploadCloud className="h-6 w-6" />
              </span>
            )}
            <span className="mt-4 font-semibold text-ink">{parsing ? `Reading ${fileName}…` : "Drop your spreadsheet here, or click to choose"}</span>
            <span className="mt-1 text-sm text-muted">.xlsx, .xls or .csv · first sheet · one question per row</span>
          </button>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="text-sm font-medium text-ink">Start from a template</div>
            <p className="mt-0.5 text-[13px] text-muted">Each template has example rows and a “How to fill it” sheet. Mix types freely in one file.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ["mixed", "All types"],
                ["mcq_single", QUESTION_TYPES.mcq_single.label],
                ["mcq_multi", QUESTION_TYPES.mcq_multi.label],
                ["fill", QUESTION_TYPES.fill.label],
              ].map(([kind, label]) => (
                <Button key={kind} variant="secondary" size="sm" icon={Download} onClick={() => downloadQuestionTemplate(kind)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-muted" />
            <span className="font-medium text-ink">{fileName}</span>
            <span className="text-muted">· {pluralize(result.total, "row")} read</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Ready to import", value: result.questions.length, icon: CheckCircle2, tone: "text-success-text" },
              { label: "Skipped", value: errors.length + warnings.filter((w) => w.message.includes("skipped")).length, icon: XCircle, tone: "text-danger-text" },
              { label: "Warnings", value: warnings.filter((w) => !w.message.includes("skipped")).length, icon: AlertTriangle, tone: "text-warning-text" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-xl border border-line bg-subtle/50 px-4 py-3">
                <div className="flex items-center gap-1.5 text-[13px] text-muted">
                  <Icon className={cn("h-4 w-4", tone)} />
                  {label}
                </div>
                <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
              </div>
            ))}
          </div>

          {result.issues.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-line">
              {result.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2.5 border-b border-line px-3.5 py-2 text-[13px] last:border-0">
                  {issue.level === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-text" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-text" />}
                  <span className="w-14 shrink-0 font-medium tabular-nums text-ink-2">Row {issue.row}</span>
                  <span className="text-ink-2">{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {result.questions.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 bg-subtle text-xs text-muted">
                    <tr>
                      <th className="px-3.5 py-2 font-medium">Row</th>
                      <th className="px-3.5 py-2 font-medium">Type</th>
                      <th className="px-3.5 py-2 font-medium">Question</th>
                      <th className="px-3.5 py-2 font-medium">Answer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {result.questions.slice(0, 100).map((q) => (
                      <tr key={q.row} className="align-top">
                        <td className="px-3.5 py-2 tabular-nums text-muted">{q.row}</td>
                        <td className="px-3.5 py-2">
                          <Badge tone="primary">{QUESTION_TYPES[q.type].short}</Badge>
                        </td>
                        <td className="max-w-[22rem] px-3.5 py-2 text-ink">
                          <span className="line-clamp-2">{q.text}</span>
                        </td>
                        <td className="max-w-[14rem] px-3.5 py-2 text-success-text">
                          <span className="line-clamp-2">{answerSummary(q)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.questions.length > 100 && <div className="border-t border-line bg-subtle/60 px-3.5 py-2 text-xs text-muted">Showing the first 100 of {result.questions.length}.</div>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
