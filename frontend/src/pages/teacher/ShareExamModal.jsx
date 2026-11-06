import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, Search, Share2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Feedback";
import { Checkbox, Input } from "../../components/ui/Form";
import { Modal } from "../../components/ui/Overlay";
import { cn } from "../../lib/cn";
import { teacherApi } from "../../lib/api";
import { pluralize } from "../../lib/format";

/**
 * Picks the teachers an exam is shared with. They see it on their dashboard and
 * do everything the owner does, except change its questions.
 */
export default function ShareExamModal({ open, onClose, exam, onSaved }) {
  const [teachers, setTeachers] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setPicked(new Set(exam.shared_with));
    setQuery("");
    setTeachers(null);
    teacherApi
      .teachers()
      .then((data) => !cancelled && setTeachers(data.teachers))
      .catch((error) => {
        if (cancelled) return;
        toast.error(error.message);
        setTeachers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, exam.shared_with]);

  // Teachers it's already shared with stay listed even if their account is gone, so they can be removed.
  const everyone = useMemo(() => {
    const list = [...(teachers || [])];
    for (const email of exam.shared_with) if (!list.some((t) => t.email === email)) list.push({ email, name: "" });
    return list;
  }, [teachers, exam.shared_with]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return everyone.filter((t) => !q || t.email.includes(q) || t.name.toLowerCase().includes(q));
  }, [everyone, query]);

  const toggle = (email, on) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(email);
      else next.delete(email);
      return next;
    });

  const changed = picked.size !== exam.shared_with.length || exam.shared_with.some((email) => !picked.has(email));

  const save = async () => {
    setSaving(true);
    try {
      const next = await teacherApi.share(exam.id, [...picked]);
      onSaved(next);
      toast.success(picked.size ? `Shared with ${pluralize(picked.size, "teacher")}.` : "This exam isn't shared with anyone now.");
      onClose();
    } catch (error) {
      toast.error(error.message, { duration: 6000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!saving}
      icon={Share2}
      title="Share with teachers"
      description="They see this exam on their dashboard and can do everything you can: settings, sets, students, the live monitor, unlocking, results and answer sheets. Only you can change its questions, share it or delete it."
      size="md"
      footer={
        <>
          <span className="mr-auto text-[13px] text-muted">{picked.size ? `${pluralize(picked.size, "teacher")} selected` : "Not shared"}</span>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon={Check} onClick={save} loading={saving} disabled={!changed}>
            Save
          </Button>
        </>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teachers by name or email" className="pl-9" aria-label="Search teachers" />
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-line">
        {teachers === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner className="h-4 w-4" />
            Loading teachers…
          </div>
        ) : visible.length ? (
          <ul className="divide-y divide-line">
            {visible.map((t) => (
              <li key={t.email}>
                <label className={cn("flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition hover:bg-subtle/60", picked.has(t.email) && "bg-primary-soft/40")}>
                  <Checkbox checked={picked.has(t.email)} onChange={(on) => toggle(t.email, on)} label={`Share with ${t.name || t.email}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{t.name || t.email}</span>
                    {t.name && <span className="block truncate text-xs text-muted">{t.email}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {everyone.length ? "No teacher matches that search." : "No other teachers have signed in to Examify yet. Teachers appear here after their first sign-in."}
          </p>
        )}
      </div>
    </Modal>
  );
}
