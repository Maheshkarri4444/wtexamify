import { cn } from "../../lib/cn";

const TONES = {
  neutral: "bg-subtle text-ink-2 ring-line",
  primary: "bg-primary-soft text-primary-text ring-primary/20",
  success: "bg-success-soft text-success-text ring-success/25",
  warning: "bg-warning-soft text-warning-text ring-warning/25",
  danger: "bg-danger-soft text-danger-text ring-danger/20",
  info: "bg-info-soft text-info-text ring-info/20",
};

const DOTS = { neutral: "bg-muted", primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info" };

export function Badge({ tone = "neutral", dot = false, pulse = false, icon: Icon, className, children, ...props }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}
      {...props}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-70", DOTS[tone])} />}
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", DOTS[tone])} />
        </span>
      )}
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

export function Kbd({ children }) {
  return <kbd className="rounded border border-line bg-surface px-1.5 py-px font-mono text-[11px] text-muted shadow-sm">{children}</kbd>;
}
