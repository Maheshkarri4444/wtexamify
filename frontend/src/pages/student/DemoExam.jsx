import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, ArrowRight, GraduationCap, PartyPopper, X } from "lucide-react";
import { Logo, ThemeToggle } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageLoader } from "../../components/ui/Feedback";
import { cn } from "../../lib/cn";
import { isAnswered } from "../../lib/format";
import ExamScreen from "./room/ExamScreen";
import { LockOverlay, SubmitModal, TeacherToolsModal } from "./room/Overlays";
import { checkIsCurrent } from "./room/codeAnswers";
import { useProctoring } from "./room/useProctoring";

const CodeScreen = lazy(() => import("./room/CodeScreen"));

// A practice exam that never talks to the server: the same screens as the real
// exam room, a scripted check instead of the AI, and a coach card that walks
// through each part. The teacher's codes are shown, since there's no teacher.
const COPY_CODE = "DEMO24";
const REFRESH_CODE = "NEWSET";
const DEMO_MINUTES = 15;

const LOCK_REASONS = {
  copy: "You tried to copy. Copying is turned off during the exam.",
  cut: "You tried to cut text. Cutting is turned off during the exam.",
  paste: "You tried to paste. Pasting is turned off during the exam.",
  contextmenu: "You right-clicked. Right-click is turned off during the exam.",
  drop: "You dragged text in. That's turned off during the exam.",
  tab_hidden: "You switched to another tab.",
  window_blur: "You switched to another window.",
};
const BLOCKED = {
  print: "Printing is turned off during the exam.",
  save: "No need to save: your answers save automatically.",
  source: "Viewing the page source is turned off during the exam.",
  devtools: "Developer tools are turned off during the exam.",
  reload: "Reloading is turned off during the exam. Your answers save automatically.",
};

const EXTERNAL_ANSWER = "SELECT F_name, Salary\nFROM Employee\nWHERE D_no = 5 AND Salary > 30000\nORDER BY Salary DESC;";

const DEMOS = {
  external: {
    title: "Demo external · DBMS lab",
    type: "external",
    sets: {
      1: [
        {
          id: "demo-q1",
          type: "code",
          language: "sql",
          difficulty: "easy",
          marks: 10,
          text: "Employee (Emp_id, F_name, Salary, D_no)\nWrite a query that lists the name and salary of every employee in department 5 who earns more than 30000, highest salary first.",
          context:
            "CREATE TABLE Employee (\n  Emp_id NUMBER PRIMARY KEY,\n  F_name VARCHAR(20),\n  Salary NUMBER(10,2),\n  D_no   NUMBER\n);\n\nTable: Employee\nEMP_ID | F_NAME | SALARY | D_NO\n101 | James | 55000 | 1\n102 | Franklin | 40000 | 5\n105 | Ramesh | 38000 | 5\n106 | Joyce | 28000 | 5\n108 | John | 30000 | 5",
          starter_code: EXTERNAL_ANSWER,
          tests: [
            { id: "demo-t1", input: "The Employee table above", output: "F_NAME | SALARY\nFranklin | 40000\nRamesh | 38000", hidden: false },
            { id: "demo-t2", input: "", output: "", hidden: true },
          ],
        },
      ],
      2: [
        {
          id: "demo-q2",
          type: "code",
          language: "sql",
          difficulty: "easy",
          marks: 10,
          text: "Employee (Emp_id, F_name, Salary, D_no)\nWrite a query that counts the employees in each department.",
          context: "Table: Employee\nEMP_ID | F_NAME | SALARY | D_NO\n101 | James | 55000 | 1\n102 | Franklin | 40000 | 5\n105 | Ramesh | 38000 | 5\n106 | Joyce | 28000 | 5",
          starter_code: "SELECT D_no, COUNT(*) AS employees\nFROM Employee\nGROUP BY D_no;",
          tests: [{ id: "demo-t3", input: "The Employee table above", output: "D_NO | EMPLOYEES\n1 | 1\n5 | 3", hidden: false }],
        },
      ],
    },
  },
  viva: {
    title: "Demo viva · DBMS",
    type: "viva",
    sets: {
      1: [
        {
          id: "demo-v1",
          type: "mcq_single",
          marks: 1,
          text: "Which command removes every row of a table but keeps the table itself?",
          options: [
            { id: "a", text: "DROP TABLE" },
            { id: "b", text: "TRUNCATE TABLE" },
            { id: "c", text: "ALTER TABLE" },
            { id: "d", text: "REMOVE TABLE" },
          ],
          correct: ["b"],
        },
        {
          id: "demo-v2",
          type: "mcq_multi",
          marks: 2,
          text: "Which of these are SQL aggregate functions?",
          options: [
            { id: "a", text: "COUNT" },
            { id: "b", text: "SUM" },
            { id: "c", text: "UPPER" },
            { id: "d", text: "AVG" },
          ],
          correct: ["a", "b", "d"],
        },
        { id: "demo-v3", type: "fill", marks: 1, text: "The ____ key uniquely identifies each row of a table.", options: [], accepted: ["primary", "primary key"] },
      ],
      2: [
        {
          id: "demo-v4",
          type: "mcq_single",
          marks: 1,
          text: "Which normal form removes partial dependencies?",
          options: [
            { id: "a", text: "1NF" },
            { id: "b", text: "2NF" },
            { id: "c", text: "3NF" },
            { id: "d", text: "BCNF" },
          ],
          correct: ["b"],
        },
        { id: "demo-v5", type: "fill", marks: 1, text: "A ____ is a virtual table built from a query.", options: [], accepted: ["view"] },
      ],
    },
  },
};

const normalizeCode = (code) => code.toLowerCase().replace(/;/g, "").replace(/\s+/g, " ").trim();

/** The tutorial's steps. `until` says which action moves it on by itself. */
function stepsFor(type) {
  const lock = {
    title: "Try copying something",
    body: "Select some code and press Ctrl+C (or right-click). Copying and pasting are off in the exam, and leaving the exam tab locks your paper. Try it to see the lock box.",
    until: "locked",
  };
  const unlock = {
    title: "Your paper is locked",
    body: `Raise your hand: your teacher types the exam's copy code in the box, or unlocks you from their dashboard. Here the code is shown in the box. Type ${COPY_CODE} and press Unlock.`,
    until: "unlocked",
  };
  const tools = {
    title: "Teacher tools and a new paper",
    body: `The key button at the top is for your teacher. With the refresh code they give you a different set, a fresh paper with your answers cleared. Teachers set both codes for each exam and can change them on their dashboard. Try it: press the key and type ${REFRESH_CODE}.`,
    until: "refreshed",
  };
  if (type === "external") {
    return [
      { title: "Welcome to the demo external", body: "This is a practice exam. Nothing is saved or marked, and there's no AI here. The steps below walk you through the exam room; press Next, or just try things." },
      { title: "Read the question", body: "On the left: the question, the tables and rows it uses (shown as tables), and the public test cases with the output your query must give." },
      { title: "Your answer goes in the editor", body: "On the right is the code editor. For this demo the answer is already written. In the exam, you write it here; it saves as you type." },
      { title: "Press Run", body: "Press Run (or Ctrl+Enter). The public test cases are checked first, then the private ones. In the exam an AI checks your code; here the given answer simply reaches the expected output.", until: "ran" },
      { title: "Expected output reached", body: "Every test case will execute, so this answer gets full marks. Change the code and run again to see what a wrong answer looks like; Starter code puts the answer back." },
      lock,
      unlock,
      tools,
      { title: "Submit when you're done", body: "Press Submit at the top. In the exam, your final code for every question is checked again after you submit, and your score shows in a minute or two.", until: "submitted" },
    ];
  }
  return [
    { title: "Welcome to the demo viva", body: "This is a practice viva. Nothing is saved or marked. The steps below walk you through it; press Next, or just try things." },
    { title: "Answer a question", body: "Click an option, or press A to D on your keyboard. Some questions have more than one correct answer, and some ask you to type a word.", until: "answered" },
    { title: "Move around the paper", body: "Use Next and Previous, or the question palette on the right. Mark for review flags a question to come back to; answers save as you go." },
    lock,
    unlock,
    tools,
    { title: "Submit when you're done", body: "Press Submit at the top, or Review and submit on the last question. You'll see your score straight away.", until: "submitted" },
  ];
}

function Coach({ steps, index, onIndex, onClose }) {
  const step = steps[index];
  if (!step) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 sm:justify-start sm:px-6">
      <Card className="pointer-events-auto w-full max-w-sm animate-scale-in p-4 shadow-pop ring-2 ring-primary/30">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Step {index + 1} of {steps.length}
            </div>
            <div className="text-sm font-semibold text-ink">{step.title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Hide the tutorial" className="rounded-lg p-1 text-muted hover:bg-subtle hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => onIndex(index - 1)} disabled={index === 0}>
            Back
          </Button>
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i === index ? "bg-primary" : i < index ? "bg-primary/40" : "bg-line-strong")} />
            ))}
          </div>
          <Button size="sm" variant={step.until ? "secondary" : "primary"} iconRight={ArrowRight} onClick={() => onIndex(index + 1)} disabled={index === steps.length - 1}>
            {step.until ? "Skip" : "Next"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function scoreViva(questions, answers) {
  let score = 0;
  let max = 0;
  for (const q of questions) {
    max += q.marks;
    const answer = answers[q.id];
    if (q.type === "fill") {
      const text = String(answer?.text || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (q.accepted.includes(text)) score += q.marks;
    } else {
      const picked = [...(answer?.selected || [])].sort().join(",");
      if (picked === [...q.correct].sort().join(",")) score += q.marks;
    }
  }
  return { score, max };
}

function DemoDone({ demo, result, onAgain }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success-text">
          <PartyPopper className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">Demo finished</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {demo.type === "viva"
            ? `You scored ${result.score} of ${result.max}. In a real viva your teacher decides whether you see your score and answers.`
            : "In a real external, your final code is checked again after you submit, and your marks follow the test cases that will execute: 4 of 5 earns 80% of the marks."}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">You know your way around the exam room now. Nothing from this demo was saved.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={onAgain}>
            Try it again
          </Button>
          <Link to="/student" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink">
            <ArrowLeft className="h-4 w-4" />
            My exams
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function DemoExam() {
  const { kind } = useParams();
  const demo = DEMOS[kind];
  const [round, setRound] = useState(0); // "Try it again" starts a fresh demo
  if (!demo) return <Navigate to="/student" replace />;
  return <DemoRoom key={`${kind}-${round}`} demo={demo} onAgain={() => setRound((n) => n + 1)} />;
}

function DemoRoom({ demo, onAgain }) {
  const steps = useMemo(() => stepsFor(demo.type), [demo.type]);
  const [step, setStep] = useState(0);
  const [coachOpen, setCoachOpen] = useState(true);
  const [setNumber, setSetNumber] = useState(1);
  const [answers, setAnswers] = useState({});
  const [runs, setRuns] = useState({});
  const [current, setCurrent] = useState(0);
  const [visited, setVisited] = useState(() => new Set());
  const [locked, setLocked] = useState(null); // the lock reason, while locked
  const [violations, setViolations] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [result, setResult] = useState(null);
  const offsetRef = useRef(0);
  const [deadline] = useState(() => new Date(Date.now() + DEMO_MINUTES * 60000).toISOString());
  const questions = demo.sets[setNumber];

  // An action finishes the step waiting for it, even one the student hasn't reached yet.
  const reached = useCallback(
    (action) => {
      const done = steps.findIndex((s) => s.until === action);
      if (done >= 0) setStep((index) => (index <= done ? Math.min(done + 1, steps.length - 1) : index));
    },
    [steps]
  );

  useEffect(() => {
    setVisited((all) => new Set([...all, questions[current]?.id].filter(Boolean)));
  }, [questions, current]);

  const lockedRef = useRef(false);
  const lock = useCallback(
    (kind) => {
      if (result || lockedRef.current) return;
      lockedRef.current = true;
      setLocked(LOCK_REASONS[kind] || "You left the exam.");
      setViolations((n) => n + 1);
      reached("locked");
    },
    [reached, result]
  );
  const release = () => {
    lockedRef.current = false;
    setLocked(null);
  };

  useProctoring({
    active: !result && !locked,
    requireFullscreen: false,
    reportLeaving: true,
    blockClipboard: true,
    onViolation: lock,
    // In the demo a copy shows the lock box, so students see it once before the exam.
    onBlocked: (kind) => (LOCK_REASONS[kind] ? lock(kind) : toast(BLOCKED[kind] || "That's turned off during the exam.", { id: "blocked" })),
  });

  const updateAnswer = useCallback(
    (id, patch) => {
      setAnswers((all) => ({ ...all, [id]: { ...all[id], ...patch } }));
      if (demo.type === "viva" && isAnswered(patch)) reached("answered");
    },
    [demo.type, reached]
  );

  // The demo's stand-in for the AI: the given answer reaches the expected
  // output; anything else fails the public test, so the private one waits.
  const run = useCallback(
    async (questionId, code) => {
      const question = questions.find((q) => q.id === questionId);
      updateAnswer(questionId, { code });
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const correct = normalizeCode(code) === normalizeCode(question.starter_code);
      const tests = question.tests.map((t) => (correct ? { id: t.id, executes: true } : t.hidden ? { id: t.id, executes: false, skipped: true } : { id: t.id, executes: false }));
      const check = { question_id: questionId, language: question.language, percent: correct ? 100 : 30, tests, count: (runs[questionId]?.count || 0) + 1, at: new Date().toISOString(), current: true, revealed: [], code };
      setRuns((all) => ({ ...all, [questionId]: check }));
      if (correct) reached("ran");
      return { run: check };
    },
    [questions, runs, updateAnswer, reached]
  );

  const unlock = async (code) => {
    if (code !== COPY_CODE) {
      toast.error(`That's not the copy code. In this demo it's ${COPY_CODE}.`);
      return false;
    }
    release();
    toast.success("Unlocked. Back to your exam.");
    reached("unlocked");
    return true;
  };

  const refresh = async (code) => {
    if (code !== REFRESH_CODE) {
      toast.error(`That's not the refresh code. In this demo it's ${REFRESH_CODE}.`);
      return false;
    }
    const next = setNumber === 1 ? 2 : 1;
    setSetNumber(next);
    setAnswers({});
    setRuns({});
    setCurrent(0);
    setVisited(new Set());
    release();
    setToolsOpen(false);
    toast.success(`You're on set ${next} now. Start from question 1.`);
    reached("refreshed");
    return true;
  };

  const submit = () => {
    setSubmitOpen(false);
    setResult(demo.type === "viva" ? scoreViva(questions, answers) : { done: true });
    reached("submitted");
  };

  if (result) return <DemoDone demo={demo} result={result} onAgain={onAgain} />;

  const info = {
    title: demo.title,
    type: demo.type,
    context: "",
    max_runs: 0,
    requirements: { block_clipboard: true, fullscreen: false, screen_share: false },
  };
  const state = { set_number: setNumber, deadline_at: deadline, violations, max_violations: 0, locked: Boolean(locked), lock_reason: locked };
  const shown = locked ? [] : questions;
  const room = { info, state, setContext: "", stream: null, offsetRef, onExpire: submit, onSubmit: () => setSubmitOpen(true), onTools: () => setToolsOpen(true) };
  const answered = questions.filter((q) => isAnswered(answers[q.id])).length;

  return (
    <>
      {demo.type === "external" ? (
        <Suspense fallback={<PageLoader label="Opening the code editor…" />}>
          <CodeScreen {...room} questions={shown} answers={answers} runs={runs} current={current} save={{ status: "saved" }} onAnswer={updateAnswer} onRun={run} onNavigate={setCurrent} onBlocked={(kind) => lock(kind)} />
        </Suspense>
      ) : (
        <ExamScreen {...room} questions={shown} answers={answers} current={current} visited={visited} save={{ status: "saved" }} onAnswer={updateAnswer} onNavigate={setCurrent} />
      )}
      {locked && <LockOverlay state={state} onUnlock={unlock} onRefresh={refresh} demoCodes={{ copy: COPY_CODE, refresh: REFRESH_CODE }} />}
      <SubmitModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onConfirm={submit}
        submitting={false}
        examType={demo.type}
        answered={answered}
        total={questions.length}
        marked={questions.filter((q) => answers[q.id]?.marked).length}
        unchecked={questions.filter((q) => isAnswered(answers[q.id]) && !checkIsCurrent(runs[q.id], q, answers[q.id])).length}
      />
      <TeacherToolsModal open={toolsOpen} onClose={() => setToolsOpen(false)} onRefresh={refresh} demoCode={REFRESH_CODE} />
      {coachOpen ? (
        <Coach steps={steps} index={step} onIndex={(i) => setStep(Math.max(0, Math.min(i, steps.length - 1)))} onClose={() => setCoachOpen(false)} />
      ) : (
        <div className="fixed bottom-4 left-4 z-[60]">
          <Button size="sm" variant="secondary" icon={GraduationCap} onClick={() => setCoachOpen(true)}>
            Show the tutorial
          </Button>
        </div>
      )}
    </>
  );
}
