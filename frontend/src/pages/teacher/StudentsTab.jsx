import { useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { CheckCircle2, CircleDashed, FileSpreadsheet, PencilLine, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button, IconButton } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/Feedback";
import { Checkbox, Input, Textarea } from "../../components/ui/Form";
import { ConfirmModal, InfoTip, Modal } from "../../components/ui/Overlay";
import { teacherApi } from "../../lib/api";
import { extractStudents, parseStudentFile } from "../../lib/excel";
import { pluralize, rollFromEmail } from "../../lib/format";
import { usePolling } from "../../lib/hooks";

const STATUS = {
  not_started: { label: "Not started", tone: "neutral", icon: CircleDashed },
  in_progress: { label: "Writing", tone: "info", icon: PencilLine },
  submitted: { label: "Submitted", tone: "success", icon: CheckCircle2 },
};

export default function StudentsTab() {
  const { bundle, setBundle } = useOutletContext();
  const { exam } = bundle;
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [pendingFile, setPendingFile] = useState(null); // { name, valid, invalid }
  const [removing, setRemoving] = useState(null); // emails, or "all"
  const [statuses, setStatuses] = useState({});
  const fileRef = useRef(null);

  usePolling(() => {
    teacherApi
      .monitor(exam.id)
      .then(({ rows }) => setStatuses(Object.fromEntries(rows.map((r) => [r.email, r.status]))))
      .catch(() => {});
  }, 20000);

  const sets = useMemo(() => new Map(exam.assignments.map((a) => [a.email, a.set])), [exam.assignments]);
  const preview = useMemo(() => extractStudents(text), [text]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exam.allowed_students.filter((email) => !q || email.includes(q));
  }, [exam.allowed_students, query]);

  const add = async (emails, clear) => {
    setBusy(true);
    try {
      const next = await teacherApi.addStudents(exam.id, emails);
      setBundle(next);
      const parts = [`Added ${pluralize(next.added, "student")}`];
      if (next.already) parts.push(`${next.already} already on the list`);
      toast.success(`${parts.join(" · ")}.`);
      if (next.invalid?.length) toast.error(`Skipped ${pluralize(next.invalid.length, "entry", "entries")} that aren't email addresses.`);
      clear?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file) => {
    if (!file) return;
    try {
      const { valid, invalid } = await parseStudentFile(file);
      if (!valid.length) {
        toast.error(invalid.length ? `No email addresses in that file, only ${invalid.slice(0, 2).join(", ")}${invalid.length > 2 ? "…" : ""}. Add the students' full emails.` : "No email addresses found in that file.");
        return;
      }
      setPendingFile({ name: file.name, valid, invalid });
    } catch {
      toast.error("Couldn't read that file. Save it as .xlsx or .csv and try again.");
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const next = removing === "all" ? await teacherApi.removeStudents(exam.id, [], true) : await teacherApi.removeStudents(exam.id, removing);
      setBundle(next);
      setSelected(new Set());
      toast.success(`Removed ${pluralize(next.removed, "student")}.`);
      if (next.kept?.length) toast(`${pluralize(next.kept.length, "student")} already started, so they stay.`, { icon: "ℹ️" });
      setRemoving(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (email, on) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(email);
      else next.delete(email);
      return next;
    });

  const setCounts = useMemo(() => {
    const counts = new Map();
    for (const a of exam.assignments) counts.set(a.set, (counts.get(a.set) || 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [exam.assignments]);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader icon={UserPlus} title="Add students" info="Only students on this list can see and write this exam. Add each student's full email, the one they sign in with." description="Only students on this list can see and write this exam." />
          <div className="space-y-3 p-5">
            <Textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Paste student emails\nn210368@rguktn.ac.in, n210369@rguktn.ac.in\nsomeone@gmail.com"}
              className="font-mono text-[13px]"
            />
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {preview.valid.length ? `${pluralize(preview.valid.length, "student")} found` : "Full email addresses, separated by commas, spaces or new lines"}
                {preview.invalid.length > 0 && (
                  <span className="text-danger-text">
                    {" "}
                    · {preview.invalid.length} not {preview.invalid.length === 1 ? "an email" : "emails"} ({preview.invalid.slice(0, 2).join(", ")}
                    {preview.invalid.length > 2 ? "…" : ""})
                  </span>
                )}
              </span>
            </div>
            <Button className="w-full" icon={UserPlus} disabled={!preview.valid.length} loading={busy && Boolean(text)} onClick={() => add(preview.valid, () => setText(""))}>
              Add {preview.valid.length ? pluralize(preview.valid.length, "student") : "students"}
            </Button>
            <div className="relative py-1 text-center text-xs text-muted">
              <span className="relative z-10 bg-surface px-2">or</span>
              <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => {
              readFile(e.target.files?.[0]);
              e.target.value = "";
            }} />
            <Button variant="secondary" className="w-full" icon={FileSpreadsheet} onClick={() => fileRef.current?.click()}>
              Import from Excel or CSV
            </Button>
            <p className="text-xs leading-relaxed text-muted">Any column works: Examify picks up every email address and ignores names and headers. Roll numbers on their own aren't added, so list each student's full email.</p>
          </div>
        </Card>

        {setCounts.length > 0 && (
          <Card className="p-5">
            <div className="text-sm font-semibold text-ink">
              Students per set
              <InfoTip text="How many students were dealt each set. Sets are dealt in email order, so for college emails neighbours by roll number get different sets." className="ml-1.5" />
            </div>
            <p className="mt-0.5 text-[13px] text-muted">Dealt in email order (roll-number order for college emails), so neighbours get different sets.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {setCounts.map(([set, count]) => (
                <span key={set} className="rounded-lg bg-subtle px-2.5 py-1 text-[13px] text-ink-2">
                  <span className="font-semibold text-ink">Set {set}</span> · {count}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Card className="flex min-h-[420px] flex-col">
        <CardHeader
          icon={Users}
          title={`${pluralize(exam.allowed_students.length, "student")} allowed`} info="Everyone who can write this exam, with their set and whether they've started. Students who have started can't be removed."
          actions={
            exam.allowed_students.length > 0 && (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemoving("all")} className="text-danger-text hover:bg-danger-soft hover:text-danger-text">
                Remove all
              </Button>
            )
          }
        />
        {exam.allowed_students.length === 0 ? (
          <EmptyState icon={Users} title="No students yet" description="Add students on the left. They'll be dealt a set straight away." className="m-5 flex-1" />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
              <div className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by email" className="h-9 pl-9" />
              </div>
              {selected.size > 0 && (
                <Button size="sm" variant="danger-soft" icon={Trash2} onClick={() => setRemoving([...selected])}>
                  Remove {selected.size}
                </Button>
              )}
            </div>
            <div className="max-h-[560px] flex-1 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-surface text-xs text-muted shadow-[0_1px_0_rgb(var(--line))]">
                  <tr>
                    <th className="w-10 py-2.5 pl-5">
                      <Checkbox
                        checked={visible.length > 0 && visible.every((e) => selected.has(e))}
                        onChange={(on) => setSelected(on ? new Set(visible) : new Set())}
                        label="Select all shown"
                      />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Roll number</th>
                    <th className="px-3 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Set</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="w-12 py-2.5 pr-5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((email) => {
                    const status = STATUS[statuses[email] || "not_started"];
                    const started = statuses[email] && statuses[email] !== "not_started";
                    return (
                      <tr key={email} className="transition hover:bg-subtle/50">
                        <td className="py-2.5 pl-5">
                          <Checkbox checked={selected.has(email)} onChange={(on) => toggle(email, on)} label={`Select ${email}`} disabled={started} />
                        </td>
                        <td className="px-3 py-2.5 font-medium tabular-nums text-ink">{rollFromEmail(email)}</td>
                        <td className="px-3 py-2.5 text-muted">{email}</td>
                        <td className="px-3 py-2.5 tabular-nums text-ink-2">{sets.get(email) || "—"}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={status.tone} icon={status.icon}>
                            {status.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-5 text-right">
                          <IconButton icon={X} label={started ? "Already started" : `Remove ${email}`} size="sm" disabled={started} onClick={() => setRemoving([email])} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={Boolean(pendingFile)}
        onClose={() => setPendingFile(null)}
        icon={FileSpreadsheet}
        title={`Add ${pendingFile ? pluralize(pendingFile.valid.length, "student") : ""}?`}
        description={pendingFile ? `Found in ${pendingFile.name}.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingFile(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => add(pendingFile.valid, () => setPendingFile(null))}>
              Add students
            </Button>
          </>
        }
      >
        {pendingFile && (
          <div className="space-y-3">
            <div className="max-h-48 overflow-y-auto rounded-xl border border-line bg-subtle/50 p-3 font-mono text-[12px] leading-relaxed text-ink-2">
              {pendingFile.valid.slice(0, 200).join(", ")}
              {pendingFile.valid.length > 200 && ` … and ${pendingFile.valid.length - 200} more`}
            </div>
            {pendingFile.invalid.length > 0 && (
              <p className="text-[13px] text-danger-text">
                Skipping {pluralize(pendingFile.invalid.length, "entry", "entries")} that aren't full email addresses: {pendingFile.invalid.slice(0, 5).join(", ")}
                {pendingFile.invalid.length > 5 && "…"}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        tone="danger"
        icon={Trash2}
        title={removing === "all" ? "Remove every student?" : `Remove ${pluralize(removing?.length || 0, "student")}?`}
        description="They won't see this exam any more. Students who already started can't be removed."
        confirmLabel="Remove"
      />
    </div>
  );
}
