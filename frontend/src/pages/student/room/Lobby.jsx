import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronLeft, Circle, Clock3, FileQuestion, Hourglass, Maximize, MonitorSmartphone, MonitorUp, Play, ShieldAlert, XCircle } from "lucide-react";
import { Logo, ThemeToggle } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Callout, Spinner } from "../../../components/ui/Feedback";
import { Checkbox } from "../../../components/ui/Form";
import { cn } from "../../../lib/cn";
import { EXAM_TYPES } from "../../../lib/examTypes";
import { formatMinutes, pluralize } from "../../../lib/format";
import { checkEnvironment } from "../../../lib/proctor";

function CheckRow({ ok, label, detail, children }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : Circle;
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", ok === true ? "text-success" : ok === false ? "text-danger" : "text-line-strong")} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        {detail && <div className={cn("text-[13px]", ok === false ? "text-danger-text" : "text-muted")}>{detail}</div>}
        {children}
      </div>
    </li>
  );
}

export default function Lobby({ info, attempt, sharing, onShare, onStart, starting }) {
  const env = useMemo(checkEnvironment, []);
  const [agreed, setAgreed] = useState(false);
  const req = info.requirements;
  const proctored = req.fullscreen || req.screen_share;
  const browserOk = !env.mobile && env.chromium && (!req.screen_share || env.canShare) && (!req.fullscreen || env.canFullscreen);
  const displayOk = !req.block_extended_display || !env.extendedDisplay;
  const resuming = attempt?.status === "in_progress";
  const ended = info.status === "ended";
  const waiting = info.status === "ready";
  const ready = (!proctored || browserOk) && displayOk && (!req.screen_share || sharing) && agreed && info.status === "live";

  const type = info.type;
  const lockable = req.lock_on_leave || req.fullscreen || req.screen_share;
  const ordinal = `${info.max_violations}${["th", "st", "nd", "rd"][info.max_violations] || "th"}`;
  const leaveRule = req.lock_on_leave
    ? req.fullscreen
      ? "Stay on this tab, in fullscreen, until you submit. Switching tabs or windows, or leaving fullscreen, locks your exam."
      : "Stay on this tab until you submit. Switching to another tab or window locks your exam."
    : req.fullscreen && "Stay in fullscreen until you submit. Leaving fullscreen locks your exam.";
  const rules = [
    type === "internal" && "This page is your question paper. Write your programs the way your teacher tells you, then close the paper.",
    type === "external" &&
      "Each question has a Run button. An AI dry-runs your code against the test cases and your teacher's answer: you see how correct it is and whether each test would execute. Small syntax slips don't matter; the logic does.",
    type === "external" && (info.max_runs > 0 ? `You can run each question up to ${info.max_runs} times. Running the same code again doesn't use one.` : "You can run each question as often as you like."),
    type === "external" && "When you submit, your final code for every question is checked, even code you never ran.",
    leaveRule,
    lockable && "A locked exam needs your teacher's code to continue. Raise your hand and wait.",
    lockable && info.max_violations > 0 && `On the ${ordinal} lock, your exam is submitted automatically.`,
    req.block_clipboard && "Copy, paste and right-click are turned off.",
    type === "internal" ? "When the timer runs out, the paper closes on its own." : "Answers save automatically. If the timer runs out, what you've answered is submitted.",
    req.screen_share && "Your entire screen is shared while you write. Don't click the browser's sharing bar.",
  ].filter(Boolean);
  const startLabel = resuming ? (type === "internal" ? "Reopen the paper" : "Resume exam") : type === "internal" ? "Open the question paper" : req.fullscreen ? "Enter fullscreen and start" : "Start exam";

  return (
    <div className="min-h-screen bg-canvas bg-dots">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/student" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
          <ChevronLeft className="h-4 w-4" />
          My exams
        </Link>
        <Logo />
        <ThemeToggle />
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="animate-slide-up p-6 sm:p-8">
          <p className="text-[13px] font-medium text-primary-text">{EXAM_TYPES[type]?.label || "Exam"}</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-ink">{info.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" />
              {formatMinutes(info.duration_minutes)}
            </span>
            <span className="flex items-center gap-1.5">
              <FileQuestion className="h-4 w-4" />
              {pluralize(info.questions_per_set, "question")}
            </span>
          </div>
          {info.instructions && (
            <div className="mt-6 rounded-xl border border-line bg-subtle/50 p-4">
              <div className="text-[13px] font-semibold text-ink">From your teacher</div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{info.instructions}</p>
            </div>
          )}
          <div className="mt-6">
            <div className="text-[13px] font-semibold text-ink">Exam rules</div>
            <ul className="mt-2 space-y-2">
              {rules.map((rule) => (
                <li key={rule} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="h-fit animate-slide-up p-6 [animation-delay:80ms] sm:p-8">
          {ended && !resuming ? (
            <Callout tone="info" title="This exam has ended">
              It's no longer open for new attempts.
            </Callout>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-ink">{resuming ? "Resume your exam" : "Before you start"}</h2>
              {resuming && (
                <Callout tone={req.lock_on_rejoin ? "warning" : "info"} className="mt-3">
                  {req.lock_on_rejoin
                    ? "You left this exam earlier. Resuming locks it until your teacher enters the code, so call them over."
                    : "You left this exam earlier. Your saved answers are waiting, and the timer kept running."}
                </Callout>
              )}
              <ul className="mt-2 divide-y divide-line">
                {proctored && (
                  <CheckRow
                    ok={browserOk}
                    label="Laptop or desktop, in Chrome or Edge"
                    detail={browserOk ? "Your browser supports the exam." : env.mobile ? "Phones and tablets can't take this exam." : "Open this page in Google Chrome or Microsoft Edge."}
                  />
                )}
                {req.block_extended_display && <CheckRow ok={displayOk} label="One screen" detail={displayOk ? "No second monitor detected." : "Unplug your second monitor, then reload this page."} />}
                {req.screen_share && (
                  <CheckRow ok={sharing ? true : null} label="Share your entire screen" detail={sharing ? "Your screen is shared." : "Choose “Entire screen” in the picker that opens."}>
                    {!sharing && (
                      <Button size="sm" variant="secondary" icon={MonitorUp} className="mt-2.5" onClick={onShare} disabled={!browserOk}>
                        Share screen
                      </Button>
                    )}
                  </CheckRow>
                )}
                {req.fullscreen && <CheckRow ok={null} label="Fullscreen" detail="Turns on when you press Start." />}
                {!proctored && <CheckRow ok label="No special setup needed" detail="Your teacher has turned proctoring off for this exam." />}
              </ul>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-subtle/50 p-3.5">
                <Checkbox checked={agreed} onChange={setAgreed} label="I agree to the exam rules" className="mt-0.5" />
                <span className="text-[13px] leading-relaxed text-ink-2">
                  I've read the rules.
                  {req.lock_on_leave ? ` I'll stay on this tab${req.fullscreen ? " in fullscreen" : ""} until I submit.` : req.fullscreen ? " I'll stay in fullscreen until I submit." : ""}
                </span>
              </label>

              {waiting ? (
                <div className="mt-5 flex items-center justify-center gap-2.5 rounded-xl bg-info-soft px-4 py-3.5 text-sm font-medium text-info-text">
                  <Hourglass className="h-4 w-4" />
                  Waiting for your teacher to start the exam…
                  <Spinner className="h-4 w-4 text-info-text" />
                </div>
              ) : (
                <Button size="lg" className="mt-5 w-full" icon={resuming ? Play : req.fullscreen ? Maximize : Play} onClick={onStart} loading={starting} disabled={!ready}>
                  {startLabel}
                </Button>
              )}
              {!env.chromium && !proctored && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                  <MonitorSmartphone className="h-3.5 w-3.5" />
                  Works best in Chrome or Edge on a laptop.
                </p>
              )}
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
