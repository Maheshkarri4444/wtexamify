import { useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Clipboard, Clock3, KeyRound, Lock, LogIn, Play, RefreshCw, Send, Unlock, X } from "lucide-react";
import { DifficultyBadge, QuestionText, QuestionTypeBadge } from "../../components/exam/ExamBits";
import { Badge } from "../../components/ui/Badge";
import { Drawer } from "../../components/ui/Overlay";
import { PageLoader } from "../../components/ui/Feedback";
import { Segmented } from "../../components/ui/Form";
import { cn } from "../../lib/cn";
import { teacherApi } from "../../lib/api";
import { SUBMIT_REASONS, formatNumber, formatTime, letter } from "../../lib/format";

const RESULT = {
  correct: { label: "Correct", tone: "success", icon: CheckCircle2 },
  partial: { label: "Partly correct", tone: "warning", icon: AlertTriangle },
  wrong: { label: "Wrong", tone: "danger", icon: X },
  unanswered: { label: "Not answered", tone: "neutral", icon: CircleDashed },
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

function AnswerItem({ item }) {
  const result = RESULT[item.status] || RESULT.unanswered;
  const order = item.display_order.length ? item.display_order : item.options.map((_, i) => i);
  return (
    <div className="border-b border-line px-6 py-5 last:border-0">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm font-semibold text-muted">Q{item.number}</span>
        <QuestionTypeBadge type={item.type} />
        <DifficultyBadge difficulty={item.difficulty} />
        <Badge tone={result.tone} icon={result.icon} className="ml-auto">
          {result.label} · {formatNumber(item.awarded)}/{formatNumber(item.max)}
        </Badge>
      </div>
      <QuestionText text={item.text} className="text-[15px] leading-relaxed text-ink" />
      {item.type === "fill" ? (
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

export default function AttemptDrawer({ examId, attemptId, onClose }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState("answers");

  useEffect(() => {
    if (!attemptId) return undefined;
    let cancelled = false;
    setData(null);
    setView("answers");
    teacherApi
      .attempt(examId, attemptId)
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setData({ error: true }));
    return () => {
      cancelled = true;
    };
  }, [examId, attemptId]);

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
            {student.percent !== null && student.percent !== undefined && (
              <span className="font-medium text-ink">
                {formatNumber(student.score)} / {formatNumber(student.max_score)} ({formatNumber(student.percent)}%)
              </span>
            )}
            {student.submit_reason && <span>{SUBMIT_REASONS[student.submit_reason]}</span>}
            {student.status === "in_progress" && <span className="text-info-text">Still writing, scores so far</span>}
          </span>
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
                { value: "answers", label: "Answers", count: data.items.length },
                { value: "timeline", label: "Timeline", count: data.events.length },
              ]}
            />
            <span className="text-xs text-muted">
              {student.violations} violations · {student.refreshes} refreshes · {student.clipboard_blocks} copy/paste blocked
            </span>
          </div>
          {view === "answers" ? (
            data.items.map((item) => <AnswerItem key={item.id} item={item} />)
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
