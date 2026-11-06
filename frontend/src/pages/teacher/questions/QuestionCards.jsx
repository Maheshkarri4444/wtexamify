import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, Database, EyeOff, Lock, Pencil, Save, Trash2 } from "lucide-react";
import { ContextSection } from "../../../components/exam/DataText";
import { DifficultyBadge, QuestionText } from "../../../components/exam/ExamBits";
import { Badge } from "../../../components/ui/Badge";
import { Button, IconButton } from "../../../components/ui/Button";
import { Card, CardHeader } from "../../../components/ui/Card";
import { Checkbox, Textarea } from "../../../components/ui/Form";
import { cn } from "../../../lib/cn";
import { teacherApi } from "../../../lib/api";
import { languageLabel, pluralize, testLabels } from "../../../lib/format";

function CardShell({ number, selected, onSelect, onEdit, onDelete, locked, badges, children }) {
  return (
    <div className={cn("group rounded-2xl border bg-surface p-4 shadow-card transition sm:p-5", selected ? "border-primary/50 ring-2 ring-primary/15" : "border-line hover:border-line-strong")}>
      <div className="flex items-start gap-3.5">
        {!locked && <Checkbox checked={selected} onChange={onSelect} label={`Select question ${number}`} className="mt-1" />}
        <span className="mt-0.5 w-8 shrink-0 text-sm font-semibold tabular-nums text-muted">Q{number}</span>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">{badges}</div>
          {children}
        </div>
        {!locked && (
          <div className="flex shrink-0 gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <IconButton icon={Pencil} label="Edit question" size="sm" onClick={onEdit} />
            <IconButton icon={Trash2} label="Delete question" size="sm" variant="danger-soft" onClick={onDelete} />
          </div>
        )}
      </div>
    </div>
  );
}

const SetBadge = ({ set }) => (set > 0 ? <Badge tone="info">Set {set}</Badge> : null);

export function DescriptiveCard({ question, ...props }) {
  return (
    <CardShell
      {...props}
      badges={
        <>
          <SetBadge set={question.set} />
          <DifficultyBadge difficulty={question.difficulty} />
          <Badge>{pluralize(question.marks, "mark")}</Badge>
        </>
      }
    >
      <QuestionText text={question.text} className="text-[15px] leading-relaxed text-ink" />
      {question.context && <ContextSection title="Tables and data" text={question.context} defaultOpen={false} className="mt-3" />}
    </CardShell>
  );
}

export function CodeCard({ question, ...props }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const tests = question.test_cases;
  const hidden = tests.filter((t) => t.hidden).length;
  const labels = testLabels(tests);
  return (
    <CardShell
      {...props}
      badges={
        <>
          <SetBadge set={question.set} />
          <Badge tone="primary">{languageLabel(question.language)}</Badge>
          <DifficultyBadge difficulty={question.difficulty} />
          <Badge>{pluralize(question.marks, "mark")}</Badge>
          <Badge tone={tests.length ? "info" : "neutral"}>
            {tests.length ? `${tests.length - hidden} public · ${hidden} private` : "No test cases"}
          </Badge>
        </>
      }
    >
      <QuestionText text={question.text} className="text-[15px] leading-relaxed text-ink" />
      {question.context && <ContextSection title="Tables and data for this question" text={question.context} defaultOpen={false} className="mt-3" />}
      {tests.length > 0 && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {tests.map((test, i) => (
            <div key={test.id} className="flex items-start gap-2 rounded-lg bg-subtle/70 px-2.5 py-1.5 text-[12.5px]">
              <span className="shrink-0 font-semibold text-muted">{labels[i].replace(" test", "")}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-ink-2" title={`${test.input} → ${test.output}`}>
                {test.input ? `${test.input.split("\n")[0]} → ` : ""}
                {test.output.split("\n").join(", ")}
              </span>
              {test.hidden && <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-label="Private: shown to a student only after their code fails it" />}
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setShowAnswer((v) => !v)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary-text hover:underline">
        <ChevronDown className={cn("h-3.5 w-3.5 transition", showAnswer && "rotate-180")} />
        {showAnswer ? "Hide your answer" : "Show your answer"}
      </button>
      {showAnswer && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-line bg-subtle/50 p-3 font-mono text-[12.5px] leading-relaxed text-ink">{question.solution}</pre>
      )}
    </CardShell>
  );
}

/** Tables, sample rows or notes that every code question can refer to. */
export function SharedContextCard({ exam, setBundle, owner = true }) {
  const locked = exam.content_locked || !owner;
  const [value, setValue] = useState(exam.context || "");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(Boolean(exam.context));
  useEffect(() => setValue(exam.context || ""), [exam.context]);
  const dirty = value !== (exam.context || "");

  const save = async () => {
    setSaving(true);
    try {
      setBundle(await teacherApi.update(exam.id, { context: value }));
      toast.success("Shared schema saved.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={Database}
        title="Shared schema and data" info="Tables, sample rows or notes that every code question can use. Students see it beside each question, and the AI gets it with every check. It locks once students start."
        description="Optional. Table definitions, sample rows or notes every question can refer to. Students see it next to the questions, and the AI uses it when checking their code."
        actions={
          <Button size="sm" variant="ghost" icon={ChevronDown} onClick={() => setOpen((v) => !v)} className={cn(open && "[&>svg]:rotate-180")}>
            {open ? "Hide" : exam.context ? "Show" : "Add"}
          </Button>
        }
      />
      {open && (
        <div className="space-y-3 p-5">
          <Textarea
            rows={9}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={locked}
            placeholder={"CREATE TABLE employees (id INT PRIMARY KEY, name VARCHAR(50), dept VARCHAR(20), salary INT);\nINSERT INTO employees VALUES (1, 'Ravi', 'CSE', 52000), (2, 'Sita', 'ECE', 48000);"}
            className="font-mono text-[12.5px]"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs text-muted">
              {locked ? (
                <>
                  <Lock className="h-3 w-3" /> {owner ? "Locked because students have started." : "Only the teacher who created this exam can change it."}
                </>
              ) : (
                `${value.length.toLocaleString("en-IN")} / 20,000 characters`
              )}
            </span>
            <Button size="sm" icon={Save} onClick={save} loading={saving} disabled={!dirty || locked}>
              Save schema
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
