import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Database, EyeOff, Loader2, Play, RotateCcw, Send, Sparkles, XCircle } from "lucide-react";
import CodeEditor from "../../../components/exam/CodeEditor";
import { DifficultyBadge, QuestionText } from "../../../components/exam/ExamBits";
import { Badge, Kbd } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Meter } from "../../../components/ui/Data";
import { Select } from "../../../components/ui/Form";
import { cn } from "../../../lib/cn";
import { LANGUAGES, isAnswered, languageLabel, pluralize, scoreTone, timeAgo } from "../../../lib/format";
import { useNow } from "../../../lib/hooks";
import { checkIsCurrent, codeOf, languageOf } from "./codeAnswers";
import { RoomHeader } from "./ExamScreen";

// The server makes a student wait this long between checks.
const RUN_COOLDOWN_MS = 5000;

function QuestionTabs({ questions, answers, runs, current, onNavigate }) {
  return (
    <nav aria-label="Questions" className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-surface px-4 py-2 sm:px-6">
      {questions.map((question, i) => {
        const answer = answers[question.id];
        const run = runs[question.id];
        const written = isAnswered(answer);
        const active = i === current;
        return (
          <button
            key={question.id}
            type="button"
            onClick={() => onNavigate(i)}
            aria-current={active ? "step" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              active ? "bg-primary-soft text-primary-text ring-1 ring-inset ring-primary/25" : "text-ink-2 hover:bg-subtle"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", written ? "bg-primary" : "bg-line-strong")} aria-hidden />
            Question {i + 1}
            {checkIsCurrent(run, question, answer) && <span className="text-xs tabular-nums text-muted">{run.percent}%</span>}
          </button>
        );
      })}
    </nav>
  );
}

function Block({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-subtle/70 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink">{children}</pre>
    </div>
  );
}

function QuestionPane({ question, index, total, context, contextOpen, onToggleContext }) {
  const tests = question.tests || [];
  const publicTests = tests.filter((t) => !t.hidden);
  const privateCount = tests.length - publicTests.length;
  return (
    <div key={question.id} className="animate-fade-in space-y-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">
          Question {index + 1} <span className="font-normal text-muted">of {total}</span>
        </span>
        <Badge tone="primary">{languageLabel(question.language)}</Badge>
        <DifficultyBadge difficulty={question.difficulty} />
        <span className="ml-auto text-xs font-medium text-muted">{pluralize(question.marks, "mark")}</span>
      </div>
      <QuestionText text={question.text} className="text-[16px] leading-relaxed text-ink" />

      {context && (
        <section className="rounded-xl border border-line">
          <button type="button" onClick={onToggleContext} aria-expanded={contextOpen} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold text-ink">
            <Database className="h-4 w-4 text-muted" />
            Tables and data for every question
            <ChevronDown className={cn("ml-auto h-4 w-4 text-muted transition", contextOpen && "rotate-180")} />
          </button>
          {contextOpen && <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-line px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink-2">{context}</pre>}
        </section>
      )}

      <section>
        <h3 className="text-[13px] font-semibold text-ink">Test cases</h3>
        {tests.length === 0 ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">This question has no test cases. Your code is compared with your teacher's answer.</p>
        ) : (
          <div className="mt-2.5 space-y-3">
            {publicTests.map((test, i) => (
              <div key={test.id} className="rounded-xl border border-line p-3.5">
                <div className="mb-2 text-[13px] font-semibold text-ink">Public test {i + 1}</div>
                <div className="space-y-2.5">
                  {test.input && <Block label="Input">{test.input}</Block>}
                  <Block label="Expected output">{test.output}</Block>
                </div>
              </div>
            ))}
            {privateCount > 0 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-[13px] leading-relaxed text-muted">
                <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {pluralize(privateCount, "private test")} {privateCount === 1 ? "runs" : "run"} every time you press Run. If your code fails one, you'll see its input and expected output.
                </span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Outcome({ label, passed, dim }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px]",
        passed ? "border-success/30 bg-success-soft text-success-text" : "border-danger/25 bg-danger-soft text-danger-text",
        dim && "opacity-60"
      )}
    >
      {passed ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-xs font-medium">{passed ? "Passed" : "Failed"}</span>
    </li>
  );
}

function Working({ children }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-2">
      <Loader2 className="h-4 w-4 animate-spin text-primary-text" />
      {children}
    </div>
  );
}

/**
 * The result of a Run. Every test ran in one check; like LeetCode, the public
 * results show first, then the private ones, with any private test the code
 * failed shown in full. stage is "running", "private" (still revealing the
 * private results) or "done".
 */
function CheckResult({ question, run, current, stage }) {
  const tests = question.tests || [];
  const publicTests = tests.filter((t) => !t.hidden);
  const privateTests = tests.filter((t) => t.hidden);
  if (stage === "running") {
    return (
      <div className="px-4 py-4">
        <Working>{publicTests.length ? "Running the public test cases…" : tests.length ? "Running the test cases…" : "Comparing your code with your teacher's answer…"}</Working>
      </div>
    );
  }
  if (!run) {
    return (
      <div className="flex items-start gap-3 px-4 py-4 text-[13px] leading-relaxed text-muted">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" />
        <span>
          Press Run to dry-run your code{tests.length ? " against every test case, public and private" : ""}. An AI compares it with your teacher's answer and tells you how correct it is. It isn't a real compiler, so small
          syntax slips don't matter, but the logic does.
        </span>
      </div>
    );
  }
  const passed = (test) => Boolean((run.tests || []).find((t) => t.id === test.id)?.executes);
  const revealed = new Map((run.revealed || []).map((t) => [t.id, t]));
  const publicPassed = publicTests.filter(passed).length;
  const privatePassed = privateTests.filter(passed).length;
  const revealing = stage === "private";
  return (
    <div className="space-y-4 px-4 py-4">
      {!revealing && (
        <div className="flex items-center gap-4">
          <div className="text-[28px] font-semibold leading-none tracking-tight text-ink">{run.percent}%</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-medium text-ink">correct</span>
              <span className="text-xs text-muted">checked {timeAgo(run.at)}</span>
            </div>
            <Meter value={run.percent} tone={scoreTone(run.percent)} label="How correct your code is" className="mt-1.5" />
          </div>
        </div>
      )}
      {!current && !revealing && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-text">Your code or language has changed since this check. Run it again to check this version. Either way, your final code is checked when you submit.</p>
      )}
      {publicTests.length > 0 && (
        <section>
          <h4 className={cn("mb-1.5 text-[13px] font-semibold", publicPassed === publicTests.length ? "text-success-text" : "text-danger-text")}>
            Public test cases: {publicPassed} of {publicTests.length} passed
          </h4>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {publicTests.map((test, i) => (
              <Outcome key={test.id} label={`Public test ${i + 1}`} passed={passed(test)} dim={!current} />
            ))}
          </ul>
        </section>
      )}
      {privateTests.length > 0 &&
        (revealing ? (
          <Working>Running the private test cases…</Working>
        ) : (
          <section className="animate-fade-in">
            <h4 className={cn("mb-1.5 text-[13px] font-semibold", privatePassed === privateTests.length ? "text-success-text" : "text-danger-text")}>
              Private test cases: {privatePassed} of {privateTests.length} passed
            </h4>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {privateTests.map((test, i) => (
                <Outcome key={test.id} label={`Private test ${i + 1}`} passed={passed(test)} dim={!current} />
              ))}
            </ul>
            {privateTests.some((test) => !passed(test) && revealed.has(test.id)) && (
              <div className="mt-3 space-y-2.5">
                {privateTests.map((test, i) => {
                  const shown = !passed(test) && revealed.get(test.id);
                  if (!shown) return null;
                  return (
                    <div key={test.id} className="rounded-xl border border-danger/25 p-3">
                      <div className="mb-2 text-[13px] font-semibold text-danger-text">Private test {i + 1} failed. Here's what it was:</div>
                      <div className="space-y-2">
                        {shown.input && <Block label="Input">{shown.input}</Block>}
                        <Block label="Expected output">{shown.output}</Block>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
    </div>
  );
}

function RunButton({ onRun, running, cooldownUntil, disabled }) {
  const now = useNow(500);
  const wait = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  return (
    <Button icon={running ? undefined : Play} loading={running} onClick={onRun} disabled={disabled || wait > 0}>
      {running ? "Checking…" : wait > 0 ? `Run again in ${wait}s` : "Run"}
    </Button>
  );
}

/** A two-step button, so one stray click can't wipe the student's code. */
function ResetButton({ onReset, disabled }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button
      size="sm"
      variant={armed ? "danger-soft" : "ghost"}
      icon={RotateCcw}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          clearTimeout(timer.current);
          setArmed(false);
          onReset();
          return;
        }
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 3000);
      }}
    >
      {armed ? "Click again to reset" : "Starter code"}
    </Button>
  );
}

/** An external: code questions, each with an editor and an AI "Run". */
export default function CodeScreen({ info, state, questions, answers, runs, current, save, stream, offsetRef, onAnswer, onRun, onNavigate, onExpire, onSubmit, onTools, onBlocked }) {
  const [running, setRunning] = useState(null); // id of the question being checked
  const [revealing, setRevealing] = useState(null); // id of the question whose private results are on their way
  const revealTimer = useRef(null);
  useEffect(() => () => clearTimeout(revealTimer.current), []);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [contextOpen, setContextOpen] = useState(true);
  const question = questions[current];
  const answer = question ? answers[question.id] : null;
  const run = question ? runs[question.id] : null;
  const code = question ? codeOf(question, answer) : "";
  const language = question ? languageOf(question, answer) : "";
  const upToDate = checkIsCurrent(run, question || {}, answer);
  const maxRuns = info.max_runs || 0;
  const checksLeft = maxRuns > 0 ? Math.max(0, maxRuns - (run?.count || 0)) : null;

  const runNow = async () => {
    if (!question || running) return;
    if (!code.trim()) {
      toast.error("Write some code first.", { id: "run" });
      return;
    }
    if (question.language === "any" && !language) {
      toast.error("Choose the language you're writing in first.", { id: "run" });
      return;
    }
    if (checksLeft === 0 && !upToDate) {
      toast.error("You've used every check for this question. Your final code is still checked when you submit.", { id: "run" });
      return;
    }
    const startedAt = Date.now();
    setRunning(question.id);
    const result = await onRun(question.id, code, question.language === "any" ? language : "");
    setRunning(null);
    if (!result || result.cached) return;
    setCooldownUntil(startedAt + RUN_COOLDOWN_MS);
    // Public results first; the private ones follow a moment later, like LeetCode.
    if (question.tests?.some((t) => t.hidden)) {
      const id = question.id;
      clearTimeout(revealTimer.current);
      setRevealing(id);
      revealTimer.current = setTimeout(() => setRevealing((current) => (current === id ? null : current)), 1500);
    }
  };

  const last = current === questions.length - 1;
  return (
    <div className={cn("flex min-h-screen flex-col bg-canvas lg:h-screen lg:overflow-hidden", info.requirements.block_clipboard && "no-select")}>
      <RoomHeader info={info} state={state} save={save} stream={stream} offsetRef={offsetRef} onExpire={onExpire} onSubmit={onSubmit} onTools={onTools} className="max-w-none" />
      {question && (
        <>
          <QuestionTabs questions={questions} answers={answers} runs={runs} current={current} onNavigate={onNavigate} />
          <main className="grid flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section className="border-b border-line bg-surface lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
              <QuestionPane
                question={question}
                index={current}
                total={questions.length}
                context={info.context}
                contextOpen={contextOpen}
                onToggleContext={() => setContextOpen((open) => !open)}
              />
            </section>

            <section className="flex min-h-[560px] flex-col lg:min-h-0">
              <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
                {question.language === "any" ? (
                  <Select
                    aria-label="Language you're writing in"
                    value={language}
                    onChange={(e) => onAnswer(question.id, { language: e.target.value })}
                    className={cn("h-8 w-44 text-[13px]", !language && "border-warning/60 text-warning-text")}
                  >
                    <option value="" disabled>
                      Choose your language
                    </option>
                    {Object.entries(LANGUAGES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone="primary">{languageLabel(question.language)}</Badge>
                )}
                {question.starter_code && <ResetButton onReset={() => onAnswer(question.id, { code: question.starter_code })} disabled={code === question.starter_code} />}
                <span className="ml-auto hidden items-center gap-1 text-xs text-muted sm:flex">
                  <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> runs
                </span>
              </div>

              <div className="relative min-h-[280px] flex-1">
                <div className="absolute inset-0 p-3">
                  <CodeEditor
                    key={question.id}
                    height="100%"
                    className="h-full"
                    value={code}
                    onChange={(value) => onAnswer(question.id, { code: value })}
                    language={language}
                    blockClipboard={info.requirements.block_clipboard}
                    onBlocked={onBlocked}
                    onRun={runNow}
                    placeholder={question.language === "any" && !language ? "Choose your language above, then write your answer here" : "Write your answer here"}
                  />
                </div>
              </div>

              <div className="shrink-0 border-t border-line bg-surface">
                <div className="max-h-[34vh] overflow-y-auto" aria-live="polite">
                  <CheckResult question={question} run={run} current={upToDate} stage={running === question.id ? "running" : revealing === question.id ? "private" : "done"} />
                </div>
                <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
                  <RunButton onRun={runNow} running={running === question.id} cooldownUntil={cooldownUntil} disabled={Boolean(running) || (checksLeft === 0 && !upToDate)} />
                  <span className="text-xs text-muted">
                    {checksLeft === null ? "Unlimited checks" : checksLeft === 0 ? "No checks left for this question" : `${checksLeft} of ${maxRuns} checks left`}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button variant="secondary" icon={ChevronLeft} onClick={() => onNavigate(current - 1)} disabled={current === 0}>
                      Previous
                    </Button>
                    {last ? (
                      <Button icon={Send} onClick={onSubmit}>
                        Review and submit
                      </Button>
                    ) : (
                      <Button iconRight={ChevronRight} onClick={() => onNavigate(current + 1)}>
                        Next
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </main>
        </>
      )}
    </div>
  );
}
