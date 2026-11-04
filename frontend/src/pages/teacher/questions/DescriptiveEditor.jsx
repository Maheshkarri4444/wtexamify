import { useEffect, useRef, useState } from "react";
import { Check, PenLine } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Callout } from "../../../components/ui/Feedback";
import { Field, Segmented, Stepper, Textarea } from "../../../components/ui/Form";
import { Modal } from "../../../components/ui/Overlay";

const BLANK = { type: "descriptive", text: "", difficulty: "", marks: 10 };

/** Internal questions are only read by students, so a question is just its text. */
export default function DescriptiveEditor({ open, onClose, question, onSave, saving }) {
  const editing = Boolean(question);
  const [q, setQ] = useState(BLANK);
  const [error, setError] = useState("");
  const textRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ(question ? { ...BLANK, ...question } : BLANK);
      setError("");
    }
  }, [open, question]);

  const submit = async (another) => {
    if (!q.text.trim()) {
      setError("Write the question.");
      return;
    }
    const ok = await onSave({ type: "descriptive", text: q.text.trim(), difficulty: q.difficulty, marks: q.marks }, another);
    if (ok && another) {
      setQ((current) => ({ ...BLANK, difficulty: current.difficulty, marks: current.marks }));
      textRef.current?.focus();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={PenLine}
      title={editing ? "Edit question" : "Add a question"}
      description="Students read this on their paper and write the answer on their lab system or on paper."
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
        <Field label="Question" info="The question as students will read it on their paper.">
          {(id) => (
            <Textarea
              id={id}
              ref={textRef}
              autoFocus
              rows={5}
              value={q.text}
              onChange={(e) => {
                setQ({ ...q, text: e.target.value });
                setError("");
              }}
              placeholder="Create a table EMPLOYEE(id, name, dept, salary), insert five rows and display the employees of the CSE department."
            />
          )}
        </Field>
        <div className="flex flex-wrap items-end gap-6">
          <Field label="Difficulty" info="Used when the blueprint balances sets by difficulty.">
            <Segmented
              value={q.difficulty}
              onChange={(difficulty) => setQ({ ...q, difficulty })}
              options={[
                { value: "", label: "None" },
                { value: "easy", label: "Easy" },
                { value: "medium", label: "Medium" },
                { value: "hard", label: "Hard" },
              ]}
            />
          </Field>
          <Field label="Marks" info="Printed on the paper. Internals aren't marked in Examify." hint="Shown on the paper.">
            <Stepper value={q.marks} onChange={(marks) => setQ({ ...q, marks })} min={1} max={100} label="Marks" />
          </Field>
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
