import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, CircleDashed, Hourglass, PartyPopper, ScrollText, X, XCircle } from "lucide-react";
import { Logo, ThemeToggle } from "../../../components/layout/AppShell";
import { QuestionText } from "../../../components/exam/ExamBits";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { ProgressRing } from "../../../components/ui/Data";
import { Spinner } from "../../../components/ui/Feedback";
import { cn } from "../../../lib/cn";
import { studentApi } from "../../../lib/api";
import { SUBMIT_REASONS, formatNumber, languageLabel, letter, scoreTone, testLabels } from "../../../lib/format";

const RESULT = {
  correct: { label: "Correct", tone: "success", icon: CheckCircle2 },
  partial: { label: "Partly correct", tone: "warning", icon: AlertTriangle },
  wrong: { label: "Wrong", tone: "danger", icon: X },
  unanswered: { label: "Not answered", tone: "neutral", icon: CircleDashed },
  pending: { label: "Being checked", tone: "info", icon: Hourglass },
};

function CodeReview({ item }) {
  const tests = item.tests || [];
  const labels = testLabels(tests);
  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="mb-1 text-[11px] font-medium text-muted">Your code · {languageLabel(item.language)}</div>
        {item.code ? (
          <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-subtle/50 p-3 font-mono text-[12.5px] leading-relaxed text-ink">{item.code}</pre>
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-center text-[13px] text-muted">You didn't write anything</div>
        )}
      </div>
      {tests.length > 0 && item.outcomes?.length > 0 && (
        <ul className="space-y-1.5">
          {tests.map((test, i) => {
            const passed = Boolean(item.outcomes.find((t) => t.id === test.id)?.executes);
            return (
              <li
                key={test.id}
                className={cn("rounded-lg border px-3 py-2 text-[13px]", passed ? "border-success/30 bg-success-soft text-success-text" : "border-danger/25 bg-danger-soft text-danger-text")}
              >
                <div className="flex items-center gap-2">
                  {passed ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                  <span className="font-medium">{labels[i]}</span>
                  <span className="ml-auto text-xs font-medium">{passed ? "Passed" : "Failed"}</span>
                </div>
                {!passed && (
                  <div className="mt-1.5 truncate pl-6 font-mono text-xs text-ink-2" title={`${test.input} → ${test.output}`}>
                    {test.input ? `${test.input.split("\n")[0]} → ` : "Expected: "}
                    {test.output.split("\n").join(", ")}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {item.solution && (
        <div>
          <div className="mb-1 text-[11px] font-medium text-success-text">Your teacher's answer</div>
          <pre className="max-h-72 overflow-auto rounded-lg border border-success/25 bg-success-soft/50 p-3 font-mono text-[12.5px] leading-relaxed text-ink">{item.solution}</pre>
        </div>
      )}
    </div>
  );
}

function ReviewItem({ item }) {
  const result = RESULT[item.status] || RESULT.unanswered;
  return (
    <Card className="p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-muted">Q{item.number}</span>
        {item.type === "code" && <Badge tone="primary">{languageLabel(item.language)}</Badge>}
        <Badge tone={result.tone} icon={result.icon} className="ml-auto">
          {result.label}
          {item.percent !== undefined && item.percent !== null && ` · ${item.percent}%`} · {formatNumber(item.awarded)}/{formatNumber(item.max)}
        </Badge>
      </div>
      <QuestionText text={item.text} className="text-[15px] leading-relaxed text-ink" />
      {item.type === "code" ? (
        <CodeReview item={item} />
      ) : item.type === "fill" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-subtle/60 px-3 py-2">
            <div className="text-[11px] font-medium text-muted">Your answer</div>
            <div className="text-sm font-medium text-ink">{item.answer_text || "—"}</div>
          </div>
          <div className="rounded-lg border border-success/25 bg-success-soft px-3 py-2">
            <div className="text-[11px] font-medium text-success-text">Correct answer</div>
            <div className="text-sm font-medium text-success-text">{item.accepted.join(" or ")}</div>
          </div>
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {item.options.map((option, i) => {
            const picked = item.selected.includes(option.id);
            const correct = item.correct.includes(option.id);
            return (
              <li
                key={option.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]",
                  correct ? "border-success/30 bg-success-soft text-success-text" : picked ? "border-danger/30 bg-danger-soft text-danger-text" : "border-line text-ink-2"
                )}
              >
                <span className="w-4 font-semibold">{letter(i)}</span>
                <span className="flex-1">{option.text}</span>
                {picked && <span className="text-xs font-medium">Your pick</span>}
                {correct && <Check className="h-4 w-4" strokeWidth={3} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default function ResultScreen({ info, state: submitted }) {
  const [state, setState] = useState(submitted);
  useEffect(() => setState(submitted), [submitted]);

  // An external's code is checked after submitting: wait for the AI here.
  const checking = info.type === "external" && state.grading === "pending";
  useEffect(() => {
    if (!checking) return undefined;
    const timer = setInterval(() => {
      studentApi
        .attempt(state.id)
        .then((paper) => setState(paper.state))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [checking, state.id]);

  const internal = info.type === "internal";
  const failed = info.type === "external" && state.grading === "failed";
  const result = state.result;
  const showScore = !checking && !failed && result && result.visibility !== "none" && result.percent !== null && result.percent !== undefined;
  const tone = showScore ? scoreTone(result.percent) : "primary";
  const reason = state.submit_reason && state.submit_reason !== "submitted" ? SUBMIT_REASONS[state.submit_reason] : null;

  return (
    <div className="min-h-screen bg-canvas bg-dots">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <Card className="animate-scale-in overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 via-transparent to-violet-500/10 px-6 pb-8 pt-10 text-center sm:px-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft text-success-text">
              {internal ? <ScrollText className="h-6 w-6" /> : showScore && result.percent >= 70 ? <PartyPopper className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{internal ? "Question paper closed" : "Exam submitted"}</h1>
            <p className="mt-1 text-sm text-muted">{info.title}</p>
            {reason && (
              <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-[13px] font-medium text-warning-text">
                <AlertTriangle className="h-3.5 w-3.5" />
                {reason}
              </div>
            )}

            {checking ? (
              <div className="mx-auto mt-8 flex max-w-sm flex-col items-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
                  <Spinner className="h-7 w-7 text-primary-text" />
                </div>
                <p className="mt-4 text-[15px] font-medium text-ink">Checking your code…</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">Your answers are safely in. The AI is checking each one; your score shows up here in a minute or two.</p>
              </div>
            ) : showScore ? (
              <div className="mt-8 flex flex-col items-center">
                <ProgressRing value={result.percent} tone={tone}>
                  <span className="text-5xl font-semibold tracking-tight text-ink">{formatNumber(result.percent)}%</span>
                </ProgressRing>
                <p className="mt-4 text-[15px] font-medium text-ink">
                  {formatNumber(result.score)} out of {formatNumber(result.max_score)} marks
                </p>
              </div>
            ) : (
              <p className="mx-auto mt-6 max-w-sm text-[15px] leading-relaxed text-ink-2">
                {internal
                  ? "You're done. Your teacher marks your programs separately."
                  : failed
                    ? "Your answers are in. Some of your code couldn't be checked automatically, so your teacher will finish marking it."
                    : "Your answers are in. Your teacher will share the results."}
              </p>
            )}
          </div>
          <div className="flex justify-center border-t border-line px-6 py-4">
            <Link to="/student" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink shadow-sm hover:bg-primary/90">
              <ArrowLeft className="h-4 w-4" />
              Back to my exams
            </Link>
          </div>
        </Card>

        {showScore && result.review?.length > 0 && (
          <div className="mt-8 space-y-3">
            <h2 className="text-base font-semibold text-ink">Your answers</h2>
            {result.review.map((item) => (
              <ReviewItem key={item.number} item={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
