import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { Check, Download, FileQuestion, FileSpreadsheet, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { DifficultyBadge, QuestionText, QuestionTypeBadge } from "../../components/exam/ExamBits";
import { Badge } from "../../components/ui/Badge";
import { Button, IconButton } from "../../components/ui/Button";
import { Callout, EmptyState } from "../../components/ui/Feedback";
import { Checkbox, Input, Select } from "../../components/ui/Form";
import { ConfirmModal, Menu } from "../../components/ui/Overlay";
import { cn } from "../../lib/cn";
import { teacherApi } from "../../lib/api";
import { downloadQuestionTemplate } from "../../lib/excel";
import { QUESTION_TYPES, letter, pluralize } from "../../lib/format";
import ImportQuestionsModal from "./questions/ImportQuestionsModal";
import QuestionEditor from "./questions/QuestionEditor";

function TemplateMenu() {
  return (
    <Menu
      width="w-60"
      trigger={({ toggle }) => (
        <Button variant="secondary" icon={Download} onClick={toggle}>
          Template
        </Button>
      )}
      items={[
        { heading: "Download an Excel template" },
        { label: "All types in one file", onSelect: () => downloadQuestionTemplate("mixed") },
        { label: QUESTION_TYPES.mcq_single.label, onSelect: () => downloadQuestionTemplate("mcq_single") },
        { label: QUESTION_TYPES.mcq_multi.label, onSelect: () => downloadQuestionTemplate("mcq_multi") },
        { label: QUESTION_TYPES.fill.label, onSelect: () => downloadQuestionTemplate("fill") },
      ]}
    />
  );
}

function QuestionCard({ question, number, selected, onSelect, onEdit, onDelete, locked }) {
  return (
    <div className={cn("group rounded-2xl border bg-surface p-4 shadow-card transition sm:p-5", selected ? "border-primary/50 ring-2 ring-primary/15" : "border-line hover:border-line-strong")}>
      <div className="flex items-start gap-3.5">
        {!locked && <Checkbox checked={selected} onChange={onSelect} label={`Select question ${number}`} className="mt-1" />}
        <span className="mt-0.5 w-8 shrink-0 text-sm font-semibold tabular-nums text-muted">Q{number}</span>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <QuestionTypeBadge type={question.type} />
            <DifficultyBadge difficulty={question.difficulty} />
            <Badge>{pluralize(question.marks, "mark")}</Badge>
          </div>
          <QuestionText text={question.text} className="text-[15px] leading-relaxed text-ink" />
          {question.type === "fill" ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">Accepted</span>
              {question.answers.map((answer) => (
                <span key={answer} className="rounded-md bg-success-soft px-2 py-0.5 text-[13px] font-medium text-success-text">
                  {answer}
                </span>
              ))}
            </div>
          ) : (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {question.options.map((option, i) => {
                const correct = question.correct.includes(i);
                return (
                  <li key={i} className={cn("flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[13px]", correct ? "bg-success-soft text-success-text" : "bg-subtle/70 text-ink-2")}>
                    <span className="font-semibold">{letter(i)}.</span>
                    <span className="min-w-0 flex-1 break-words">{option}</span>
                    {correct && (
                      <span className="flex items-center gap-0.5 text-xs font-medium">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        Correct
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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

export default function QuestionsTab() {
  const { bundle, setBundle } = useOutletContext();
  const { exam } = bundle;
  const locked = exam.content_locked;
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [editor, setEditor] = useState(null); // { question } for edit, {} for new
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(null); // array of ids
  const [busy, setBusy] = useState(false);

  const numbered = useMemo(() => exam.questions.map((q, i) => ({ ...q, number: i + 1 })), [exam.questions]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return numbered.filter(
      (item) =>
        (!type || item.type === type) &&
        (!difficulty || (difficulty === "none" ? !item.difficulty : item.difficulty === difficulty)) &&
        (!q || item.text.toLowerCase().includes(q) || item.options.some((o) => o.toLowerCase().includes(q)) || item.answers.some((a) => a.toLowerCase().includes(q)))
    );
  }, [numbered, query, type, difficulty]);

  const counts = useMemo(() => {
    const by = (key, value) => exam.questions.filter((q) => q[key] === value).length;
    return {
      mcq_single: by("type", "mcq_single"),
      mcq_multi: by("type", "mcq_multi"),
      fill: by("type", "fill"),
      easy: by("difficulty", "easy"),
      medium: by("difficulty", "medium"),
      hard: by("difficulty", "hard"),
      untagged: by("difficulty", ""),
    };
  }, [exam.questions]);

  const save = async (question, another) => {
    setBusy(true);
    try {
      if (editor?.question) {
        setBundle(await teacherApi.updateQuestion(exam.id, editor.question.id, question));
        toast.success("Question saved.");
      } else {
        setBundle(await teacherApi.addQuestions(exam.id, [question]));
        toast.success("Question added.");
      }
      if (!another) setEditor(null);
      return true;
    } catch (error) {
      toast.error(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const importQuestions = async (questions) => {
    try {
      const next = await teacherApi.addQuestions(exam.id, questions);
      setBundle(next);
      toast.success(`Imported ${pluralize(next.added, "question")}. Sets were rebuilt.`);
      return true;
    } catch (error) {
      toast.error(error.message, { duration: 6000 });
      return false;
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const next = await teacherApi.deleteQuestions(exam.id, deleting);
      setBundle(next);
      setSelected(new Set());
      toast.success(`Deleted ${pluralize(next.deleted, "question")}.`);
      setDeleting(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id, on) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((q) => selected.has(q.id));

  if (!exam.questions.length) {
    return (
      <>
        <EmptyState
          icon={FileQuestion}
          title="Build your question bank"
          description="Add questions one by one, or import a whole spreadsheet. Mix single-correct, multiple-correct and fill-in-the-blank questions; Examify deals them into sets for you."
        >
          <Button icon={Plus} onClick={() => setEditor({})} disabled={locked}>
            Add question
          </Button>
          <Button variant="secondary" icon={FileSpreadsheet} onClick={() => setImporting(true)} disabled={locked}>
            Import from Excel
          </Button>
          <TemplateMenu />
        </EmptyState>
        <QuestionEditor open={Boolean(editor)} question={editor?.question} onClose={() => setEditor(null)} onSave={save} saving={busy} />
        <ImportQuestionsModal open={importing} onClose={() => setImporting(false)} existingTexts={[]} onImport={importQuestions} />
      </>
    );
  }

  return (
    <div className="space-y-5">
      {locked && (
        <Callout tone="info" icon={Lock}>
          Questions are read-only because students have started. Duplicate the exam to make a changed copy.
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions, options and answers" className="pl-9" />
        </div>
        <div className="w-44">
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
            <option value="">All types</option>
            {Object.entries(QUESTION_TYPES).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Filter by difficulty">
            <option value="">Any difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="none">No difficulty</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <TemplateMenu />
          <Button variant="secondary" icon={FileSpreadsheet} onClick={() => setImporting(true)} disabled={locked}>
            Import
          </Button>
          <Button icon={Plus} onClick={() => setEditor({})} disabled={locked}>
            Add question
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
        <span className="font-semibold text-ink">{pluralize(exam.questions.length, "question")}</span>
        <span>{counts.mcq_single} single</span>
        <span>{counts.mcq_multi} multiple</span>
        <span>{counts.fill} fill in the blank</span>
        <span className="hidden h-4 w-px bg-line sm:block" />
        <span>{counts.easy} easy</span>
        <span>{counts.medium} medium</span>
        <span>{counts.hard} hard</span>
        {counts.untagged > 0 && <span>{counts.untagged} without difficulty</span>}
      </div>

      {!locked && (
        <div className="flex min-h-[2rem] items-center gap-3 px-1">
          <Checkbox
            checked={allVisibleSelected}
            indeterminate={!allVisibleSelected && visible.some((q) => selected.has(q.id))}
            onChange={(on) => setSelected(on ? new Set(visible.map((q) => q.id)) : new Set())}
            label="Select all shown"
          />
          <span className="text-[13px] text-muted">{selected.size ? `${selected.size} selected` : `Showing ${visible.length}`}</span>
          {selected.size > 0 && (
            <Button size="sm" variant="danger-soft" icon={Trash2} onClick={() => setDeleting([...selected])}>
              Delete selected
            </Button>
          )}
        </div>
      )}

      {visible.length ? (
        <div className="space-y-3">
          {visible.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              number={question.number}
              locked={locked}
              selected={selected.has(question.id)}
              onSelect={(on) => toggle(question.id, on)}
              onEdit={() => setEditor({ question })}
              onDelete={() => setDeleting([question.id])}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={Search} title="No questions match" description="Try another search or filter." />
      )}

      <QuestionEditor open={Boolean(editor)} question={editor?.question} onClose={() => setEditor(null)} onSave={save} saving={busy} />
      <ImportQuestionsModal open={importing} onClose={() => setImporting(false)} existingTexts={exam.questions.map((q) => q.text)} onImport={importQuestions} />
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        tone="danger"
        icon={Trash2}
        title={deleting?.length > 1 ? `Delete ${deleting.length} questions?` : "Delete this question?"}
        description="Sets are rebuilt and re-dealt to students straight away."
        confirmLabel="Delete"
      />
    </div>
  );
}
