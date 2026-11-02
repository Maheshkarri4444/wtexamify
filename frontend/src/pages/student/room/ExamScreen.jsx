import { useEffect, useRef } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, CloudOff, Flag, KeyRound, Loader2, Send, Eraser } from "lucide-react";
import { Logo, ThemeToggle } from "../../../components/layout/AppShell";
import { QuestionText } from "../../../components/exam/ExamBits";
import { Badge, Kbd } from "../../../components/ui/Badge";
import { Button, IconButton } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Meter } from "../../../components/ui/Data";
import { cn } from "../../../lib/cn";
import { formatClock, isAnswered, letter, pluralize } from "../../../lib/format";
import { useNow } from "../../../lib/hooks";

const PROMPT = {
  mcq_single: "Choose one answer",
  mcq_multi: "Choose every correct answer",
  fill: "Type the missing word or phrase",
};

export function Timer({ deadline, offsetRef, onExpire }) {
  const now = useNow(500);
  const left = new Date(deadline).getTime() - (now + offsetRef.current);
  const expire = useRef(onExpire);
  const fired = useRef(false);
  useEffect(() => {
    expire.current = onExpire;
  });
  useEffect(() => {
    fired.current = false;
  }, [deadline]);
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      expire.current();
    }
  }, [left]);
  const tone = left < 60000 ? "danger" : left < 300000 ? "warning" : "neutral";
  return (
    <div
      role="timer"
      aria-label="Time left"
      className={cn(
        "flex h-10 items-center gap-2 rounded-xl border px-3 font-mono text-[15px] font-semibold tabular-nums",
        tone === "danger" && "animate-pulse border-danger/40 bg-danger-soft text-danger-text",
        tone === "warning" && "border-warning/40 bg-warning-soft text-warning-text",
        tone === "neutral" && "border-line bg-surface text-ink"
      )}
    >
      <Clock3 className="h-4 w-4" />
      {formatClock(left)}
    </div>
  );
}

function ScreenPreview({ stream }) {
  const video = useRef(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
      <div className="relative h-[68px] w-[121px] overflow-hidden rounded-lg bg-black shadow-pop ring-1 ring-line">
        <video ref={video} autoPlay muted playsInline className="h-full w-full object-cover" />
        <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/65 px-1 py-px text-[9px] font-bold tracking-wide text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          LIVE
        </span>
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-0.5 pt-2 text-[9px] font-medium text-white/90">Screen shared</span>
      </div>
    </div>
  );
}

function SaveIndicator({ save }) {
  const map = {
    idle: { icon: Check, text: "All saved", tone: "text-muted" },
    saved: { icon: Check, text: "Saved", tone: "text-success-text" },
    pending: { icon: Loader2, text: "Saving…", tone: "text-muted", spin: true },
    saving: { icon: Loader2, text: "Saving…", tone: "text-muted", spin: true },
    offline: { icon: CloudOff, text: "Offline, retrying", tone: "text-warning-text" },
    error: { icon: CloudOff, text: "Not saved, retrying", tone: "text-danger-text" },
  };
  const item = map[save.status] || map.idle;
  return (
    <span className={cn("hidden items-center gap-1.5 text-[13px] font-medium lg:flex", item.tone)} aria-live="polite">
      <item.icon className={cn("h-3.5 w-3.5", item.spin && "animate-spin")} />
      {item.text}
    </span>
  );
}

function stateOf(question, answers, visited, current) {
  const answer = answers[question.id];
  return { answered: isAnswered(answer), marked: Boolean(answer?.marked), visited: visited.has(question.id), current };
}

function Palette({ questions, answers, visited, current, onNavigate, onSubmit }) {
  const answered = questions.filter((q) => isAnswered(answers[q.id])).length;
  const marked = questions.filter((q) => answers[q.id]?.marked).length;
  const notAnswered = questions.filter((q) => visited.has(q.id) && !isAnswered(answers[q.id])).length;
  const notVisited = questions.filter((q) => !visited.has(q.id)).length;
  return (
    <Card className="h-fit lg:sticky lg:top-24">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-ink">Questions</span>
          <span className="text-[13px] tabular-nums text-muted">
            {answered} of {questions.length} answered
          </span>
        </div>
        <Meter value={(answered / Math.max(1, questions.length)) * 100} className="mt-2.5" label="Questions answered" />
      </div>
      <div className="grid grid-cols-5 gap-2 p-5">
        {questions.map((q, i) => {
          const s = stateOf(q, answers, visited, i === current);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onNavigate(i)}
              aria-label={`Question ${i + 1}${s.answered ? ", answered" : ""}${s.marked ? ", marked for review" : ""}`}
              aria-current={s.current ? "step" : undefined}
              className={cn(
                "relative flex h-10 items-center justify-center rounded-lg text-sm font-semibold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                s.answered
                  ? "bg-primary text-primary-ink hover:bg-primary/90"
                  : s.marked
                    ? "bg-warning-soft text-warning-text ring-1 ring-inset ring-warning/40"
                    : s.visited
                      ? "bg-danger-soft text-danger-text ring-1 ring-inset ring-danger/25"
                      : "bg-subtle text-muted hover:text-ink",
                s.current && "ring-2 ring-ink ring-offset-2 ring-offset-surface"
              )}
            >
              {i + 1}
              {s.marked && <Flag className={cn("absolute -right-1 -top-1 h-3.5 w-3.5 fill-current", s.answered ? "text-warning" : "text-warning-text")} />}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line px-5 py-4 text-xs text-ink-2">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-primary" /> Answered · {answered}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-danger-soft ring-1 ring-danger/30" /> Not answered · {notAnswered}
        </span>
        <span className="flex items-center gap-2">
          <Flag className="h-3 w-3 fill-current text-warning-text" /> For review · {marked}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-subtle ring-1 ring-line" /> Not visited · {notVisited}
        </span>
      </div>
      <div className="border-t border-line p-5">
        <Button className="w-full" icon={Send} onClick={onSubmit}>
          Submit exam
        </Button>
      </div>
    </Card>
  );
}

function QuestionPanel({ question, index, total, answer, onAnswer, onNavigate, onReview }) {
  const input = useRef(null);
  useEffect(() => {
    if (question.type === "fill") input.current?.focus();
  }, [question.id, question.type]);

  const selected = answer?.selected || [];
  const choose = (id) => {
    if (question.type === "mcq_single") onAnswer(question.id, { selected: selected[0] === id ? [] : [id] });
    else onAnswer(question.id, { selected: selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id] });
  };

  // A–H pick options and ←/→ move, except while typing in an answer box.
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea")) return;
      if (e.key === "ArrowRight" && index < total - 1) onNavigate(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      else if (question.type !== "fill" && /^[a-h]$/i.test(e.key)) {
        const option = question.options[e.key.toLowerCase().charCodeAt(0) - 97];
        if (option) choose(option.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const last = index === total - 1;
  return (
    <Card className="flex min-h-[28rem] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-ink">
            Question {index + 1} <span className="font-normal text-muted">of {total}</span>
          </span>
          <Badge tone="primary">{PROMPT[question.type]}</Badge>
          <span className="text-xs text-muted">{pluralize(question.marks, "mark")}</span>
        </div>
        <Button size="sm" variant={answer?.marked ? "soft" : "ghost"} icon={Flag} onClick={() => onAnswer(question.id, { marked: !answer?.marked })}>
          {answer?.marked ? "Marked for review" : "Mark for review"}
        </Button>
      </div>

      <div key={question.id} className="flex-1 animate-fade-in px-5 py-6 sm:px-7 sm:py-8">
        <QuestionText text={question.text} className="text-lg leading-relaxed text-ink sm:text-[19px]" />
        {question.type === "fill" ? (
          <div className="mt-8 max-w-xl">
            <input
              ref={input}
              value={answer?.text || ""}
              onChange={(e) => onAnswer(question.id, { text: e.target.value })}
              maxLength={500}
              spellCheck={false}
              autoComplete="off"
              placeholder="Type your answer"
              className="h-14 w-full rounded-xl border-2 border-line bg-surface px-4 text-lg text-ink shadow-sm transition placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            />
            <p className="mt-2 text-[13px] text-muted">Capital letters and spaces don't matter.</p>
          </div>
        ) : (
          <div className="mt-7 grid gap-2.5" role={question.type === "mcq_single" ? "radiogroup" : "group"}>
            {question.options.map((option, i) => {
              const on = selected.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  role={question.type === "mcq_single" ? "radio" : "checkbox"}
                  aria-checked={on}
                  onClick={() => choose(option.id)}
                  className={cn(
                    "group flex w-full items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    on ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong hover:bg-subtle/60"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center border-2 text-sm font-bold transition",
                      question.type === "mcq_single" ? "rounded-full" : "rounded-lg",
                      on ? "border-primary bg-primary text-primary-ink" : "border-line-strong text-muted group-hover:border-ink/30"
                    )}
                  >
                    {on ? <Check className="h-4 w-4" strokeWidth={3} /> : letter(i)}
                  </span>
                  <span className={cn("min-w-0 flex-1 break-words text-[15px]", on ? "font-medium text-ink" : "text-ink-2")}>{option.text}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" icon={Eraser} onClick={() => onAnswer(question.id, { selected: [], text: "" })} disabled={!isAnswered(answer)}>
            Clear
          </Button>
          <span className="hidden items-center gap-1.5 text-xs text-muted xl:flex">
            {question.type !== "fill" && (
              <>
                <Kbd>A</Kbd>–<Kbd>{letter(question.options.length - 1)}</Kbd> to choose ·
              </>
            )}
            <Kbd>←</Kbd>
            <Kbd>→</Kbd> to move
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={ChevronLeft} onClick={() => onNavigate(index - 1)} disabled={index === 0}>
            Previous
          </Button>
          {last ? (
            <Button icon={Send} onClick={onReview}>
              Review and submit
            </Button>
          ) : (
            <Button iconRight={ChevronRight} onClick={() => onNavigate(index + 1)}>
              {isAnswered(answer) ? "Save and next" : "Next"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function ExamScreen({ info, state, questions, answers, current, visited, save, stream, offsetRef, onAnswer, onNavigate, onExpire, onSubmit, onTools }) {
  const question = questions[current];
  return (
    <div className="no-select min-h-screen bg-canvas">
      <header className={cn("sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-xl", stream ? "h-[84px]" : "h-16")}>
        <div className="relative mx-auto flex h-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo compact />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{info.title}</div>
            <div className="text-xs text-muted">Set {state.set_number}</div>
          </div>
          {stream && <ScreenPreview stream={stream} />}
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <SaveIndicator save={save} />
            <Timer deadline={state.deadline_at} offsetRef={offsetRef} onExpire={onExpire} />
            <IconButton icon={KeyRound} label="Teacher tools" variant="secondary" onClick={onTools} />
            <ThemeToggle />
            <Button icon={Send} onClick={onSubmit} className="hidden sm:inline-flex">
              Submit
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {question && (
          <QuestionPanel
            question={question}
            index={current}
            total={questions.length}
            answer={answers[question.id]}
            onAnswer={onAnswer}
            onNavigate={onNavigate}
            onReview={onSubmit}
          />
        )}
        <Palette questions={questions} answers={answers} visited={visited} current={current} onNavigate={onNavigate} onSubmit={onSubmit} />
      </main>
    </div>
  );
}
