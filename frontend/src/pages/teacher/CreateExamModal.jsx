import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Check, Lock, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field, Input, Stepper } from "../../components/ui/Form";
import { Modal } from "../../components/ui/Overlay";
import { cn } from "../../lib/cn";
import { teacherApi } from "../../lib/api";
import { EXAM_TYPES } from "../../lib/examTypes";

const DURATIONS = [10, 15, 20, 30, 45];

export default function CreateExamModal({ open, onClose }) {
  const navigate = useNavigate();
  const [step, setStep] = useState("type");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(15);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("type");
      setTitle("");
      setDuration(15);
    }
  }, [open]);

  const create = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const { exam } = await teacherApi.create({ type: "viva", title: title.trim(), duration_minutes: duration });
      toast.success("Viva created. Add your questions next.");
      onClose();
      navigate(`/teacher/exams/${exam.id}/questions`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={Sparkles}
      title={step === "type" ? "Create an exam" : "Name your viva"}
      description={step === "type" ? "Pick the kind of exam. Viva is ready today; internal and external are being rebuilt." : "You can change all of this later."}
    >
      {step === "type" ? (
        <div className="grid gap-3 pt-1 sm:grid-cols-3">
          {Object.entries(EXAM_TYPES).map(([key, type]) => (
            <button
              key={key}
              type="button"
              disabled={!type.available}
              onClick={() => setStep("details")}
              className={cn(
                "group relative flex flex-col rounded-2xl border p-4 text-left transition",
                type.available
                  ? "border-line bg-surface hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  : "cursor-not-allowed border-dashed border-line-strong bg-subtle/60"
              )}
            >
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  type.available ? "bg-gradient-to-br from-primary to-violet-500 text-white shadow-sm" : "bg-surface text-muted ring-1 ring-line"
                )}
              >
                <type.icon className="h-5 w-5" />
              </span>
              <span className="mt-4 flex items-center gap-2">
                <span className={cn("font-semibold", type.available ? "text-ink" : "text-muted")}>{type.label}</span>
                {!type.available && (
                  <Badge icon={Lock} className="text-[11px]">
                    Coming soon
                  </Badge>
                )}
              </span>
              <span className="mt-1 text-[13px] leading-snug text-muted">{type.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={create} className="space-y-5 pt-1">
          <Field label="Exam name">
            {(id) => (
              <Input id={id} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. COA viva · Unit 2 · N22 batch" />
            )}
          </Field>
          <Field label="Duration" hint="Each student gets this long from the moment they start.">
            <div className="flex flex-wrap items-center gap-2">
              {DURATIONS.map((minutes) => (
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
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep("type")}>
              Back
            </Button>
            <Button type="submit" loading={saving} disabled={!title.trim()}>
              Create viva
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
