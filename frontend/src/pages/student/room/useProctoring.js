import { useEffect, useRef } from "react";

// Keys that would copy, paste, print, save or open the source/devtools.
const BLOCKED_WITH_MODIFIER = { c: "copy", v: "paste", x: "cut", p: "print", s: "save", u: "source" };

/**
 * While active, watches for the student leaving the exam (tab switch, window
 * switch, fullscreen exit) and blocks copy, paste, right-click, drag-and-drop,
 * reload and devtools shortcuts. Leaving calls onViolation; a blocked action
 * calls onBlocked and is never counted as cheating.
 */
export function useProctoring({ active, requireFullscreen, onViolation, onBlocked }) {
  const violation = useRef(onViolation);
  const blocked = useRef(onBlocked);
  useEffect(() => {
    violation.current = onViolation;
    blocked.current = onBlocked;
  });

  useEffect(() => {
    if (!active) return undefined;
    let blurTimer = null;

    const onVisibility = () => {
      if (document.hidden) violation.current("tab_hidden");
    };
    // A short delay ignores focus flickers (for example a native picker); a real
    // switch to another app or window stays unfocused.
    const onBlur = () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!document.hasFocus()) violation.current("window_blur");
      }, 600);
    };
    const onFullscreen = () => {
      if (requireFullscreen && !document.fullscreenElement) violation.current("fullscreen_exit");
    };
    const block = (kind) => (event) => {
      event.preventDefault();
      blocked.current(kind);
    };
    const onCopy = block("copy");
    const onCut = block("cut");
    const onPaste = block("paste");
    const onContextMenu = block("contextmenu");
    const onDrop = block("drop");
    const onDragStart = (event) => event.preventDefault();
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && BLOCKED_WITH_MODIFIER[key] && !event.shiftKey) {
        event.preventDefault();
        blocked.current(BLOCKED_WITH_MODIFIER[key]);
      } else if (event.key === "F12" || (mod && event.shiftKey && ["i", "j", "c"].includes(key))) {
        event.preventDefault();
        blocked.current("devtools");
      } else if (event.key === "F5" || (mod && key === "r")) {
        event.preventDefault();
        blocked.current("reload");
      }
    };
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCut, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearTimeout(blurTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCut, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active, requireFullscreen]);
}
