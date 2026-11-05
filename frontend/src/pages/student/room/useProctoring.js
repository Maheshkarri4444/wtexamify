import { useEffect, useRef } from "react";

// Keys that would copy, paste, print, save or open the source/devtools.
const CLIPBOARD_KEYS = { c: "copy", v: "paste", x: "cut" };
const PAGE_KEYS = { p: "print", s: "save", u: "source" };

// A short delay ignores focus flickers (for example a native picker); a real
// switch to another app or window stays unfocused.
const BLUR_DELAY_MS = 600;
// How long a student has to click back in after clicking something that floats
// over the fullscreen exam, such as Chrome's "sharing your screen" bar.
const OVER_EXAM_GRACE_MS = 10000;

const modifierDown = (event) => event.altKey || event.ctrlKey || event.metaKey;

/**
 * While active, watches for the student leaving the exam (tab switch, window
 * switch, fullscreen exit) and blocks reload, print and devtools shortcuts.
 * Leaving calls onViolation; a blocked action calls onBlocked and is never
 * counted as cheating. reportLeaving and blockClipboard follow the exam's
 * settings: an internal usually lets students switch to their IDE and paste.
 *
 * In fullscreen only a floating window can sit over the exam, and the one
 * students click is Chrome's "sharing your screen" bar: moving or hiding it
 * takes focus off the page. With onAway, losing focus that way (the mouse off
 * the page and no Alt, Ctrl or Cmd held) calls onAway(lockAt) and locks only
 * if the student hasn't clicked back in by then; onAway(null, msAway) when
 * they're back, onAway(null) when it ends otherwise. Switching with the
 * keyboard, a hidden page or a second screen locks as before.
 */
export function useProctoring({ active, requireFullscreen, reportLeaving = true, blockClipboard = true, onViolation, onBlocked, onAway }) {
  const violation = useRef(onViolation);
  const blocked = useRef(onBlocked);
  const away = useRef(onAway);
  useEffect(() => {
    violation.current = onViolation;
    blocked.current = onBlocked;
    away.current = onAway;
  });

  useEffect(() => {
    if (!active) return undefined;
    let blurTimer = null;
    let awaySince = 0; // when the student clicked onto something over the exam
    let mouseOff = false; // the mouse is over another window, not the page
    let modifier = false; // Alt, Ctrl or Cmd was down at the last key or mouse event
    let lastKeyAt = 0;
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
    const noteKey = (event) => {
      modifier = modifierDown(event);
      lastKeyAt = Date.now();
    };
    const endAway = (back) => {
      if (!awaySince) return;
      const ms = Date.now() - awaySince;
      awaySince = 0;
      if (back) away.current?.(null, ms);
      else away.current?.(null);
    };
    // A click on the sharing bar: the mouse went off the page and no switching key was pressed.
    const clickedOverExam = () =>
      Boolean(away.current) && mouseOff && !modifier && Date.now() - lastKeyAt > 500 && Boolean(document.fullscreenElement) && window.screen?.isExtended !== true;

    if (reportLeaving) {
      listen(document, "visibilitychange", () => {
        if (document.hidden) violation.current("tab_hidden");
      });
      listen(document, "mouseout", (event) => (mouseOff = !event.relatedTarget), true);
      listen(document, "mouseover", () => (mouseOff = false), true);
      listen(document, "mousemove", (event) => (modifier = modifierDown(event)), true);
      listen(window, "blur", () => {
        clearTimeout(blurTimer);
        if (!awaySince && clickedOverExam()) {
          awaySince = Date.now();
          away.current(awaySince + OVER_EXAM_GRACE_MS);
        }
        const wait = awaySince ? awaySince + OVER_EXAM_GRACE_MS - Date.now() : BLUR_DELAY_MS;
        blurTimer = setTimeout(() => {
          if (document.hasFocus()) {
            endAway(true);
            return;
          }
          endAway(false);
          violation.current("window_blur");
        }, Math.max(0, wait));
      });
      listen(window, "focus", () => {
        clearTimeout(blurTimer);
        endAway(true);
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
    listen(document, "keyup", noteKey, true);
    listen(
      document,
      "keydown",
      (event) => {
        noteKey(event);
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
      endAway(false);
    };
  }, [active, requireFullscreen, reportLeaving, blockClipboard]);
}
