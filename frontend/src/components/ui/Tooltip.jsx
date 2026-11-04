import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "../../lib/cn";

/** A short explanation shown above (or below) its trigger on hover and keyboard focus. */
export function Tooltip({ content, children, className }) {
  const [position, setPosition] = useState(null);
  const anchor = useRef(null);
  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const below = rect.top < 140;
    const x = Math.min(window.innerWidth - 148, Math.max(148, rect.left + rect.width / 2));
    setPosition({ x, y: below ? rect.bottom + 8 : rect.top - 8, below });
  };
  const hide = () => setPosition(null);
  return (
    <span ref={anchor} tabIndex={0} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide} className={cn("inline-flex cursor-help rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60", className)}>
      {children}
      {position &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: "fixed", left: position.x, top: position.y, transform: position.below ? "translate(-50%, 0)" : "translate(-50%, -100%)" }}
            className="pointer-events-none z-[70] w-max max-w-[280px] animate-fade-in rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-xs leading-relaxed text-ink-2 shadow-pop"
          >
            {content}
          </div>,
          document.body
        )}
    </span>
  );
}

/**
 * The small "i" beside a label. Hover, focus or tap it to read what the thing
 * is for. Clicks stop here, so one inside a <label> doesn't toggle its control.
 */
export function InfoTip({ text, className }) {
  if (!text) return null;
  return (
    <span
      className={cn("inline-flex align-[-2px]", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Tooltip content={text} className="text-muted transition hover:text-primary-text focus-visible:text-primary-text">
        <Info aria-hidden className="h-3.5 w-3.5" />
        <span className="sr-only">{typeof text === "string" ? text : "More about this"}</span>
      </Tooltip>
    </span>
  );
}
