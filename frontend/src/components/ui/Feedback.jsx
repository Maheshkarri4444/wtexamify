import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { cn } from "../../lib/cn";

export function Spinner({ className }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-muted", className)} />;
}

export function PageLoader({ label = "Loading…" }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-muted">
      <Spinner className="h-6 w-6 text-primary" />
      {label}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn("animate-pulse rounded-lg bg-subtle", className)} />;
}

export function EmptyState({ icon: Icon, title, description, children, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center", className)}>
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-text">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

const CALLOUT = {
  info: { icon: Info, box: "border-info/25 bg-info-soft", text: "text-info-text" },
  success: { icon: CheckCircle2, box: "border-success/25 bg-success-soft", text: "text-success-text" },
  warning: { icon: AlertTriangle, box: "border-warning/30 bg-warning-soft", text: "text-warning-text" },
  danger: { icon: XCircle, box: "border-danger/25 bg-danger-soft", text: "text-danger-text" },
};

export function Callout({ tone = "info", icon, title, children, action, className }) {
  const style = CALLOUT[tone];
  const Icon = icon || style.icon;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", style.box, className)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.text)} />
      <div className="min-w-0 flex-1 text-sm">
        {title && <div className={cn("font-semibold", style.text)}>{title}</div>}
        {children && <div className={cn("leading-relaxed text-ink-2", title && "mt-0.5")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
