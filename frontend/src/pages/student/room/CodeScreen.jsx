import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, EyeOff, Loader2, MinusCircle, Play, RotateCcw, Send, Sparkles, XCircle } from "lucide-react";
import CodeEditor from "../../../components/exam/CodeEditor";
import { ContextSection, OutputBlock } from "../../../components/exam/DataText";
import { DifficultyBadge, QuestionText } from "../../../components/exam/ExamBits";
import { Badge, Kbd } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Meter } from "../../../components/ui/Data";
import { Select } from "../../../components/ui/Form";
import { cn } from "../../../lib/cn";
import { LANGUAGES, isAnswered, languageLabel, paperLabels, pluralize, questionLabel, scoreTone, timeAgo } from "../../../lib/format";
import { useNow } from "../../../lib/hooks";
import { checkIsCurrent, codeOf, languageOf } from "./codeAnswers";
import { RoomHeader } from "./ExamScreen";

// The server makes a student wait this long between checks.
const RUN_COOLDOWN_MS = 5000;

// Papers numbered I, II (a), II (b) … show those names, with a divider where a part starts.
function QuestionTabs({ questions, answers, runs, current, onNavigate }) {
  const labels = paperLabels(questions.map((q) => q.text));
  const partOf = (i) => questionLabel(questions[i].text)?.part;
  return (
    <nav aria-label="Questions" className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-surface px-4 py-2 sm:px-6">
      {questions.map((question, i) => {
        const answer = answers[question.id];
        const run = runs[question.id];
        const written = isAnswered(answer);
        const active = i === current;
        return [
          labels && i > 0 && partOf(i) !== partOf(i - 1) && <span key={`${question.id}-divider`} className="mx-1 h-5 w-px shrink-0 bg-line-strong" aria-hidden />,
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
            {labels ? labels[i] : `Question ${i + 1}`}
            {checkIsCurrent(run, question, answer) && <span className="text-xs tabular-nums text-muted">{run.percent}%</span>}
          </button>,
        ];
      })}
    </nav>
  );
}

function QuestionPane({ question, index, total, examContext, setContext }) {
  const tests = question.tests || [];
  const publicTests = tests.filter((t) => !t.hidden);
  const privateCount = tests.length - publicTests.length;
  const sql = question.language === "sql";
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

      {(question.context || setContext || examContext) && (
        <div className="space-y-3">
          <ContextSection title="Tables and data for this question" text={question.context} definitions={false} />
          <ContextSection title="Tables and data for your set" text={setContext} definitions={false} />
          <ContextSection title="Tables and data for every question" text={examContext} definitions={false} />
        </div>
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
                  {test.input && <OutputBlock label="Input" text={test.input} />}
                  <OutputBlock label="Expected output" text={test.output} sql={sql} />
                </div>
              </div>
            ))}
            {privateCount > 0 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-[13px] leading-relaxed text-muted">
                <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {pluralize(privateCount, "private test")} {privateCount === 1 ? "runs" : "run"} once every public test will execute. If your code fails one, you'll see its input and expected output.
                </span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// There's no compiler: the AI says whether the code would give the expected
// output (or is about 80% of the way there), so students read "will execute".
const OUTCOMES = {
  pass: { icon: CheckCircle2, text: "Will execute", tone: "border-success/30 bg-success-soft text-success-text" },
  fail: { icon: XCircle, text: "Will not execute", tone: "border-danger/25 bg-danger-soft text-danger-text" },
  skip: { icon: MinusCircle, text: "Not run", tone: "border-line bg-subtle/60 text-muted" },
};

function Outcome({ label, state, dim }) {
  const { icon: Icon, text, tone } = OUTCOMES[state];
  return (
    <li className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px]", tone, dim && "opacity-60")}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-xs font-medium">{text}</span>
    </li>
  );
}

/** The AI couldn't check this time: the code is saved, and the teacher marks it by hand if need be. */
function BusyNotice({ message }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-[13px] leading-relaxed text-warning-text">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-semibold">AI evaluation pipeline busy</div>
        <p className="mt-0.5">{message || "Your teacher will check this answer by hand. Your code is saved, so you can move on to the next question."}</p>
      </div>
    </div>
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
function CheckResult({ question, run, current, stage, busy }) {
  const tests = question.tests || [];
  const publicTests = tests.filter((t) => !t.hidden);
  const privateTests = tests.filter((t) => t.hidden);
  const sql = question.language === "sql";
  if (stage === "running") {
    return (
      <div className="px-4 py-4">
        <Working>{publicTests.length ? "Running the public test cases…" : tests.length ? "Running the test cases…" : "Comparing your code with your teacher's answer…"}</Working>
      </div>
    );
  }
  const notice = busy && (
    <div className={run ? "px-4 pt-4" : "p-4"}>
      <BusyNotice message={busy} />
    </div>
  );
  if (!run) {
    return (
      notice || (
        <div className="flex items-start gap-3 px-4 py-4 text-[13px] leading-relaxed text-muted">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" />
          <span>
            Press Run to dry-run your code{tests.length ? " against the test cases: public first, then private" : ""}. An AI compares it with your teacher's answer and tells you whether it will execute. It isn't a real
            compiler, so small syntax slips don't matter, but the logic does.
          </span>
        </div>
      )
    );
  }
  const outcome = (test) => (run.tests || []).find((t) => t.id === test.id);
  const passed = (test) => Boolean(outcome(test)?.executes);
  const stateOf = (test) => (passed(test) ? "pass" : outcome(test)?.skipped ? "skip" : "fail");
  const revealed = new Map((run.revealed || []).map((t) => [t.id, t]));
  const publicPassed = publicTests.filter(passed).length;
  const privatePassed = privateTests.filter(passed).length;
  const privateSkipped = privateTests.length > 0 && privateTests.every((test) => stateOf(test) === "skip");
  const revealing = stage === "private" && !privateSkipped;
  const reached = tests.length > 0 && tests.every(passed);
  return (
    <>
      {notice}
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
            {tests.length === 0 && (
              <Badge tone={run.percent >= 80 ? "success" : "danger"} icon={run.percent >= 80 ? CheckCircle2 : XCircle}>
                {run.percent >= 80 ? "Will execute" : "Will not execute"}
              </Badge>
            )}
          </div>
        )}
        {reached && current && !revealing && (
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-[13px] font-semibold text-success-text">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Expected output reached: every test case will execute.
          </div>
        )}
        {!current && !revealing && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-text">Your code or language has changed since this check. Run it again to check this version. Either way, your final code is checked when you submit.</p>
        )}
        {publicTests.length > 0 && (
          <section>
            <h4 className={cn("mb-1.5 text-[13px] font-semibold", publicPassed === publicTests.length ? "text-success-text" : "text-danger-text")}>
              Public test cases: {publicPassed} of {publicTests.length} will execute
            </h4>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {publicTests.map((test, i) => (
                <Outcome key={test.id} label={`Public test ${i + 1}`} state={stateOf(test)} dim={!current} />
              ))}
            </ul>
          </section>
        )}
        {privateTests.length > 0 &&
          (revealing ? (
            <Working>Running the private test cases…</Working>
          ) : (
            <section className="animate-fade-in">
              {privateSkipped ? (
                <>
                  <h4 className="mb-1 text-[13px] font-semibold text-ink-2">Private test cases: not run yet</h4>
                  <p className="mb-1.5 text-xs text-muted">They run once every public test will execute. Fix the public ones first.</p>
                </>
              ) : (
                <h4 className={cn("mb-1.5 text-[13px] font-semibold", privatePassed === privateTests.length ? "text-success-text" : "text-danger-text")}>
                  Private test cases: {privatePassed} of {privateTests.length} will execute
                </h4>
              )}
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {privateTests.map((test, i) => (
                  <Outcome key={test.id} label={`Private test ${i + 1}`} state={stateOf(test)} dim={!current} />
                ))}
              </ul>
              {privateTests.some((test) => !passed(test) && revealed.has(test.id)) && (
                <div className="mt-3 space-y-2.5">
                  {privateTests.map((test, i) => {
                    const shown = !passed(test) && revealed.get(test.id);
                    if (!shown) return null;
                    return (
                      <div key={test.id} className="rounded-xl border border-danger/25 p-3">
                        <div className="mb-2 text-[13px] font-semibold text-danger-text">Private test {i + 1} will not execute. Here's what it was:</div>
                        <div className="space-y-2">
                          {shown.input && <OutputBlock label="Input" text={shown.input} />}
                          <OutputBlock label="Expected output" text={shown.output} sql={sql} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
      </div>
    </>
  );
}

function RunButton({ onRun, running, cooldownUntil, disabled }) {
  const now = useNow(500);
  const wait = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  return (
    <Button size="sm" icon={running ? undefined : Play} loading={running} onClick={onRun} disabled={disabled || wait > 0} title="Run (Ctrl+Enter)" className="min-w-[5.5rem]">
      {running ? "Checking…" : wait > 0 ? `Run in ${wait}s` : "Run"}
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
export default function CodeScreen({ info, state, setContext, questions, answers, runs, current, save, stream, offsetRef, onAnswer, onRun, onNavigate, onExpire, onSubmit, onTools, onBlocked }) {
  const [running, setRunning] = useState(null); // id of the question being checked
  const [revealing, setRevealing] = useState(null); // id of the question whose private results are on their way
  const revealTimer = useRef(null);
  useEffect(() => () => clearTimeout(revealTimer.current), []);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [busy, setBusy] = useState({}); // question id → why the AI couldn't check it
  const question = questions[current];
  const answer = question ? answers[question.id] : null;
  const run = question ? runs[question.id] : null;
  const code = question ? codeOf(question, answer) : "";
  const language = question ? languageOf(question, answer) : "";
  const upToDate = checkIsCurrent(run, question || {}, answer);
  const maxRuns = state?.max_runs ?? info.max_runs ?? 0; // the teacher can change it mid-exam
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
    const id = question.id;
    if (result?.busy) {
      setBusy((all) => ({ ...all, [id]: result.busy }));
      setCooldownUntil(startedAt + RUN_COOLDOWN_MS);
      return;
    }
    if (result) setBusy(({ [id]: _, ...rest }) => rest);
    if (!result || result.cached) return;
    setCooldownUntil(startedAt + RUN_COOLDOWN_MS);
    // Public results first; the private ones follow a moment later, like LeetCode.
    if (question.tests?.some((t) => t.hidden)) {
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
          {/* Half and half up to 1536 px wide, so a set's six- or seven-column tables fit beside the editor on lab screens. */}
          <main className="grid flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section className="border-b border-line bg-surface lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
              <QuestionPane question={question} index={current} total={questions.length} examContext={info.context} setContext={setContext} />
            </section>

            <section className="flex min-h-[560px] flex-col lg:min-h-0">
              <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2">
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
                <div className="ml-auto flex items-center gap-3">
                  <span className="hidden items-center gap-1 text-xs text-muted xl:flex">
                    <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {checksLeft === null ? "Unlimited checks" : checksLeft === 0 ? "No checks left" : `${checksLeft} of ${maxRuns} checks left`}
                  </span>
                  <RunButton onRun={runNow} running={running === question.id} cooldownUntil={cooldownUntil} disabled={Boolean(running) || (checksLeft === 0 && !upToDate)} />
                </div>
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
                  <CheckResult
                    question={question}
                    run={run}
                    current={upToDate}
                    busy={busy[question.id]}
                    stage={running === question.id ? "running" : revealing === question.id ? "private" : "done"}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
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
