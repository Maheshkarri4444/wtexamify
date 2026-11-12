import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, SearchX } from "lucide-react";
import { Logo } from "../../components/layout/AppShell";
import { PageLoader } from "../../components/ui/Feedback";
import { studentApi } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { isAnswered } from "../../lib/format";
import { enterFullscreen, exitFullscreen, isFullscreen, isStreamLive, shareEntireScreen, stopStream } from "../../lib/proctor";
import { checkIsCurrent } from "./room/codeAnswers";
import ExamScreen from "./room/ExamScreen";
import Lobby from "./room/Lobby";
import { AwayBanner, LockOverlay, ResumeGate, SubmitModal, TeacherToolsModal } from "./room/Overlays";
import PaperScreen from "./room/PaperScreen";
import ResultScreen from "./room/ResultScreen";
import { useProctoring } from "./room/useProctoring";

// The code editor is heavy, so only externals load it.
const CodeScreen = lazy(() => import("./room/CodeScreen"));

const LOCK_REASONS = {
  tab_hidden: "You switched to another tab or window.",
  window_blur: "You left the exam window.",
  fullscreen_exit: "You exited fullscreen.",
  screen_share_stopped: "You stopped sharing your screen.",
};

const BLOCKED_MESSAGES = {
  copy: "Copying is turned off during the exam.",
  cut: "Cutting is turned off during the exam.",
  paste: "Pasting is turned off during the exam.",
  contextmenu: "Right-click is turned off during the exam.",
  drop: "Dragging text in is turned off during the exam.",
  print: "Printing is turned off during the exam.",
  save: "No need to save: your answers save automatically.",
  source: "Viewing the page source is turned off during the exam.",
  devtools: "Developer tools are turned off during the exam.",
  reload: "Reloading is turned off during the exam. Your answers save automatically.",
};

const CLIPBOARD_KINDS = new Set(["copy", "cut", "paste", "contextmenu", "drop"]);
const HEARTBEAT_MS = 10000;
// A locked student is waiting on the teacher: look for the unlock (or a submit) sooner.
const LOCKED_CHECK_MS = 3000;
const SAVE_DELAY_MS = 1200;

// n210507@rguktn.ac.in is the testing account: the only student who may always
// copy and paste, even in an exam that blocks it. The server allows it too
// (exams/student.go); checking here as well keeps it working against a server
// that hasn't been restarted or deployed with that change yet.
const PASTE_TESTER_EMAIL = "n210507@rguktn.ac.in";

function forThisStudent(exam) {
  const tester = String(getUser()?.email || "").trim().toLowerCase() === PASTE_TESTER_EMAIL;
  if (!tester || !exam?.requirements?.block_clipboard) return exam;
  return { ...exam, requirements: { ...exam.requirements, block_clipboard: false } };
}

const flagsNow = (stream) => ({ fullscreen: isFullscreen(), sharing: isStreamLive(stream), visible: document.visibilityState === "visible" });

export default function ExamRoom() {
  const { id: examId } = useParams();
  const [phase, setPhase] = useState("loading"); // loading → lobby → running → done, or gone
  const [info, setInfo] = useState(null);
  const [summary, setSummary] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [setContext, setSetContext] = useState(""); // tables and data for the student's set
  const [state, setState] = useState(null);
  const [answers, setAnswers] = useState({});
  const [runs, setRuns] = useState({}); // latest AI check per code question
  const [current, setCurrent] = useState(0);
  const [visited, setVisited] = useState(() => new Set());
  const [stream, setStream] = useState(null);
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const [save, setSave] = useState({ status: "idle" });
  const [starting, setStarting] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [awayUntil, setAwayUntil] = useState(null); // clicked onto Chrome's sharing bar: locks at this time unless they click back in

  // Refs hold the latest values for timers and browser event handlers.
  const stateRef = useRef(null);
  const answersRef = useRef({});
  const dirtyRef = useRef(false);
  const offsetRef = useRef(0); // server clock minus this computer's clock
  const syncingRef = useRef(false);
  const flushingRef = useRef(false);
  const saveTimer = useRef(null);
  const streamRef = useRef(null);
  const pendingEvents = useRef([]); // violations not yet confirmed by the server
  const lastViolation = useRef(0);
  const lastClipboard = useRef(0);
  const syncRef = useRef(() => {});
  const reportRef = useRef(() => {});

  const setRoomState = useCallback((next) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const applyPaper = useCallback(
    (paper) => {
      offsetRef.current = new Date(paper.state.server_now).getTime() - Date.now();
      setInfo(forThisStudent(paper.exam));
      setQuestions(paper.questions || []);
      setSetContext(paper.set_context || "");
      answersRef.current = paper.answers || {};
      dirtyRef.current = false;
      setAnswers(answersRef.current);
      // A check from before a reload still counts if the saved code hasn't changed.
      const checks = {};
      for (const [id, run] of Object.entries(paper.runs || {})) checks[id] = { ...run, code: run.current ? (answersRef.current[id]?.code ?? "") : null };
      setRuns(checks);
      setCurrent(0);
      setVisited(new Set(paper.questions?.length ? [paper.questions[0].id] : []));
      setRoomState(paper.state);
      if (paper.state.status === "submitted") setPhase("done");
    },
    [setRoomState]
  );

  const handleState = useCallback(
    async (next) => {
      offsetRef.current = new Date(next.server_now).getTime() - Date.now();
      const previous = stateRef.current;
      if (next.status === "submitted") {
        setRoomState(next);
        setPhase("done");
        return;
      }
      if (previous && next.paper_version !== previous.paper_version) {
        try {
          const paper = await studentApi.attempt(next.id);
          applyPaper(paper);
          toast(
            paper.state.set_number !== previous.set_number
              ? "Your teacher gave you a new set. Start again from question 1."
              : "Your answers were cleared. Start again from question 1.",
            { icon: "🔄", duration: 6000 }
          );
        } catch {
          // The next heartbeat tries again.
        }
        return;
      }
      // A violation the server hasn't heard about yet keeps the paper locked here.
      if (!next.locked && pendingEvents.current.length) {
        setRoomState({ ...next, locked: true, lock_reason: previous?.lock_reason || "" });
        return;
      }
      setRoomState(next);
    },
    [applyPaper, setRoomState]
  );

  const flushEvents = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      while (stateRef.current && pendingEvents.current.length) {
        try {
          const { type, id } = pendingEvents.current[0];
          const { state: next } = await studentApi.event(stateRef.current.id, type, undefined, id);
          pendingEvents.current.shift();
          if (!pendingEvents.current.length) await handleState(next);
        } catch (error) {
          if (error.status === 0) return; // offline: keep it and retry on the next heartbeat
          pendingEvents.current.shift();
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [handleState]);

  const sync = useCallback(async () => {
    const s = stateRef.current;
    if (!s || s.status !== "in_progress" || syncingRef.current) return;
    syncingRef.current = true;
    let offline = false;
    let rejected = false;
    try {
      await flushEvents();
      const sending = dirtyRef.current;
      const body = { flags: flagsNow(streamRef.current) };
      if (sending) {
        body.answers = answersRef.current;
        dirtyRef.current = false;
        setSave({ status: "saving" });
      }
      try {
        const { state: next } = await studentApi.sync(s.id, body);
        if (sending) setSave({ status: "saved" });
        await handleState(next);
      } catch (error) {
        if (sending) dirtyRef.current = true;
        offline = error.status === 0;
        rejected = !offline;
        setSave({ status: offline ? "offline" : "error" });
      }
    } finally {
      syncingRef.current = false;
      // Answers changed while saving, or the network dropped: try again shortly.
      // A rejected save waits for the next heartbeat instead of hammering the server.
      if (dirtyRef.current && !rejected && stateRef.current?.status === "in_progress") {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => syncRef.current(), offline ? 3000 : SAVE_DELAY_MS);
      }
    }
  }, [flushEvents, handleState]);

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  const updateAnswer = useCallback((questionId, patch) => {
    const previous = answersRef.current[questionId] || { selected: [], text: "", marked: false };
    answersRef.current = { ...answersRef.current, [questionId]: { ...previous, ...patch } };
    setAnswers(answersRef.current);
    dirtyRef.current = true;
    setSave({ status: "pending" });
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => syncRef.current(), SAVE_DELAY_MS);
  }, []);

  // Asks the AI to check one code answer. The server saves the code first.
  const runCode = useCallback(
    async (questionId, code, language) => {
      const s = stateRef.current;
      if (!s || s.status !== "in_progress") return null;
      const saved = answersRef.current[questionId];
      if (saved?.code !== code || (language && saved?.language !== language)) updateAnswer(questionId, language ? { code, language } : { code });
      try {
        const result = await studentApi.run(s.id, questionId, code, language);
        setRuns((all) => ({ ...all, [questionId]: { ...result.run, code } }));
        if (result.cached) toast("Same code as your last check, so here's that result again. It didn't use a check.", { id: "run", icon: "♻️" });
        return result;
      } catch (error) {
        // The AI couldn't check it: the code screen says so in place of a result.
        if (error.status === 503) return { busy: error.message };
        toast.error(error.status === 0 ? "You're offline. Your code is kept here; run it again once you're back online." : error.message, { id: "run", duration: 6000 });
        if (error.status === 409) syncRef.current();
        return null;
      }
    },
    [updateAnswer]
  );

  const report = useCallback(
    (type) => {
      const s = stateRef.current;
      if (!s || s.status !== "in_progress" || s.locked) return;
      const now = Date.now();
      if (now - lastViolation.current < 1500) return;
      lastViolation.current = now;
      setRoomState({ ...s, locked: true, lock_reason: LOCK_REASONS[type] });
      // The id lets the server ignore a resend whose first try got through.
      pendingEvents.current.push({ type, id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}` });
      flushEvents();
    },
    [flushEvents, setRoomState]
  );

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  const blocked = useCallback((kind) => {
    toast.error(BLOCKED_MESSAGES[kind] || "That's turned off during the exam.", { id: "blocked" });
    const s = stateRef.current;
    if (s && CLIPBOARD_KINDS.has(kind) && Date.now() - lastClipboard.current > 4000) {
      lastClipboard.current = Date.now();
      studentApi.event(s.id, "clipboard", kind).catch(() => {});
    }
  }, []);

  // A click on Chrome's sharing bar (or anything else over the fullscreen exam)
  // that came back in time is noted on the teacher's timeline, never a violation.
  const away = useCallback((until, ms) => {
    setAwayUntil(until);
    const s = stateRef.current;
    if (ms >= 1000 && s?.status === "in_progress") studentApi.event(s.id, "away", `Back in ${Math.round(ms / 1000)} s, not locked`).catch(() => {});
  }, []);

  const attachStream = useCallback((next) => {
    stopStream(streamRef.current);
    streamRef.current = next;
    setStream(next);
    next.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (streamRef.current !== next) return;
      streamRef.current = null;
      setStream(null);
      reportRef.current("screen_share_stopped");
    });
  }, []);

  const share = useCallback(async () => {
    try {
      attachStream(await shareEntireScreen());
      return true;
    } catch (error) {
      toast.error(error.name === "NotAllowedError" ? "Screen sharing was cancelled. Share your entire screen to continue." : error.message);
      return false;
    }
  }, [attachStream]);

  // First load: lobby, or straight to the result if already submitted.
  useEffect(() => {
    let cancelled = false;
    studentApi
      .get(examId)
      .then(async (data) => {
        if (cancelled) return;
        setInfo(forThisStudent(data.exam));
        setSummary(data.attempt);
        if (data.attempt?.status === "submitted") {
          const paper = await studentApi.attempt(data.attempt.id);
          if (!cancelled) applyPaper(paper);
        } else {
          setPhase("lobby");
        }
      })
      .catch(() => !cancelled && setPhase("gone"));
    return () => {
      cancelled = true;
    };
  }, [examId, applyPaper]);

  // In the lobby, notice when the teacher starts the exam.
  useEffect(() => {
    if (phase !== "lobby") return undefined;
    const timer = setInterval(() => {
      studentApi
        .get(examId)
        .then((data) => {
          setInfo(forThisStudent(data.exam));
          setSummary(data.attempt);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [phase, examId]);

  // Heartbeat: autosave, report proctoring flags, pick up teacher actions.
  const locked = Boolean(state?.locked);
  useEffect(() => {
    if (phase !== "running") return undefined;
    const timer = setInterval(() => syncRef.current(), locked ? LOCKED_CHECK_MS : HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [phase, locked]);

  // Coming back to the tab checks straight away, so an unlock or a submit shows at once.
  useEffect(() => {
    if (phase !== "running") return undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") syncRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [phase]);

  useEffect(() => {
    const onChange = () => setFullscreen(isFullscreen());
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (phase !== "done") return;
    clearTimeout(saveTimer.current);
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    exitFullscreen();
  }, [phase]);

  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      stopStream(streamRef.current);
    },
    []
  );

  const req = info?.requirements || {};
  const needsFullscreen = Boolean(req.fullscreen) && !fullscreen;
  const needsShare = Boolean(req.screen_share) && !stream;
  const running = phase === "running" && state?.status === "in_progress";

  useProctoring({
    active: running && !state.locked && !needsFullscreen && !needsShare,
    requireFullscreen: Boolean(req.fullscreen),
    reportLeaving: Boolean(req.lock_on_leave),
    blockClipboard: Boolean(req.block_clipboard),
    onViolation: report,
    onBlocked: blocked,
    // Only a shared screen has Chrome's sharing bar floating over the exam.
    onAway: req.screen_share ? away : undefined,
  });

  const start = async () => {
    setStarting(true);
    try {
      if (req.fullscreen) await enterFullscreen();
    } catch {
      toast.error("Fullscreen was blocked. Press Start again and allow it.");
      setStarting(false);
      return;
    }
    try {
      const paper = await studentApi.start(examId, flagsNow(streamRef.current));
      applyPaper(paper);
      if (paper.state.status === "in_progress") setPhase("running");
    } catch (error) {
      toast.error(error.message);
      await exitFullscreen();
    } finally {
      setStarting(false);
    }
  };

  const submit = useCallback(
    async (why) => {
      const s = stateRef.current;
      if (!s || s.status !== "in_progress") return;
      setSubmitting(true);
      clearTimeout(saveTimer.current);
      try {
        await flushEvents();
        const paper = await studentApi.submit(s.id, answersRef.current);
        dirtyRef.current = false;
        applyPaper(paper);
        if (why === "time") toast("Time's up. Your answers were submitted.", { icon: "⏰", duration: 6000 });
      } catch (error) {
        toast.error(error.status === 0 ? "You're offline. Reconnect and your saved answers will be submitted." : error.message);
      } finally {
        setSubmitting(false);
        setSubmitOpen(false);
      }
    },
    [applyPaper, flushEvents]
  );

  const unlock = async (code) => {
    try {
      await flushEvents();
      const { state: next } = await studentApi.unlock(stateRef.current.id, code);
      await handleState(next);
      if (!next.locked) toast.success("Unlocked. You can carry on.");
      return true;
    } catch (error) {
      toast.error(error.message);
      syncRef.current();
      return false;
    }
  };

  const refreshPaper = async (code) => {
    try {
      await flushEvents();
      const paper = await studentApi.refresh(stateRef.current.id, code);
      applyPaper(paper);
      setToolsOpen(false);
      toast.success("You have a new set now. Start from question 1.");
      return true;
    } catch (error) {
      toast.error(error.message);
      syncRef.current();
      return false;
    }
  };

  const navigateTo = useCallback(
    (index) => {
      const next = Math.max(0, Math.min(questions.length - 1, index));
      setCurrent(next);
      const id = questions[next]?.id;
      if (id) setVisited((seen) => (seen.has(id) ? seen : new Set(seen).add(id)));
    },
    [questions]
  );

  if (phase === "loading") return <PageLoader label="Opening your exam…" />;

  if (phase === "gone") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <Logo />
        <div className="mt-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-subtle text-muted">
          <SearchX className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-ink">This exam isn't available</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">It may not be published yet, or your email isn't on the student list. Check with your teacher.</p>
        <Link to="/student" className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink">
          <ArrowLeft className="h-4 w-4" />
          My exams
        </Link>
      </div>
    );
  }

  if (phase === "done") return <ResultScreen info={info} state={state} />;

  if (phase === "lobby") {
    return <Lobby info={info} attempt={summary} sharing={Boolean(stream)} onShare={share} onStart={start} starting={starting} />;
  }

  const concealed = state.locked || needsFullscreen || needsShare;
  const shown = concealed ? [] : questions;
  const answered = questions.filter((q) => isAnswered(answers[q.id])).length;
  const marked = questions.filter((q) => answers[q.id]?.marked).length;
  const unchecked = questions.filter((q) => isAnswered(answers[q.id]) && !checkIsCurrent(runs[q.id], q, answers[q.id])).length;
  const room = { info, state, setContext, stream, offsetRef, onExpire: () => submit("time"), onSubmit: () => setSubmitOpen(true), onTools: () => setToolsOpen(true) };

  return (
    <>
      {info.type === "internal" ? (
        <PaperScreen {...room} questions={shown} />
      ) : info.type === "external" ? (
        <Suspense fallback={<PageLoader label="Opening the code editor…" />}>
          <CodeScreen {...room} questions={shown} answers={answers} runs={runs} current={current} save={save} onAnswer={updateAnswer} onRun={runCode} onNavigate={navigateTo} onBlocked={blocked} />
        </Suspense>
      ) : (
        <ExamScreen {...room} questions={shown} answers={answers} current={current} visited={visited} save={save} onAnswer={updateAnswer} onNavigate={navigateTo} />
      )}
      {state.locked ? (
        <LockOverlay state={state} onUnlock={unlock} onRefresh={refreshPaper} />
      ) : needsShare || needsFullscreen ? (
        <ResumeGate
          needsShare={needsShare}
          needsFullscreen={needsFullscreen}
          onShare={share}
          onFullscreen={() => enterFullscreen().catch(() => toast.error("Fullscreen was blocked. Try again."))}
        />
      ) : null}
      {awayUntil && !concealed && <AwayBanner until={awayUntil} />}
      <SubmitModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onConfirm={() => submit("manual")}
        submitting={submitting}
        examType={info.type}
        answered={answered}
        total={questions.length}
        marked={marked}
        unchecked={unchecked}
      />
      <TeacherToolsModal open={toolsOpen} onClose={() => setToolsOpen(false)} onRefresh={refreshPaper} />
    </>
  );
}
