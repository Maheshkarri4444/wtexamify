import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { ChevronDown, Layers3, Lock, Recycle, Save, Shuffle, SlidersHorizontal, Users } from "lucide-react";
import { DifficultyBadge, QuestionText } from "../../components/exam/ExamBits";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Meter } from "../../components/ui/Data";
import { Callout, EmptyState } from "../../components/ui/Feedback";
import { Stepper, Switch } from "../../components/ui/Form";
import { ConfirmModal, InfoTip } from "../../components/ui/Overlay";
import { cn } from "../../lib/cn";
import { teacherApi } from "../../lib/api";
import { DIFFICULTY, pluralize } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";

const same = (a, b) =>
  a.per_set === b.per_set && a.use_difficulty === b.use_difficulty && (!a.use_difficulty || (a.easy === b.easy && a.medium === b.medium && a.hard === b.hard));

// A sensible starting split when difficulty balancing is switched on: 40 / 40 / 20.
function defaultSplit(perSet) {
  const easy = Math.round(perSet * 0.4);
  const hard = Math.round(perSet * 0.2);
  return { easy, medium: Math.max(0, perSet - easy - hard), hard };
}

function SetCard({ set, questions, students, open, onToggle }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-subtle/50">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-sm font-bold text-primary-text">{set.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Set {set.number}</span>
          <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
            <span>{pluralize(set.question_ids.length, "question")}</span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {pluralize(students, "student")}
            </span>
          </span>
        </span>
        {set.reused_ids.length > 0 ? (
          <Badge tone="warning" icon={Recycle}>
            {set.reused_ids.length} reused
          </Badge>
        ) : (
          <Badge tone="success">All unique</Badge>
        )}
        <ChevronDown className={cn("h-4 w-4 text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <ol className="divide-y divide-line border-t border-line">
          {set.question_ids.map((id) => {
            const q = questions.get(id);
            if (!q) return null;
            return (
              <li key={id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-9 shrink-0 font-medium tabular-nums text-muted">Q{q.number}</span>
                <QuestionText text={q.text} className="min-w-0 flex-1 text-ink-2" />
                <span className="flex shrink-0 items-center gap-1.5">
                  {set.reused_ids.includes(id) && <Badge tone="warning">Reused</Badge>}
                  <DifficultyBadge difficulty={q.difficulty} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default function SetsTab() {
  const { bundle, setBundle } = useOutletContext();
  const { exam } = bundle;
  const locked = exam.content_locked;
  const [bp, setBp] = useState(exam.blueprint);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmShuffle, setConfirmShuffle] = useState(false);
  const [openSet, setOpenSet] = useState(null);

  useEffect(() => setBp(exam.blueprint), [exam.blueprint]);

  const dirty = !same(bp, exam.blueprint);
  const sum = bp.easy + bp.medium + bp.hard;
  const sumOk = !bp.use_difficulty || sum === bp.per_set;
  const debounced = useDebounced(bp, 300);

  useEffect(() => {
    if (same(debounced, exam.blueprint)) {
      setPreview(null);
      return undefined;
    }
    let cancelled = false;
    teacherApi
      .previewBlueprint(exam.id, debounced)
      .then(({ report }) => !cancelled && setPreview(report))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debounced, exam.id, exam.blueprint]);

  const report = dirty && preview ? preview : exam.report;
  const pools = useMemo(() => {
    const count = (d) => exam.questions.filter((q) => q.difficulty === d).length;
    const untagged = exam.questions.filter((q) => !q.difficulty).length;
    return { easy: count("easy"), medium: count("medium") + untagged, hard: count("hard"), untagged };
  }, [exam.questions]);
  const questions = useMemo(() => new Map(exam.questions.map((q, i) => [q.id, { ...q, number: i + 1 }])), [exam.questions]);
  const perSet = useMemo(() => {
    const counts = new Map();
    for (const a of exam.assignments) counts.set(a.set, (counts.get(a.set) || 0) + 1);
    return counts;
  }, [exam.assignments]);

  const save = async () => {
    setSaving(true);
    try {
      const next = await teacherApi.saveBlueprint(exam.id, bp);
      setBundle(next);
      toast.success(`Saved. ${pluralize(next.exam.sets.length, "set")} dealt to ${pluralize(next.exam.allowed_students.length, "student")}.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const reshuffle = async () => {
    setSaving(true);
    try {
      setBundle(await teacherApi.reshuffleSets(exam.id));
      toast.success("Sets reshuffled and dealt again.");
      setConfirmShuffle(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleDifficulty = (on) => setBp((current) => ({ ...current, use_difficulty: on, ...(on && current.easy + current.medium + current.hard !== current.per_set ? defaultSplit(current.per_set) : {}) }));

  return (
    <div className="space-y-6">
      {locked && (
        <Callout tone="info" icon={Lock}>
          Sets are locked because students have started. Each student keeps the set they were dealt.
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader icon={SlidersHorizontal} title="Blueprint" info="The recipe for every set: how many questions, and optionally how many of each difficulty. Examify makes as many sets as it takes to use every question at least once." description="What every set looks like. Examify works out how many sets your questions can make." />
          <div className="space-y-6 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-ink">
                  Questions per set
                  <InfoTip text="How many questions each student answers. With more questions than this, Examify makes several sets so neighbours get different papers." className="ml-1.5" />
                </div>
                <div className="text-[13px] text-muted">Every student answers this many.</div>
              </div>
              <Stepper
                value={bp.per_set}
                onChange={(per_set) => setBp((current) => ({ ...current, per_set, ...(current.use_difficulty ? defaultSplit(per_set) : {}) }))}
                min={1}
                max={200}
                disabled={locked}
                label="Questions per set"
              />
            </div>
            <div className="border-t border-line pt-5">
              <Switch
                checked={bp.use_difficulty}
                onChange={toggleDifficulty}
                disabled={locked}
                label="Balance by difficulty" info="Every set gets the same number of easy, medium and hard questions, so no set is easier than another."
                description="Give every set the same mix of easy, medium and hard questions. If a level runs short, its questions are reused across sets."
              />
            </div>
            {bp.use_difficulty && (
              <div className="space-y-3 rounded-xl border border-line bg-subtle/50 p-4">
                {["easy", "medium", "hard"].map((level) => (
                  <div key={level} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <DifficultyBadge difficulty={level} />
                      <span className="text-[13px] text-muted">
                        {pools[level]} in the bank{level === "medium" && pools.untagged ? ` (${pools.untagged} untagged)` : ""}
                      </span>
                    </div>
                    <Stepper value={bp[level]} onChange={(n) => setBp((current) => ({ ...current, [level]: n }))} min={0} max={bp.per_set} disabled={locked} label={`${DIFFICULTY[level].label} per set`} />
                  </div>
                ))}
                <div className={cn("flex items-center justify-between border-t border-line pt-3 text-[13px]", sumOk ? "text-muted" : "font-medium text-danger-text")}>
                  <span>
                    Easy + medium + hard
                    <InfoTip text="The three counts must add up to the questions per set. In the bank shows how many questions of each level you have; a level with too few is reused across sets." className="ml-1" />
                  </span>
                  <span className="tabular-nums">
                    {sum} of {bp.per_set}
                  </span>
                </div>
              </div>
            )}
            {!locked && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5">
                <Button variant="ghost" icon={Shuffle} onClick={() => setConfirmShuffle(true)} disabled={!exam.sets.length || dirty}>
                  Reshuffle sets
                </Button>
                <Button icon={Save} onClick={save} loading={saving} disabled={!dirty || !sumOk}>
                  {dirty ? "Save and rebuild sets" : "Saved"}
                </Button>
              </div>
            )}
          </div>
        </Card>

        <Card className={cn("overflow-hidden transition", dirty && "ring-2 ring-primary/25")}>
          <CardHeader icon={Layers3} title={dirty ? "Preview" : "Current sets"} info="The questions in each set. Students are dealt sets in email order, so students sitting side by side get different sets." description={dirty ? "Not saved yet. This is what saving would produce." : "Dealt to students in email order (roll-number order for college emails)."} />
          <div className="p-5">
            {report.ok ? (
              <>
                <div className="flex items-end gap-4">
                  <span className="text-6xl font-semibold tracking-tight text-ink">{report.set_count}</span>
                  <div className="pb-2">
                    <div className="text-sm font-medium text-ink">{report.set_count === 1 ? "set" : "sets"} of {bp.per_set}</div>
                    <div className="text-[13px] text-muted">
                      {report.fully_unique_sets} fully unique
                      {report.set_count - report.fully_unique_sets > 0 && ` · ${report.set_count - report.fully_unique_sets} topped up with reused questions`}
                    </div>
                  </div>
                </div>
                <div className="mt-6 space-y-4">
                  {report.buckets.map((b) => {
                    const slots = b.per_set * report.set_count;
                    const unique = slots - b.reused_slots;
                    return (
                      <div key={b.difficulty}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                          <span className="flex items-center gap-2">
                            {b.difficulty === "any" ? <span className="font-medium text-ink">All questions</span> : <DifficultyBadge difficulty={b.difficulty} />}
                            <span className="text-muted">
                              {b.pool} in bank · {b.per_set} per set
                            </span>
                          </span>
                          <span className={cn("tabular-nums", b.reused_slots ? "text-warning-text" : "text-muted")}>
                            {b.reused_slots ? `${b.reused_slots} reused` : "no reuse"}
                          </span>
                        </div>
                        <Meter value={slots ? (unique / slots) * 100 : 0} tone={b.reused_slots ? "warning" : "primary"} label={`${b.difficulty} slots filled with unique questions`} />
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState icon={Layers3} title="No sets yet" description={report.errors[0] || "Add questions to generate sets."} className="border-none bg-transparent py-6" />
            )}
            {report.ok && report.warnings.length > 0 && (
              <div className="mt-5 space-y-2">
                {report.warnings.map((warning) => (
                  <Callout key={warning} tone="warning">
                    {warning}
                  </Callout>
                ))}
              </div>
            )}
            {!report.ok && report.errors.length > 1 && (
              <div className="space-y-2">
                {report.errors.slice(1).map((error) => (
                  <Callout key={error} tone="danger">
                    {error}
                  </Callout>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {exam.sets.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Sets</h2>
            <span className="text-[13px] text-muted">
              {pluralize(exam.allowed_students.length, "student")} across {pluralize(exam.sets.length, "set")}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {exam.sets.map((set) => (
              <SetCard
                key={set.number}
                set={set}
                questions={questions}
                students={perSet.get(set.number) || 0}
                open={openSet === set.number}
                onToggle={() => setOpenSet(openSet === set.number ? null : set.number)}
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmShuffle}
        onClose={() => setConfirmShuffle(false)}
        onConfirm={reshuffle}
        loading={saving}
        icon={Shuffle}
        title="Reshuffle the sets?"
        description="The same questions are dealt into new random sets, and every student gets their set again."
        confirmLabel="Reshuffle"
      />
    </div>
  );
}
