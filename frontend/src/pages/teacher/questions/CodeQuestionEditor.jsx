import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Check, CheckCircle2, Code2, EyeOff, Plus, Sparkles, Trash2, XCircle } from "lucide-react";
import CodeEditor from "../../../components/exam/CodeEditor";
import { Badge } from "../../../components/ui/Badge";
import { Button, IconButton } from "../../../components/ui/Button";
import { Meter } from "../../../components/ui/Data";
import { Callout } from "../../../components/ui/Feedback";
import { Field, Segmented, Select, Stepper, Switch, Textarea } from "../../../components/ui/Form";
import { Modal } from "../../../components/ui/Overlay";
import { cn } from "../../../lib/cn";
import { teacherApi } from "../../../lib/api";
import { LANGUAGES, scoreTone } from "../../../lib/format";

const MAX_TESTS = 10;
const BLANK = { type: "code", text: "", language: "sql", solution: "", starter_code: "", test_cases: [], difficulty: "", marks: 10 };

function fromQuestion(question) {
  if (!question) return { ...BLANK, test_cases: [] };
  return { ...BLANK, ...question, test_cases: (question.test_cases || []).map((t) => ({ ...t })) };
}

function validate(q) {
  if (!q.text.trim()) return "Write the question.";
  if (!q.solution.trim()) return "Add your answer: the AI compares each student's code with it.";
  const broken = q.test_cases.findIndex((t) => t.input.trim() && !t.output.trim());
  if (broken >= 0) return `Test ${broken + 1} needs an expected output.`;
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
    test_cases: q.test_cases.filter((t) => t.input.trim() || t.output.trim()).map(({ input, output, hidden }) => ({ input, output, hidden })),
  };
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
  const setTest = (i, patch) => update({ test_cases: q.test_cases.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const submit = async (another) => {
    const problem = validate(q);
    if (problem) {
      setError(problem);
      return;
    }
    const ok = await onSave(clean(q), another);
    if (ok && another) {
      setQ((current) => ({ ...BLANK, test_cases: [], language: current.language, difficulty: current.difficulty, marks: current.marks }));
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
        <Field label="Question">
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
          <Field label="Language" className="w-56">
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
          <Field label="Difficulty">
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
          <Field label="Marks">
            <Stepper value={q.marks} onChange={(marks) => update({ marks })} min={1} max={100} label="Marks" />
          </Field>
        </div>

        <Field label="Your answer" hint="Students never see this. Any correct approach counts, so this is a reference, not the only right answer.">
          <CodeEditor value={q.solution} onChange={(solution) => update({ solution })} language={editorLanguage} minHeight="140px" maxHeight="320px" placeholder="SELECT name FROM employees WHERE …" />
        </Field>

        <div className="rounded-xl border border-line p-4">
          <Switch checked={showStarter} onChange={setShowStarter} label="Give students starter code" description="The editor starts with this, for example a function signature or the input-reading lines." />
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

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-ink-2">Test cases</div>
              <p className="text-xs text-muted">Optional. Students see whether their code would execute each one. With none, the AI only compares the code with your answer.</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              disabled={q.test_cases.length >= MAX_TESTS}
              onClick={() => update({ test_cases: [...q.test_cases, { input: "", output: "", hidden: false }] })}
            >
              Add test case
            </Button>
          </div>
          {q.test_cases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-muted">No test cases. The AI will compare students' code with your answer.</div>
          ) : (
            <div className="space-y-2.5">
              {q.test_cases.map((test, i) => (
                <div key={i} className={cn("rounded-xl border p-3", test.hidden ? "border-dashed border-line-strong bg-subtle/40" : "border-line bg-surface")}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">Test {i + 1}</span>
                    {test.hidden && (
                      <Badge icon={EyeOff} tone="neutral">
                        Hidden from students
                      </Badge>
                    )}
                    <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted">
                      <input type="checkbox" checked={test.hidden} onChange={(e) => setTest(i, { hidden: e.target.checked })} className="h-3.5 w-3.5 accent-[rgb(var(--primary))]" />
                      Hide input and output
                    </label>
                    <IconButton icon={Trash2} label={`Remove test ${i + 1}`} size="xs" variant="danger-soft" onClick={() => update({ test_cases: q.test_cases.filter((_, j) => j !== i) })} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <textarea
                      value={test.input}
                      onChange={(e) => setTest(i, { input: e.target.value })}
                      rows={3}
                      placeholder={q.language === "sql" ? "Input (optional): e.g. the employees table, or extra rows" : "Input, e.g. 1234"}
                      className="w-full resize-y rounded-lg border border-line bg-subtle/40 px-3 py-2 font-mono text-[12.5px] text-ink placeholder:font-sans placeholder:text-muted/70 focus:border-primary/60 focus:outline-none"
                    />
                    <textarea
                      value={test.output}
                      onChange={(e) => setTest(i, { output: e.target.value })}
                      rows={3}
                      placeholder="Expected output"
                      className="w-full resize-y rounded-lg border border-line bg-subtle/40 px-3 py-2 font-mono text-[12.5px] text-ink placeholder:font-sans placeholder:text-muted/70 focus:border-primary/60 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
                    Test {i + 1}: {t.executes ? "will execute" : "won't execute"}
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
