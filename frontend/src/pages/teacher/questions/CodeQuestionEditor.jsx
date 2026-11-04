import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Check, CheckCircle2, Code2, Eye, EyeOff, Plus, Sparkles, Trash2, XCircle } from "lucide-react";
import CodeEditor from "../../../components/exam/CodeEditor";
import { Badge } from "../../../components/ui/Badge";
import { Button, IconButton } from "../../../components/ui/Button";
import { Meter } from "../../../components/ui/Data";
import { Callout } from "../../../components/ui/Feedback";
import { Field, Segmented, Select, Stepper, Switch, Textarea } from "../../../components/ui/Form";
import { InfoTip, Modal } from "../../../components/ui/Overlay";
import { cn } from "../../../lib/cn";
import { teacherApi } from "../../../lib/api";
import { LANGUAGES, MAX_PRIVATE_TESTS, MAX_PUBLIC_TESTS, scoreTone, testLabels } from "../../../lib/format";

const BLANK = { type: "code", text: "", language: "sql", solution: "", starter_code: "", difficulty: "", marks: 10 };
const blankTest = (hidden) => ({ input: "", output: "", hidden });
const filled = (t) => t.input.trim() !== "" || t.output.trim() !== "";

// The form keeps the two public slots and the private list apart; they're
// joined (public first) only when saving.
function fromQuestion(question) {
  const tests = question?.test_cases || [];
  const shown = tests.filter((t) => !t.hidden).map((t) => ({ ...t }));
  while (shown.length < MAX_PUBLIC_TESTS) shown.push(blankTest(false));
  return { ...BLANK, ...question, public_tests: shown, private_tests: tests.filter((t) => t.hidden).map((t) => ({ ...t })) };
}

function validate(q) {
  if (!q.text.trim()) return "Write the question.";
  if (!q.solution.trim()) return "Add your answer: the AI compares each student's code with it.";
  for (const [list, kind] of [
    [q.public_tests, "Public"],
    [q.private_tests, "Private"],
  ]) {
    const broken = list.findIndex((t) => filled(t) && !t.output.trim());
    if (broken >= 0) return `${kind} test ${broken + 1} needs an expected output.`;
  }
  return "";
}

function clean(q) {
  return {
    type: "code",
    text: q.text.trim(),
    language: q.language,
    solution: q.solution,
    starter_code: q.starter_code,
    difficulty: q.difficulty,
    marks: q.marks,
    test_cases: [...q.public_tests, ...q.private_tests].filter(filled).map(({ input, output, hidden }) => ({ input, output, hidden })),
  };
}

const TEST_BOX =
  "w-full resize-y rounded-lg border border-line bg-subtle/40 px-3 py-2 font-mono text-[12.5px] text-ink placeholder:font-sans placeholder:text-muted/70 focus:border-primary/60 focus:outline-none";

function TestRow({ label, test, language, onChange, onRemove }) {
  return (
    <div className={cn("rounded-xl border p-3", test.hidden ? "border-dashed border-line-strong bg-subtle/40" : "border-line bg-surface")}>
      <div className="mb-2 flex items-center gap-2">
        {test.hidden ? <EyeOff className="h-3.5 w-3.5 text-muted" /> : <Eye className="h-3.5 w-3.5 text-muted" />}
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        {onRemove && <IconButton icon={Trash2} label={`Remove ${label.toLowerCase()}`} size="xs" variant="danger-soft" className="ml-auto" onClick={onRemove} />}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <textarea
          aria-label={`${label} input`}
          value={test.input}
          onChange={(e) => onChange({ input: e.target.value })}
          rows={3}
          placeholder={language === "sql" ? "Input (optional): e.g. the employees table, or extra rows" : "Input, e.g. 1234"}
          className={TEST_BOX}
        />
        <textarea aria-label={`${label} expected output`} value={test.output} onChange={(e) => onChange({ output: e.target.value })} rows={3} placeholder="Expected output" className={TEST_BOX} />
      </div>
    </div>
  );
}

export default function CodeQuestionEditor({ open, onClose, question, onSave, saving, examId }) {
  const editing = Boolean(question);
  const [q, setQ] = useState(() => fromQuestion(question));
  const [error, setError] = useState("");
  const [showStarter, setShowStarter] = useState(false);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    if (open) {
      const next = fromQuestion(question);
      setQ(next);
      setShowStarter(Boolean(next.starter_code));
      setError("");
      setCheck(null);
    }
  }, [open, question]);

  const update = (patch) => {
    setQ((current) => ({ ...current, ...patch }));
    setError("");
    setCheck(null);
  };
  const setTest = (group, i, patch) => update({ [group]: q[group].map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const submit = async (another) => {
    const problem = validate(q);
    if (problem) {
      setError(problem);
      return;
    }
    const ok = await onSave(clean(q), another);
    if (ok && another) {
      setQ((current) => ({ ...fromQuestion(null), language: current.language, difficulty: current.difficulty, marks: current.marks }));
      setShowStarter(false);
      setCheck(null);
      textRef.current?.focus();
    }
  };

  const runCheck = async () => {
    const problem = validate(q);
    if (problem) {
      setError(problem);
      return;
    }
    setChecking(true);
    try {
      setCheck(await teacherApi.checkQuestion(examId, clean(q)));
    } catch (err) {
      toast.error(err.message, { duration: 6000 });
    } finally {
      setChecking(false);
    }
  };

  const editorLanguage = q.language === "any" ? "python" : q.language;
  const checkLabels = testLabels(clean(q).test_cases);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={Code2}
      title={editing ? "Edit code question" : "Add a code question"}
      description="Students write their answer in an editor. When they press Run, AI dry-runs it against your test cases and your answer. Nothing is compiled."
      footer={
        <>
          <Button variant="ghost" icon={Sparkles} onClick={runCheck} loading={checking} className="mr-auto">
            Check my answer with AI
          </Button>
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
        <Field label="Question" info="What the student has to write: a query, a program or a function.">
          {(id) => (
            <Textarea
              id={id}
              ref={textRef}
              autoFocus
              rows={3}
              value={q.text}
              onChange={(e) => update({ text: e.target.value })}
              placeholder="Write a query to list the names of employees in the CSE department who earn more than 50000, highest salary first."
            />
          )}
        </Field>

        <div className="flex flex-wrap items-end gap-6">
          <Field label="Language" info="The language students answer in. Pick Any language to let each student choose their own." className="w-56">
            {(id) => (
              <Select id={id} value={q.language} onChange={(e) => update({ language: e.target.value })}>
                {Object.entries(LANGUAGES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                <option value="any">Any language (student picks)</option>
              </Select>
            )}
          </Field>
          <Field label="Difficulty" info="Used when the blueprint balances sets by difficulty.">
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
          <Field label="Marks" info="A student earns these marks times the AI's correctness: 80% correct earns 80% of the marks.">
            <Stepper value={q.marks} onChange={(marks) => update({ marks })} min={1} max={100} label="Marks" />
          </Field>
        </div>

        <Field label="Your answer" info="Your reference answer. The AI compares each student's code with it, so any correct approach can score full marks." hint="Students never see this. Any correct approach counts, so this is a reference, not the only right answer.">
          <CodeEditor value={q.solution} onChange={(solution) => update({ solution })} language={editorLanguage} minHeight="140px" maxHeight="320px" placeholder="SELECT name FROM employees WHERE …" />
        </Field>

        <div className="rounded-xl border border-line p-4">
          <Switch checked={showStarter} onChange={setShowStarter} label="Give students starter code" info="Code the editor starts with, like a function signature or the input-reading lines." description="The editor starts with this, for example a function signature or the input-reading lines." />
          {showStarter && (
            <CodeEditor
              value={q.starter_code}
              onChange={(starter_code) => update({ starter_code })}
              language={editorLanguage}
              minHeight="90px"
              maxHeight="200px"
              className="mt-3"
            />
          )}
        </div>

        <section>
          <div className="mb-2">
            <div className="flex items-center gap-1 text-[13px] font-medium text-ink-2">
              Public test cases
              <InfoTip text="Students see these next to the question: the input and the expected output. When they press Run, they find out whether their code would pass each one." />
            </div>
            <p className="text-xs text-muted">Up to {MAX_PUBLIC_TESTS}, shown to students. Leave both empty if this question has no test cases: the AI then compares the code with your answer.</p>
          </div>
          <div className="grid gap-2.5">
            {q.public_tests.map((test, i) => (
              <TestRow key={i} label={`Public test ${i + 1}`} test={test} language={q.language} onChange={(patch) => setTest("public_tests", i, patch)} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1 text-[13px] font-medium text-ink-2">
                Private test cases
                <span className="font-normal tabular-nums text-muted">
                  {q.private_tests.length} of {MAX_PRIVATE_TESTS}
                </span>
                <InfoTip text="Run together with the public tests every time. Students only see how many passed. When their code fails a private test, they're shown that test's input and expected output, like LeetCode." />
              </div>
              <p className="text-xs text-muted">Catch answers that only work for the public examples. Students see one only after their code fails it.</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              disabled={q.private_tests.length >= MAX_PRIVATE_TESTS}
              onClick={() => update({ private_tests: [...q.private_tests, blankTest(true)] })}
            >
              Add private test
            </Button>
          </div>
          {q.private_tests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-center text-[13px] text-muted">No private tests yet.</div>
          ) : (
            <div className="space-y-2.5">
              {q.private_tests.map((test, i) => (
                <TestRow
                  key={i}
                  label={`Private test ${i + 1}`}
                  test={test}
                  language={q.language}
                  onChange={(patch) => setTest("private_tests", i, patch)}
                  onRemove={() => update({ private_tests: q.private_tests.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
          )}
        </section>

        {check && (
          <div className="rounded-xl border border-line bg-subtle/50 p-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-primary-text" />
              <span className="text-sm font-semibold text-ink">Your answer scored {check.percent}%</span>
              <Meter value={check.percent} tone={scoreTone(check.percent)} className="max-w-[10rem] flex-1" label="Your answer's AI score" />
            </div>
            {check.tests.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {check.tests.map((t, i) => (
                  <Badge key={t.id} tone={t.executes ? "success" : "danger"} icon={t.executes ? CheckCircle2 : XCircle}>
                    {checkLabels[i]}: {t.executes ? "passes" : "fails"}
                  </Badge>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              {check.percent >= 90 && check.tests.every((t) => t.executes)
                ? "Looks consistent. Students who write an equivalent answer should score the same."
                : "Your own answer should score close to 100% with every test executing. If it doesn't, fix the test case or the question wording before the exam."}
            </p>
          </div>
        )}

        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
