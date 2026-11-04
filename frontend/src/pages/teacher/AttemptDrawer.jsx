import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clipboard,
  Clock3,
  EyeOff,
  FileText,
  Hourglass,
  KeyRound,
  Lock,
  LogIn,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Unlock,
  X,
} from "lucide-react";
import { DifficultyBadge, QuestionText, QuestionTypeBadge } from "../../components/exam/ExamBits";
import { Badge } from "../../components/ui/Badge";
import { Button, IconButton } from "../../components/ui/Button";
import { Meter } from "../../components/ui/Data";
import { PageLoader } from "../../components/ui/Feedback";
import { Input, Segmented } from "../../components/ui/Form";
import { Drawer, InfoTip } from "../../components/ui/Overlay";
import { cn } from "../../lib/cn";
import { teacherApi } from "../../lib/api";
import { SUBMIT_REASONS, formatNumber, formatTime, languageLabel, letter, scoreTone, testLabels, timeAgo } from "../../lib/format";

const RESULT = {
  correct: { label: "Correct", tone: "success", icon: CheckCircle2 },
  partial: { label: "Partly correct", tone: "warning", icon: AlertTriangle },
  wrong: { label: "Wrong", tone: "danger", icon: X },
  unanswered: { label: "Not answered", tone: "neutral", icon: CircleDashed },
  pending: { label: "Waiting for AI check", tone: "info", icon: Hourglass },
  not_graded: { label: "Not marked here", tone: "neutral", icon: CircleDashed },
};

const EVENTS = {
  started: { label: "Started", icon: Play },
  submitted: { label: "Submitted", icon: Send },
  tab_hidden: { label: "Switched tab or window", icon: AlertTriangle, bad: true },
  window_blur: { label: "Left the exam window", icon: AlertTriangle, bad: true },
  fullscreen_exit: { label: "Exited fullscreen", icon: AlertTriangle, bad: true },
  screen_share_stopped: { label: "Stopped screen sharing", icon: AlertTriangle, bad: true },
  clipboard: { label: "Copy/paste blocked", icon: Clipboard },
  rejoined: { label: "Came back to the exam", icon: LogIn, bad: true },
  unlocked: { label: "Unlocked with copy code", icon: Unlock },
  teacher_unlock: { label: "Unlocked by teacher", icon: Unlock },
  refreshed: { label: "New set (refresh code)", icon: RefreshCw },
  teacher_new_set: { label: "New set from dashboard", icon: RefreshCw },
  time_added: { label: "Time added", icon: Clock3 },
  wrong_code: { label: "Wrong code entered", icon: KeyRound, bad: true },
  code_blocked: { label: "Code entry paused", icon: Lock, bad: true },
};

/** The marks for one answer, editable by the teacher. */
function MarksEditor({ item, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(item.awarded));
  const [saving, setSaving] = useState(false);
  const save = async (marks) => {
    setSaving(true);
    const ok = await onSave(item.id, marks);
    setSaving(false);
    if (ok) setEditing(false);
  };
  if (item.status === "not_graded") return null;
  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-ink">
          {formatNumber(item.awarded)}
          <span className="font-normal text-muted"> / {formatNumber(item.max)}</span>
        </span>
        {item.overridden && <Badge tone="warning">Set by you</Badge>}
        <IconButton
          icon={Pencil}
          label="Change marks"
          size="xs"
          onClick={() => {
            setValue(String(item.awarded));
            setEditing(true);
          }}
        />
      </span>
    );
  }
  const number = Number(value);
  const valid = value !== "" && number >= 0 && number <= item.max;
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save(number);
      }}
    >
      <Input autoFocus type="number" step="0.5" min={0} max={item.max} value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-20 text-right" />
      <span className="text-sm text-muted">/ {formatNumber(item.max)}</span>
      <Button type="submit" size="xs" icon={Check} loading={saving} disabled={!valid}>
        Save
      </Button>
      {item.overridden && (
        <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => save(null)} disabled={saving} title={`Back to the automatic ${formatNumber(item.auto)}`}>
          Auto
        </Button>
      )}
      <IconButton icon={X} label="Cancel" size="xs" onClick={() => setEditing(false)} />
    </form>
  );
}

function CodeAnswer({ item }) {
  const [showSolution, setShowSolution] = useState(false);
  const run = item.run;
  const tests = item.test_cases || [];
  const labels = testLabels(tests);
  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted">
          <span>Student's code · {languageLabel(item.language)}</span>
        </div>
        {item.code ? (
          <pre className="max-h-80 overflow-auto rounded-xl border border-line bg-subtle/50 p-3 font-mono text-[12.5px] leading-relaxed text-ink">{item.code}</pre>
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-[13px] text-muted">No code written</div>
        )}
      </div>
      {run ? (
        <div className="rounded-xl border border-line p-3">
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles className="h-4 w-4 text-primary-text" />
            <span className="text-sm font-semibold text-ink">{run.percent}% correct</span>
            <Meter value={run.percent} tone={scoreTone(run.percent)} className="max-w-[9rem] flex-1" label="AI correctness" />
            <span className="text-xs text-muted">
              {run.count > 0 ? `Student ran it ${run.count}×` : "Checked after submit"} · {timeAgo(run.at)}
            </span>
          </div>
          {!run.current && <p className="mt-2 text-xs text-warning-text">The student changed the code after this check, so it isn't counted. The final code is checked on submit.</p>}
          {tests.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {tests.map((test, i) => {
                const outcome = (run.tests || []).find((t) => t.id === test.id);
                return (
                  <li key={test.id} className="flex items-start gap-2.5 rounded-lg bg-subtle/60 px-3 py-2 text-[12.5px]">
                    {outcome?.executes ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                    <span className="w-28 shrink-0 font-semibold text-ink">{labels[i]}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-ink-2" title={`${test.input} → ${test.output}`}>
                      {test.input ? `${test.input.split("\n")[0]} → ` : ""}
                      {test.output.split("\n").join(", ")}
                    </span>
                    {test.hidden && <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-label="Private test" />}
                    <span className={cn("shrink-0 font-medium", outcome?.executes ? "text-success-text" : "text-danger-text")}>{outcome?.executes ? "Passed" : "Failed"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        item.code && <p className="text-xs text-muted">Not checked yet. It's checked automatically after the student submits.</p>
      )}
      <button type="button" onClick={() => setShowSolution((v) => !v)} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-text hover:underline">
        <ChevronDown className={cn("h-3.5 w-3.5 transition", showSolution && "rotate-180")} />
        {showSolution ? "Hide your answer" : "Compare with your answer"}
      </button>
      {showSolution && <pre className="max-h-64 overflow-auto rounded-xl border border-success/25 bg-success-soft/50 p-3 font-mono text-[12.5px] leading-relaxed text-ink">{item.solution}</pre>}
    </div>
  );
}

function AnswerItem({ item, onSaveMarks }) {
  const result = RESULT[item.status] || RESULT.unanswered;
  const order = item.display_order.length ? item.display_order : item.options.map((_, i) => i);
  return (
    <div className="border-b border-line px-6 py-5 last:border-0">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm font-semibold text-muted">Q{item.number}</span>
        {item.type === "code" ? <Badge tone="primary">{languageLabel(item.language)}</Badge> : item.type !== "descriptive" && <QuestionTypeBadge type={item.type} />}
        <DifficultyBadge difficulty={item.difficulty} />
        {item.type !== "descriptive" && (
          <Badge tone={result.tone} icon={result.icon}>
            {result.label}
            {item.percent !== null && item.percent !== undefined && ` · ${item.percent}%`}
          </Badge>
        )}
        <span className="ml-auto">
          <MarksEditor key={`${item.awarded}-${item.overridden}`} item={item} onSave={onSaveMarks} />
        </span>
      </div>
      <QuestionText text={item.text} className="text-[15px] leading-relaxed text-ink" />
      {item.type === "code" ? (
        <CodeAnswer item={item} />
      ) : item.type === "descriptive" ? null : item.type === "fill" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-subtle/60 px-3 py-2">
            <div className="text-[11px] font-medium text-muted">Student wrote</div>
            <div className={cn("text-sm font-medium", item.answer_text ? "text-ink" : "text-muted")}>{item.answer_text || "Nothing"}</div>
          </div>
          <div className="rounded-lg border border-success/25 bg-success-soft px-3 py-2">
            <div className="text-[11px] font-medium text-success-text">Accepted</div>
            <div className="text-sm font-medium text-success-text">{item.accepted.join(" | ")}</div>
          </div>
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {order.map((index, position) => {
            const picked = item.selected.includes(index);
            const correct = item.correct.includes(index);
            return (
              <li
                key={index}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]",
                  correct ? "border-success/30 bg-success-soft" : picked ? "border-danger/30 bg-danger-soft" : "border-line bg-surface"
                )}
              >
                <span className="w-4 font-semibold text-muted">{letter(position)}</span>
                <span className={cn("min-w-0 flex-1", correct ? "text-success-text" : picked ? "text-danger-text" : "text-ink-2")}>{item.options[index]}</span>
                {picked && <Badge tone={correct ? "success" : "danger"}>Picked</Badge>}
                {correct && <Check className="h-4 w-4 text-success-text" strokeWidth={3} />}
              </li>
            );
          })}
        </ul>
      )}
      {item.marked && <div className="mt-2 text-xs text-warning-text">Marked for review</div>}
    </div>
  );
}

export default function AttemptDrawer({ examId, examType, examTitle, attemptId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState("answers");
  const [regrading, setRegrading] = useState(false);

  const load = useCallback(() => {
    if (!attemptId) return Promise.resolve();
    return teacherApi
      .attempt(examId, attemptId)
      .then(setData)
      .catch(() => setData({ error: true }));
  }, [examId, attemptId]);

  useEffect(() => {
    if (!attemptId) return;
    setData(null);
    setView("answers");
    load();
  }, [attemptId, load]);

  // While the AI is still checking, keep the sheet fresh.
  useEffect(() => {
    if (data?.grading !== "pending") return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [data?.grading, load]);

  const saveMarks = async (questionId, marks) => {
    try {
      await teacherApi.setMarks(examId, attemptId, questionId, marks);
      await load();
      onChanged?.();
      toast.success(marks === null ? "Back to the automatic marks." : "Marks saved.");
      return true;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const regrade = async () => {
    setRegrading(true);
    try {
      await teacherApi.attemptAction(examId, attemptId, "regrade");
      toast.success("Checking every answer again with AI. This takes a moment.");
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRegrading(false);
    }
  };

  const downloadPdf = async () => {
    try {
      const { answerSheetFileName, downloadAnswerSheets } = await import("../../lib/answerSheetsPdf");
      const exam = { title: examTitle || "Exam", type: examType };
      downloadAnswerSheets(exam, [{ student: data.student, items: data.items }], answerSheetFileName(exam, data.student));
    } catch {
      toast.error("Couldn't make the PDF. Try again.");
    }
  };

  const student = data?.student;
  return (
    <Drawer
      open={Boolean(attemptId)}
      onClose={onClose}
      title={student ? `${student.roll} · ${student.name || student.email}` : "Answer sheet"}
      description={
        student && (
          <span className="flex flex-wrap items-center gap-x-3">
            <span>Set {student.set}</span>
            {examType !== "internal" && student.percent !== null && student.percent !== undefined && (
              <span className="font-medium text-ink">
                {formatNumber(student.score)} / {formatNumber(student.max_score)} ({formatNumber(student.percent)}%)
              </span>
            )}
            {student.submit_reason && <span>{SUBMIT_REASONS[student.submit_reason]}</span>}
            {student.status === "in_progress" && <span className="text-info-text">Still writing{examType === "internal" ? "" : ", scores so far"}</span>}
            {data.grading === "pending" && <span className="text-info-text">AI is still checking some answers…</span>}
            {data.grading === "failed" && <span className="text-danger-text">The AI couldn't check everything. Try “Re-check”.</span>}
          </span>
        )
      }
      actions={
        student && (
          <>
            {examType === "external" && student.status === "submitted" && (
              <Button size="sm" variant="secondary" icon={Sparkles} onClick={regrade} loading={regrading}>
                Re-check with AI
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={FileText} onClick={downloadPdf} title="Download this answer sheet as a PDF">
              PDF
            </Button>
          </>
        )
      }
    >
      {!data ? (
        <PageLoader label="Loading answers…" />
      ) : data.error ? (
        <div className="p-6 text-sm text-danger-text">Couldn't load this answer sheet.</div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-3">
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "answers", label: examType === "internal" ? "Paper" : "Answers", count: data.items.length },
                { value: "timeline", label: "Timeline", count: data.events.length },
              ]}
            />
            <span className="text-xs text-muted">
              {student.violations} violations · {student.refreshes} refreshes · {student.clipboard_blocks} copy/paste blocked
              {student.runs > 0 && ` · ${student.runs} code checks`}
              <InfoTip
                text="Violations: times the paper locked. Refreshes: new sets given with the refresh code. Copy/paste blocked: refused attempts, never counted as cheating. Code checks: times the student pressed Run."
                className="ml-1.5"
              />
            </span>
          </div>
          {view === "answers" ? (
            data.items.map((item) => <AnswerItem key={item.id} item={item} onSaveMarks={saveMarks} />)
          ) : (
            <ol className="relative space-y-0 px-6 py-5">
              {data.events.map((event, i) => {
                const meta = EVENTS[event.type] || { label: event.type, icon: CircleDashed };
                return (
                  <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < data.events.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-line" />}
                    <span className={cn("relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface", meta.bad ? "bg-danger-soft text-danger-text" : "bg-subtle text-ink-2")}>
                      <meta.icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="pt-1">
                      <div className="text-sm font-medium text-ink">{meta.label}</div>
                      <div className="text-xs text-muted">
                        {formatTime(event.at)}
                        {event.detail && ` · ${SUBMIT_REASONS[event.detail] || event.detail}`}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {data.user_agent && <div className="border-t border-line px-6 py-3 text-[11px] text-muted">Browser: {data.user_agent}</div>}
        </>
      )}
    </Drawer>
  );
}
