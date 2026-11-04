import { useEffect, useRef, useState } from "react";
import { Check, CircleDot, ListChecks, PenLine, Plus, TextCursorInput, X } from "lucide-react";
import { Button, IconButton } from "../../../components/ui/Button";
import { Callout } from "../../../components/ui/Feedback";
import { Field, Input, Segmented, Stepper, Textarea } from "../../../components/ui/Form";
import { Modal } from "../../../components/ui/Overlay";
import { cn } from "../../../lib/cn";
import { letter } from "../../../lib/format";

const BLANK = { type: "mcq_single", text: "", options: ["", "", "", ""], correct: [], answers: [], difficulty: "", marks: 1 };
const MAX_OPTIONS = 8;

function fromQuestion(question) {
  if (!question) return { ...BLANK, options: [...BLANK.options] };
  return {
    ...BLANK,
    ...question,
    options: question.options?.length ? [...question.options] : [...BLANK.options],
    correct: [...(question.correct || [])],
    answers: [...(question.answers || [])],
  };
}

// The same rules the server applies, so mistakes show up before saving.
function validate(q) {
  if (!q.text.trim()) return "Write the question.";
  if (q.type === "fill") return q.answers.length ? "" : "Add at least one accepted answer.";
  const filled = q.options.map((o) => o.trim());
  if (filled.filter(Boolean).length < 2) return "Add at least two options.";
  const lower = filled.filter(Boolean).map((o) => o.toLowerCase());
  if (new Set(lower).size !== lower.length) return "Two options are the same.";
  const correct = q.correct.filter((i) => filled[i]);
  if (!correct.length) return "Mark the correct option.";
  if (q.type === "mcq_single" && correct.length !== 1) return "Pick exactly one correct option.";
  return "";
}

function clean(q) {
  if (q.type === "fill") return { type: q.type, text: q.text.trim(), options: [], correct: [], answers: q.answers, difficulty: q.difficulty, marks: q.marks };
  const options = [];
  const index = new Map();
  q.options.forEach((option, i) => {
    if (option.trim()) {
      index.set(i, options.length);
      options.push(option.trim());
    }
  });
  const correct = q.correct.filter((i) => index.has(i)).map((i) => index.get(i)).sort((a, b) => a - b);
  return { type: q.type, text: q.text.trim(), options, correct, answers: [], difficulty: q.difficulty, marks: q.marks };
}

function AnswerChips({ answers, onChange }) {
  const [draft, setDraft] = useState("");
  const add = (value) => {
    const parts = value.split("|").map((v) => v.trim()).filter(Boolean);
    const next = [...answers];
    for (const part of parts) if (!next.some((a) => a.toLowerCase().replace(/\s+/g, "") === part.toLowerCase().replace(/\s+/g, ""))) next.push(part);
    onChange(next);
    setDraft("");
  };
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 shadow-sm focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10">
      {answers.map((answer) => (
        <span key={answer} className="inline-flex items-center gap-1 rounded-md bg-success-soft py-1 pl-2 pr-1 text-[13px] font-medium text-success-text">
          {answer}
          <button type="button" aria-label={`Remove ${answer}`} onClick={() => onChange(answers.filter((a) => a !== answer))} className="rounded p-0.5 hover:bg-success/15">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === "," || e.key === "|") && draft.trim()) {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && answers.length) {
            onChange(answers.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={answers.length ? "Add another spelling…" : "Type an accepted answer and press Enter"}
        className="h-8 min-w-[12rem] flex-1 bg-transparent px-1 text-sm text-ink placeholder:text-muted/70 focus:outline-none"
      />
    </div>
  );
}

export default function QuestionEditor({ open, onClose, question, onSave, saving }) {
  const editing = Boolean(question);
  const [q, setQ] = useState(() => fromQuestion(question));
  const [error, setError] = useState("");
  const textRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ(fromQuestion(question));
      setError("");
    }
  }, [open, question]);

  const update = (patch) => {
    setQ((current) => ({ ...current, ...patch }));
    setError("");
  };

  const setType = (type) => {
    setQ((current) => {
      const next = { ...current, type };
      if (type === "mcq_single" && current.correct.length > 1) next.correct = current.correct.slice(0, 1);
      if (type !== "fill" && current.options.length < 2) next.options = [...BLANK.options];
      return next;
    });
    setError("");
  };

  const toggleCorrect = (i) => {
    setQ((current) => {
      if (current.type === "mcq_single") return { ...current, correct: [i] };
      const has = current.correct.includes(i);
      return { ...current, correct: has ? current.correct.filter((c) => c !== i) : [...current.correct, i] };
    });
    setError("");
  };

  const setOption = (i, value) => update({ options: q.options.map((o, j) => (j === i ? value : o)) });

  const removeOption = (i) => {
    setQ((current) => ({
      ...current,
      options: current.options.filter((_, j) => j !== i),
      correct: current.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)),
    }));
  };

  const submit = async (another) => {
    const problem = validate(q);
    if (problem) {
      setError(problem);
      return;
    }
    const ok = await onSave(clean(q), another);
    if (ok && another) {
      setQ((current) => ({ ...BLANK, options: [...BLANK.options], type: current.type, difficulty: current.difficulty, marks: current.marks }));
      textRef.current?.focus();
    }
  };

  const isMcq = q.type !== "fill";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={PenLine}
      title={editing ? "Edit question" : "Add a question"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {!editing && (
            <Button variant="secondary" onClick={() => submit(true)} loading={saving}>
              Save and add another
            </Button>
          )}
          <Button onClick={() => submit(false)} loading={saving} icon={Check}>
            {editing ? "Save changes" : "Add question"}
          </Button>
        </>
      }
    >
      <div className="space-y-5 pt-1">
        <Segmented
          value={q.type}
          onChange={setType}
          options={[
            { value: "mcq_single", label: "Single correct", icon: CircleDot },
            { value: "mcq_multi", label: "Multiple correct", icon: ListChecks },
            { value: "fill", label: "Fill in the blank", icon: TextCursorInput },
          ]}
        />

        <Field label="Question" info="The question students read. For fill in the blank, type ____ (four underscores) where the blank goes." hint={q.type === "fill" ? "Type ____ (four underscores) where the blank goes." : undefined}>
          {(id) => (
            <Textarea
              id={id}
              ref={textRef}
              autoFocus
              rows={3}
              value={q.text}
              onChange={(e) => update({ text: e.target.value })}
              placeholder={q.type === "fill" ? "The ____ holds the address of the next instruction." : "Which register holds the address of the next instruction?"}
            />
          )}
        </Field>

        {isMcq ? (
          <Field label="Options" info="Up to eight options. Mark the correct ones: exactly one for single-correct, one or more for multiple-correct." aside={<span className="text-xs text-muted">{q.type === "mcq_single" ? "Click the circle next to the right answer" : "Tick every correct option"}</span>}>
            <div className="space-y-2">
              {q.options.map((option, i) => {
                const correct = q.correct.includes(i);
                return (
                  <div key={i} className={cn("flex items-center gap-2 rounded-xl border p-1.5 pl-2 transition", correct ? "border-success/50 bg-success-soft/60" : "border-line bg-surface")}>
                    <button
                      type="button"
                      onClick={() => toggleCorrect(i)}
                      aria-label={`Mark option ${letter(i)} as correct`}
                      aria-pressed={correct}
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center border-2 text-xs font-bold transition",
                        q.type === "mcq_single" ? "rounded-full" : "rounded-md",
                        correct ? "border-success bg-success text-white" : "border-line-strong text-muted hover:border-success/60"
                      )}
                    >
                      {correct ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : letter(i)}
                    </button>
                    <input
                      value={option}
                      onChange={(e) => setOption(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (i === q.options.length - 1 && q.options.length < MAX_OPTIONS) update({ options: [...q.options, ""] });
                        }
                      }}
                      placeholder={`Option ${letter(i)}`}
                      className="h-9 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted/70 focus:outline-none"
                    />
                    {correct && <span className="hidden text-xs font-medium text-success-text sm:block">Correct</span>}
                    <IconButton icon={X} label={`Remove option ${letter(i)}`} size="sm" onClick={() => removeOption(i)} disabled={q.options.length <= 2} />
                  </div>
                );
              })}
              {q.options.length < MAX_OPTIONS && (
                <Button variant="ghost" size="sm" icon={Plus} onClick={() => update({ options: [...q.options, ""] })}>
                  Add option
                </Button>
              )}
            </div>
          </Field>
        ) : (
          <Field label="Accepted answers" info="Any of these counts as correct. Capital letters and spaces are ignored when marking." hint="Marking ignores capital letters and spaces, so “Program Counter” matches “programcounter”. Add every other spelling you accept.">
            <AnswerChips answers={q.answers} onChange={(answers) => update({ answers })} />
          </Field>
        )}

        <div className="flex flex-wrap items-end gap-6">
          <Field label="Difficulty" info="Used when the blueprint balances sets by difficulty. A question without one counts as medium.">
            <Segmented
              value={q.difficulty}
              onChange={(difficulty) => update({ difficulty })}
              options={[
                { value: "", label: "None" },
                { value: "easy", label: "Easy" },
                { value: "medium", label: "Medium" },
                { value: "hard", label: "Hard" },
              ]}
            />
          </Field>
          <Field label="Marks" info="What a fully correct answer is worth.">
            <Stepper value={q.marks} onChange={(marks) => update({ marks })} min={1} max={100} label="Marks" />
          </Field>
        </div>

        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
