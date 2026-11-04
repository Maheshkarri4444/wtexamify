import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Field, Input, Stepper } from "../../components/ui/Form";
import { Modal } from "../../components/ui/Overlay";
import { cn } from "../../lib/cn";
import { teacherApi } from "../../lib/api";
import { EXAM_TYPES } from "../../lib/examTypes";

const DURATIONS = { viva: [10, 15, 20, 30], internal: [45, 60, 90, 120], external: [60, 90, 120, 180] };

const PLACEHOLDERS = {
  viva: "e.g. COA viva · Unit 2 · N22 batch",
  internal: "e.g. DBMS lab internal · Cycle 1",
  external: "e.g. DBMS lab external · N22 batch",
};

export default function CreateExamModal({ open, onClose }) {
  const navigate = useNavigate();
  const [type, setType] = useState(null);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(15);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType(null);
      setTitle("");
    }
  }, [open]);

  const choose = (key) => {
    setType(key);
    setDuration(EXAM_TYPES[key].duration);
  };

  const create = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const { exam } = await teacherApi.create({ type, title: title.trim(), duration_minutes: duration });
      toast.success(`${EXAM_TYPES[type].label} created. Add your questions next.`);
      onClose();
      navigate(`/teacher/exams/${exam.id}/questions`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const meta = type ? EXAM_TYPES[type] : null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={Sparkles}
      title={meta ? `Name your ${meta.label.toLowerCase()}` : "Create an exam"}
      description={meta ? "You can change all of this later." : "Pick the kind of exam."}
    >
      {!meta ? (
        <div className="grid gap-3 pt-1 sm:grid-cols-3">
          {Object.entries(EXAM_TYPES).map(([key, option]) => (
            <button
              key={key}
              type="button"
              onClick={() => choose(key)}
              className="group relative flex flex-col rounded-2xl border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-sm">
                <option.icon className="h-5 w-5" />
              </span>
              <span className="mt-4 font-semibold text-ink">{option.label}</span>
              <span className="mt-1 text-[13px] leading-snug text-muted">{option.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={create} className="space-y-5 pt-1">
          <Field label="Exam name">
            {(id) => <Input id={id} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={PLACEHOLDERS[type]} />}
          </Field>
          <Field label="Duration" hint="Each student gets this long from the moment they start.">
            <div className="flex flex-wrap items-center gap-2">
              {DURATIONS[type].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setDuration(minutes)}
                  className={cn(
                    "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium transition",
                    duration === minutes ? "border-primary bg-primary-soft text-primary-text" : "border-line bg-surface text-ink-2 hover:border-line-strong"
                  )}
                >
                  {duration === minutes && <Check className="h-3.5 w-3.5" />}
                  {minutes} min
                </button>
              ))}
              <Stepper value={duration} onChange={setDuration} min={1} max={600} label="Minutes" />
            </div>
          </Field>
          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setType(null)}>
              Back
            </Button>
            <Button type="submit" loading={saving} disabled={!title.trim()}>
              Create {meta.label.toLowerCase()}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
