import { useState } from "react";
import toast from "react-hot-toast";
import { BookOpenCheck, Copy, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";
import { cn } from "../../lib/cn";
import { EXAM_TYPES } from "../../lib/examTypes";
import { DIFFICULTY, EXAM_STATUS, QUESTION_TYPES } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { IconButton } from "../ui/Button";

export function StatusBadge({ status }) {
  const meta = EXAM_STATUS[status] || EXAM_STATUS.draft;
  return (
    <Badge tone={meta.tone} dot pulse={meta.pulse}>
      {meta.label}
    </Badge>
  );
}

export function TypeIcon({ type, className }) {
  const Icon = EXAM_TYPES[type]?.icon || BookOpenCheck;
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-violet-500/15 text-primary-text ring-1 ring-inset ring-primary/15", className)}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function QuestionTypeBadge({ type }) {
  return <Badge tone="primary">{QUESTION_TYPES[type]?.label || type}</Badge>;
}

export function DifficultyBadge({ difficulty }) {
  if (!difficulty) return null;
  const meta = DIFFICULTY[difficulty];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

/** Renders question text with ____ shown as a blank to fill. */
export function QuestionText({ text, className }) {
  const parts = String(text || "").split(/(_{3,})/);
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, i) =>
        /^_{3,}$/.test(part) ? (
          <span key={i} className="mx-1 inline-block min-w-[4.5rem] translate-y-[2px] border-b-2 border-primary/60" aria-label="blank" />
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

function CodeRow({ label, hint, icon: Icon, code, revealed, onRegenerate, busy }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy. Select it and copy instead.");
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-subtle/50 px-3.5 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-2 ring-1 ring-line">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      <span className={cn("font-mono text-[17px] font-semibold tracking-[0.2em] text-ink", !revealed && "select-none blur-[5px]")}>{code || "——————"}</span>
      <IconButton icon={Copy} label={`Copy ${label.toLowerCase()}`} size="sm" onClick={copy} />
      {onRegenerate && <IconButton icon={RefreshCw} label={`New ${label.toLowerCase()}`} size="sm" onClick={onRegenerate} disabled={busy} />}
    </div>
  );
}

/** The two teacher-only codes, hidden until revealed so students can't read them off the screen. */
export function TeacherCodes({ settings, onRegenerate, busy, className }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">Only you should see these</span>
        <button type="button" onClick={() => setRevealed((v) => !v)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-text hover:underline">
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {revealed ? "Hide" : "Reveal"}
        </button>
      </div>
      <CodeRow
        label="Copy code"
        hint="Unlocks a student whose exam locked"
        icon={KeyRound}
        code={settings.copy_code}
        revealed={revealed}
        busy={busy}
        onRegenerate={onRegenerate && (() => onRegenerate("copy"))}
      />
      <CodeRow
        label="Refresh code"
        hint="Gives a student a new set and clears answers"
        icon={RefreshCw}
        code={settings.refresh_code}
        revealed={revealed}
        busy={busy}
        onRegenerate={onRegenerate && (() => onRegenerate("refresh"))}
      />
    </div>
  );
}
