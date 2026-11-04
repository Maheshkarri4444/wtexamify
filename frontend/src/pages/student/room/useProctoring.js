import { useEffect, useRef } from "react";

// Keys that would copy, paste, print, save or open the source/devtools.
const CLIPBOARD_KEYS = { c: "copy", v: "paste", x: "cut" };
const PAGE_KEYS = { p: "print", s: "save", u: "source" };

/**
 * While active, watches for the student leaving the exam (tab switch, window
 * switch, fullscreen exit) and blocks reload, print and devtools shortcuts.
 * Leaving calls onViolation; a blocked action calls onBlocked and is never
 * counted as cheating. reportLeaving and blockClipboard follow the exam's
 * settings: an internal usually lets students switch to their IDE and paste.
 */
export function useProctoring({ active, requireFullscreen, reportLeaving = true, blockClipboard = true, onViolation, onBlocked }) {
  const violation = useRef(onViolation);
  const blocked = useRef(onBlocked);
  useEffect(() => {
    violation.current = onViolation;
    blocked.current = onBlocked;
  });

  useEffect(() => {
    if (!active) return undefined;
    let blurTimer = null;
    const listeners = [];
    const listen = (target, type, handler, capture = false) => {
      target.addEventListener(type, handler, capture);
      listeners.push(() => target.removeEventListener(type, handler, capture));
    };
    // Stopping the event here (capture phase, before it reaches the page) also
    // keeps the code editor from handling a paste on its own.
    const refuse = (event, kind) => {
      event.preventDefault();
      event.stopPropagation();
      blocked.current(kind);
    };

    if (reportLeaving) {
      listen(document, "visibilitychange", () => {
        if (document.hidden) violation.current("tab_hidden");
      });
      // A short delay ignores focus flickers (for example a native picker); a real
      // switch to another app or window stays unfocused.
      listen(window, "blur", () => {
        clearTimeout(blurTimer);
        blurTimer = setTimeout(() => {
          if (!document.hasFocus()) violation.current("window_blur");
        }, 600);
      });
    }
    if (requireFullscreen) {
      listen(document, "fullscreenchange", () => {
        if (!document.fullscreenElement) violation.current("fullscreen_exit");
      });
    }
    if (blockClipboard) {
      for (const kind of ["copy", "cut", "paste", "contextmenu", "drop"]) listen(document, kind, (event) => refuse(event, kind), true);
      listen(document, "dragstart", (event) => event.preventDefault(), true);
    }
    listen(
      document,
      "keydown",
      (event) => {
        const key = event.key.toLowerCase();
        const mod = event.ctrlKey || event.metaKey;
        if (mod && !event.shiftKey && (PAGE_KEYS[key] || (blockClipboard && CLIPBOARD_KEYS[key]))) {
          refuse(event, PAGE_KEYS[key] || CLIPBOARD_KEYS[key]);
        } else if (event.key === "F12" || (mod && event.shiftKey && ["i", "j", "c"].includes(key))) {
          refuse(event, "devtools");
        } else if (event.key === "F5" || (mod && key === "r")) {
          refuse(event, "reload");
        }
      },
      true
    );
    listen(window, "beforeunload", (event) => {
      event.preventDefault();
      event.returnValue = "";
    });
    return () => {
      clearTimeout(blurTimer);
      listeners.forEach((remove) => remove());
    };
  }, [active, requireFullscreen, reportLeaving, blockClipboard]);
}
