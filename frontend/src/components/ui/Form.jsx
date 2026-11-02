import { forwardRef, useId, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { cn } from "../../lib/cn";

const CONTROL =
  "w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm transition placeholder:text-muted/70 focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted";

export function Field({ label, hint, error, aside, children, className }) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || aside) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
              {label}
            </label>
          )}
          {aside}
        </div>
      )}
      {typeof children === "function" ? children(id) : children}
      {error ? <p className="text-xs text-danger-text">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(CONTROL, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(CONTROL, "min-h-[88px] resize-y py-2.5 leading-relaxed", className)} {...props} />;
});

export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select className={cn(CONTROL, "h-10 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Switch({ checked, onChange, disabled, label, description }) {
  return (
    <label className={cn("flex items-start justify-between gap-6", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          checked ? "bg-primary" : "bg-line-strong"
        )}
      >
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

export function Segmented({ value, onChange, options, size = "md", disabled, className }) {
  return (
    <div role="radiogroup" className={cn("inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-subtle p-0.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "h-7 text-xs" : "h-8 text-[13px]",
              active ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
            )}
          >
            {option.icon && <option.icon className="h-3.5 w-3.5" />}
            {option.label}
            {option.count !== undefined && <span className={cn("tabular-nums", active ? "text-muted" : "text-muted/80")}>{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 999, step = 1, disabled, label, className }) {
  // While typing, keep the raw text so "12" can be typed even when min is 2.
  const [draft, setDraft] = useState(null);
  const clamp = (n) => Math.min(max, Math.max(min, n));
  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    onChange(clamp(Number.isNaN(n) ? value : n));
    setDraft(null);
  };
  return (
    <div className={cn("inline-flex h-10 items-center rounded-lg border border-line bg-surface shadow-sm", disabled && "opacity-60", className)}>
      <button
        type="button"
        aria-label={`Decrease ${label || ""}`.trim()}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - step))}
        className="flex h-full w-9 items-center justify-center rounded-l-lg text-muted transition hover:bg-subtle hover:text-ink disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={draft ?? value}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="h-full w-12 border-x border-line bg-transparent text-center text-sm font-semibold tabular-nums text-ink focus:outline-none"
      />
      <button
        type="button"
        aria-label={`Increase ${label || ""}`.trim()}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + step))}
        className="flex h-full w-9 items-center justify-center rounded-r-lg text-muted transition hover:bg-subtle hover:text-ink disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className, indeterminate = false, ...props }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={(e) => onChange(e.target.checked)}
      className={cn("h-4 w-4 cursor-pointer rounded border-line-strong accent-[rgb(var(--primary))]", className)}
      {...props}
    />
  );
}
