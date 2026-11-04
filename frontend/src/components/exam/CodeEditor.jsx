import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { EditorView, Prec, keymap } from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { MySQL, PLSQL, sql } from "@codemirror/lang-sql";
import { cn } from "../../lib/cn";
import { useIsDark } from "../../lib/hooks";

const MODES = {
  sql: () => sql({ dialect: MySQL }),
  plsql: () => sql({ dialect: PLSQL }),
  python: () => python(),
  c: () => cpp(),
  cpp: () => cpp(),
  java: () => java(),
  javascript: () => javascript(),
  php: () => php({ plain: true }),
};

// The editor sits inside the app's card styles, so it borrows the app's tokens.
const frame = EditorView.theme({
  "&": { fontSize: "13.5px", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "'JetBrains Mono', ui-monospace, monospace", lineHeight: "1.65" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none" },
  "&.cm-focused": { outline: "none" },
});

/**
 * A code editor for one language. With blockClipboard, paste, drop, copy and
 * cut are refused inside the editor too (the exam room blocks them page-wide).
 * onRun, if given, runs on Ctrl/Cmd+Enter. height="100%" fills the parent.
 */
export default function CodeEditor({ value, onChange, language, readOnly = false, minHeight = "220px", maxHeight, height, blockClipboard = false, onBlocked, onRun, placeholder, className }) {
  const dark = useIsDark();
  // Callbacks live in refs so a new function each render doesn't rebuild the editor.
  const blockedRef = useRef(onBlocked);
  const runRef = useRef(onRun);
  useEffect(() => {
    blockedRef.current = onBlocked;
    runRef.current = onRun;
  });
  const runnable = Boolean(onRun);
  const extensions = useMemo(() => {
    const list = [frame, EditorView.lineWrapping];
    if (MODES[language]) list.push(MODES[language]());
    if (blockClipboard) {
      const refuse = (kind) => (event) => {
        event.preventDefault();
        blockedRef.current?.(kind);
        return true;
      };
      list.push(EditorView.domEventHandlers({ paste: refuse("paste"), drop: refuse("drop"), copy: refuse("copy"), cut: refuse("cut") }));
    }
    if (runnable) {
      const run = () => {
        runRef.current?.();
        return true;
      };
      list.push(Prec.highest(keymap.of([{ key: "Mod-Enter", run }])));
    }
    return list;
  }, [language, blockClipboard, runnable]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-line bg-subtle/40", className)}>
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={dark ? "dark" : "light"}
        extensions={extensions}
        readOnly={readOnly}
        editable={!readOnly}
        placeholder={placeholder}
        minHeight={minHeight}
        maxHeight={maxHeight}
        height={height}
        className={height === "100%" ? "h-full" : undefined}
        basicSetup={{ autocompletion: false, foldGutter: false, highlightActiveLine: !readOnly, highlightActiveLineGutter: !readOnly, searchKeymap: false }}
        indentWithTab
      />
    </div>
  );
}
