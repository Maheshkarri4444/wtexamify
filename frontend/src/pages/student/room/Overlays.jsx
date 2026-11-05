import { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, Maximize, MonitorUp, RefreshCw, Send, ShieldAlert, Unlock } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Modal } from "../../../components/ui/Overlay";
import { cn } from "../../../lib/cn";
import { useNow } from "../../../lib/hooks";

function CodeInput({ value, onChange, autoFocus }) {
  return (
    <input
      type="password"
      inputMode="text"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      data-lpignore="true"
      data-1p-ignore="true"
      name="teacher-code"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
      maxLength={20}
      placeholder="••••••"
      className="h-14 w-full rounded-xl border-2 border-line bg-surface text-center font-mono text-2xl font-semibold tracking-[0.4em] text-ink shadow-sm placeholder:tracking-[0.3em] placeholder:text-muted/50 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
    />
  );
}

/** In the demo there's no teacher, so the code they'd type is shown right in the box. */
function DemoCode({ label, code }) {
  return (
    <div className="mt-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft px-3 py-2.5 text-[13px] text-primary-text">
      Demo only: in a real exam your teacher types the {label} here. For this demo it's <span className="font-mono text-base font-bold tracking-[0.2em]">{code}</span>
    </div>
  );
}

function OverlayShell({ children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-canvas/95 p-4 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-dots opacity-60" />
      <Card className="relative w-full max-w-md animate-scale-in p-7 text-center shadow-pop sm:p-8">{children}</Card>
    </div>
  );
}

export function LockOverlay({ state, onUnlock, onRefresh, demoCodes }) {
  const [mode, setMode] = useState("unlock");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const now = useNow(1000);
  const blockedFor = state.code_blocked_until ? Math.max(0, Math.ceil((new Date(state.code_blocked_until).getTime() - now) / 1000)) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!code || blockedFor) return;
    setBusy(true);
    const ok = await (mode === "unlock" ? onUnlock(code) : onRefresh(code));
    setBusy(false);
    if (!ok) setCode("");
  };

  return (
    <OverlayShell>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger-text">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-ink">Your exam is locked</h2>
      <p className="mt-1.5 text-sm text-muted">{state.lock_reason || "You left the exam."}</p>
      {state.max_violations > 0 && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-[13px] font-medium text-warning-text">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Lock {state.violations} of {state.max_violations}. At {state.max_violations}, your exam is submitted automatically.
        </div>
      )}
      <p className="mt-5 text-sm leading-relaxed text-ink-2">Raise your hand. Your teacher will type the code here, or unlock you from their dashboard.</p>
      {demoCodes && <DemoCode label={mode === "unlock" ? "exam's copy code" : "refresh code"} code={mode === "unlock" ? demoCodes.copy : demoCodes.refresh} />}

      <form onSubmit={submit} className="mt-5 space-y-3">
        <CodeInput value={code} onChange={setCode} autoFocus />
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!code || blockedFor > 0} icon={mode === "unlock" ? Unlock : RefreshCw}>
          {blockedFor > 0 ? `Try again in ${blockedFor}s` : mode === "unlock" ? "Unlock" : "Give a new set"}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "unlock" ? "refresh" : "unlock");
          setCode("");
        }}
        className="mt-4 text-[13px] font-medium text-primary-text hover:underline"
      >
        {mode === "unlock" ? "Teacher: give a new set instead" : "Teacher: unlock with the copy code"}
      </button>
      {mode === "refresh" && <p className="mt-2 text-xs text-muted">A new set clears every answer on this paper.</p>}
    </OverlayShell>
  );
}

/** Shown after an unlock when fullscreen or screen sharing has to be turned back on. */
export function ResumeGate({ needsShare, needsFullscreen, onShare, onFullscreen }) {
  return (
    <OverlayShell>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-text">
        {needsShare ? <MonitorUp className="h-7 w-7" /> : <Maximize className="h-7 w-7" />}
      </div>
      <h2 className="mt-5 text-xl font-semibold text-ink">Back to your exam</h2>
      <p className="mt-1.5 text-sm text-muted">{needsShare ? "Share your entire screen again to keep writing." : "The exam continues in fullscreen."}</p>
      <div className="mt-6 space-y-2.5">
        {needsShare && (
          <Button size="lg" className="w-full" icon={MonitorUp} onClick={onShare}>
            Share entire screen
          </Button>
        )}
        {needsFullscreen && (
          <Button size="lg" variant={needsShare ? "secondary" : "primary"} className="w-full" icon={Maximize} onClick={onFullscreen}>
            Return to fullscreen
          </Button>
        )}
      </div>
    </OverlayShell>
  );
}

export function SubmitModal({ open, onClose, onConfirm, submitting, examType = "viva", answered, total, marked, unchecked = 0 }) {
  if (examType === "internal") {
    return (
      <Modal
        open={open}
        onClose={onClose}
        dismissable={!submitting}
        icon={Send}
        title="Close the question paper?"
        description="You won't be able to open it again. Your teacher marks your programs separately."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Keep it open
            </Button>
            <Button onClick={onConfirm} loading={submitting} icon={Send}>
              Close the paper
            </Button>
          </>
        }
      />
    );
  }
  const unanswered = total - answered;
  const stats =
    examType === "external"
      ? [
          { label: "Written", value: answered, tone: "text-primary-text" },
          { label: "Not written", value: unanswered, tone: unanswered ? "text-danger-text" : "text-muted" },
          { label: "Not run yet", value: unchecked, tone: unchecked ? "text-warning-text" : "text-muted" },
        ]
      : [
          { label: "Answered", value: answered, tone: "text-primary-text" },
          { label: "Not answered", value: unanswered, tone: unanswered ? "text-danger-text" : "text-muted" },
          { label: "For review", value: marked, tone: marked ? "text-warning-text" : "text-muted" },
        ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!submitting}
      icon={Send}
      title="Submit your exam?"
      description="You can't change your answers after this."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Keep writing
          </Button>
          <Button onClick={onConfirm} loading={submitting} icon={Send}>
            Submit exam
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2 pt-1">
        {stats.map(({ label, value, tone }) => (
          <div key={label} className="rounded-xl border border-line bg-subtle/50 px-3 py-3 text-center">
            <div className={cn("text-2xl font-semibold", tone)}>{value}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>
      {unanswered > 0 && <p className="mt-4 text-[13px] text-danger-text">{unanswered === 1 ? "One question is" : `${unanswered} questions are`} still unanswered.</p>}
      {examType === "external" && <p className="mt-3 text-[13px] leading-relaxed text-muted">After you submit, your final code for every question is checked, including code you never ran.</p>}
    </Modal>
  );
}

export function TeacherToolsModal({ open, onClose, onRefresh, demoCode }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setCode("");
  }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onRefresh(code);
    setBusy(false);
    if (!ok) setCode("");
  };
  return (
    <Modal open={open} onClose={onClose} icon={KeyRound} title="Teacher tools" description="For your teacher only. The refresh code gives this student a different set and clears every answer." size="sm">
      <form onSubmit={submit} className="space-y-3 pt-1">
        {demoCode && <DemoCode label="refresh code" code={demoCode} />}
        <CodeInput value={code} onChange={setCode} autoFocus />
        <Button type="submit" className="w-full" icon={RefreshCw} loading={busy} disabled={!code}>
          Give a new set
        </Button>
      </form>
    </Modal>
  );
}
