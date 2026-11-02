import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";

const ICON_TONES = {
  neutral: "bg-subtle text-muted",
  primary: "bg-primary-soft text-primary-text",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-danger-text",
  info: "bg-info-soft text-info-text",
};

/** A labelled number. Big standalone values keep proportional figures. */
export function StatTile({ label, value, hint, icon: Icon, tone = "neutral", className }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-4 shadow-card", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {Icon && (
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", ICON_TONES[tone])}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

// The fill carries severity; the track is a lighter step of the same color.
const METER = {
  primary: ["bg-primary", "bg-primary/15"],
  success: ["bg-success", "bg-success/15"],
  warning: ["bg-warning", "bg-warning/20"],
  danger: ["bg-danger", "bg-danger/15"],
  neutral: ["bg-muted", "bg-line"],
};

export function Meter({ value, tone = "primary", label, className }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  const [fill, track] = METER[tone];
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full", track, className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const RING = { primary: ["text-primary", "text-primary/15"], warning: ["text-warning", "text-warning/20"], danger: ["text-danger", "text-danger/15"] };

export function ProgressRing({ value, size = 168, stroke = 12, tone = "primary", children }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(Math.max(0, Math.min(100, value || 0))));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [fill, track] = RING[tone];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} stroke="currentColor" className={track} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          className={cn(fill, "transition-[stroke-dashoffset] duration-1000 ease-out")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/**
 * Column chart for one series (no legend: the card title names it). Columns are
 * capped at 24px with a rounded top and a square base; each band is a hover and
 * focus target with a tooltip, and only the tallest column carries a label.
 */
export function Histogram({ bins, labels, tooltip, height = 160 }) {
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...bins);
  const tallest = bins.indexOf(Math.max(...bins));
  // Clean ticks: 0, the top, and a midpoint only when it lands on a whole number.
  const ticks = [...new Set([0, max % 2 === 0 ? max / 2 : null, max].filter((v) => v !== null))];
  return (
    <div className="flex gap-3">
      <div className="relative w-6 shrink-0 text-right text-[11px] tabular-nums text-muted" style={{ height }}>
        {ticks.map((tick) => (
          <span key={tick} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(tick / max) * 100}%` }}>
            {tick}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((tick) => (
            <div key={tick} className={cn("absolute inset-x-0 border-t", tick === 0 ? "border-line-strong" : "border-line")} style={{ bottom: `${(tick / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {bins.map((count, i) => {
              const tip = tooltip(i, count);
              return (
              <button
                key={labels[i]}
                type="button"
                aria-label={`${tip.label}: ${tip.value}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="group relative flex h-full flex-1 items-end justify-center focus-visible:outline-none"
              >
                {active === i && (
                  <span className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left shadow-pop">
                    <span className="block text-sm font-semibold text-ink">{tip.value}</span>
                    <span className="block text-[11px] text-muted">{tip.label}</span>
                  </span>
                )}
                {i === tallest && count > 0 && active !== i && (
                  <span className="absolute text-[11px] font-medium tabular-nums text-ink-2" style={{ bottom: `calc(${(count / max) * 100}% + 4px)` }}>
                    {count}
                  </span>
                )}
                <span
                  className={cn(
                    "w-full max-w-[24px] rounded-t-[4px] bg-primary transition-opacity",
                    active !== null && active !== i ? "opacity-60" : "opacity-100",
                    "group-focus-visible:ring-2 group-focus-visible:ring-ring/60"
                  )}
                  style={{ height: count ? `${(count / max) * 100}%` : 0 }}
                />
              </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex">
          {labels.map((label) => (
            <span key={label} className="flex-1 text-center text-[11px] tabular-nums text-muted">
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
