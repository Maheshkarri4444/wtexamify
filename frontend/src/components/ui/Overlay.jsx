import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button, IconButton } from "./Button";
import { Input } from "./Form";

export { InfoTip, Tooltip } from "./Tooltip";

function useOverlay(open, onClose, dismissable) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && dismissable) closeRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, dismissable]);
}

const MODAL_SIZES = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

export function Modal({ open, onClose, title, description, icon: Icon, iconTone = "primary", children, footer, size = "md", dismissable = true }) {
  useOverlay(open, onClose, dismissable);
  if (!open) return null;
  const tones = { primary: "bg-primary-soft text-primary-text", danger: "bg-danger-soft text-danger-text", warning: "bg-warning-soft text-warning-text", success: "bg-success-soft text-success-text" };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/45 backdrop-blur-[2px]" onClick={dismissable ? onClose : undefined} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cn("relative flex max-h-[92vh] w-full animate-scale-in flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-2xl", MODAL_SIZES[size])}
      >
        {(title || Icon) && (
          <div className="flex items-start gap-3 px-6 pb-3 pt-5">
            {Icon && (
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tones[iconTone])}>
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
              {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
            </div>
            {dismissable && <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1" />}
          </div>
        )}
        {/* relative keeps absolutely placed text (the info tips' screen-reader text) inside the scroll area, so the dialog itself never scrolls */}
        <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-subtle/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ open, onClose, title, description, actions, children, width = "max-w-2xl" }) {
  useOverlay(open, onClose, true);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className={cn("relative flex h-full w-full animate-slide-in-right flex-col border-l border-line bg-surface shadow-pop", width)}>
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-semibold text-ink">{title}</h2>
            {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
          </div>
          {actions}
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body
  );
}

/** A yes/no dialog. With confirmText set, the user must type it to enable the button. */
export function ConfirmModal({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", tone = "primary", icon, loading, confirmText, children }) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const blocked = Boolean(confirmText) && typed.trim().toLowerCase() !== confirmText.toLowerCase();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon}
      iconTone={tone === "danger" ? "danger" : "primary"}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading} disabled={blocked}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {confirmText && (
        <div className="mt-1 space-y-2">
          <p className="text-sm text-muted">
            Type <span className="font-semibold text-ink">{confirmText}</span> to confirm.
          </p>
          <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirmText} />
        </div>
      )}
    </Modal>
  );
}

/**
 * A small dropdown menu. trigger receives { open, toggle } and renders the button.
 * The menu floats above the page (so a scrolling table can't clip it) and opens
 * upwards when there's no room below.
 */
export function Menu({ trigger, items, align = "end", width = "w-56" }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const anchor = useRef(null);
  const panel = useRef(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }
    const rect = anchor.current.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom;
    const up = roomBelow < 260 && rect.top > roomBelow;
    setPosition({
      up,
      top: up ? undefined : rect.bottom + 6,
      bottom: up ? window.innerHeight - rect.top + 6 : undefined,
      left: align === "end" ? undefined : rect.left,
      right: align === "end" ? window.innerWidth - rect.right : undefined,
    });
    const onDown = (e) => {
      if (!anchor.current?.contains(e.target) && !panel.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, align]);

  return (
    <div ref={anchor} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && position && createPortal(
        <div
          ref={panel}
          role="menu"
          style={{ position: "fixed", top: position.top, bottom: position.bottom, left: position.left, right: position.right }}
          className={cn(
            "z-[60] animate-scale-in rounded-xl border border-line bg-surface p-1 shadow-pop",
            width,
            position.up ? (align === "end" ? "origin-bottom-right" : "origin-bottom-left") : align === "end" ? "origin-top-right" : "origin-top-left"
          )}
        >
          {items.filter(Boolean).map((item, i) =>
            item === "divider" ? (
              <div key={`divider-${i}`} className="my-1 h-px bg-line" />
            ) : item.heading ? (
              <div key={`heading-${i}`} className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {item.heading}
              </div>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:pointer-events-none disabled:opacity-40",
                  item.danger ? "text-danger-text hover:bg-danger-soft" : "text-ink-2 hover:bg-subtle hover:text-ink"
                )}
              >
                {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-xs text-muted">{item.hint}</span>}
              </button>
            )
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
