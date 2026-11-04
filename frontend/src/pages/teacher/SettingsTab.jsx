import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { FileText, KeyRound, Lock, MonitorUp, Shuffle, Trophy } from "lucide-react";
import { TeacherCodes } from "../../components/exam/ExamBits";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Field, Input, Segmented, Stepper, Switch, Textarea } from "../../components/ui/Form";
import { teacherApi } from "../../lib/api";

const pick = (exam) => ({
  title: exam.title,
  instructions: exam.instructions,
  duration_minutes: exam.duration_minutes,
  settings: { ...exam.settings },
});

export default function SettingsTab() {
  const { bundle, setBundle } = useOutletContext();
  const { exam } = bundle;
  const [form, setForm] = useState(() => pick(exam));
  const [codes, setCodes] = useState({ copy_code: exam.settings.copy_code, refresh_code: exam.settings.refresh_code });
  const [saving, setSaving] = useState(false);
  const [codesBusy, setCodesBusy] = useState(false);

  useEffect(() => {
    setForm(pick(exam));
    setCodes({ copy_code: exam.settings.copy_code, refresh_code: exam.settings.refresh_code });
  }, [exam]);

  const original = useMemo(() => JSON.stringify(pick(exam)), [exam]);
  const dirty = JSON.stringify(form) !== original;
  const s = form.settings;
  const setSetting = (key, value) => setForm((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));

  const save = async () => {
    setSaving(true);
    try {
      const { copy_code: _copy, refresh_code: _refresh, ...settings } = form.settings;
      setBundle(await teacherApi.update(exam.id, { title: form.title, instructions: form.instructions, duration_minutes: form.duration_minutes, settings }));
      toast.success("Settings saved.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveCodes = async () => {
    setCodesBusy(true);
    try {
      setBundle(await teacherApi.update(exam.id, { settings: { copy_code: codes.copy_code, refresh_code: codes.refresh_code } }));
      toast.success("Codes saved.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCodesBusy(false);
    }
  };

  const regenerate = async (which) => {
    setCodesBusy(true);
    try {
      setBundle(await teacherApi.regenerateCodes(exam.id, which));
      toast.success("New code ready. The old one no longer works.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCodesBusy(false);
    }
  };

  const codesDirty = codes.copy_code !== exam.settings.copy_code || codes.refresh_code !== exam.settings.refresh_code;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <Card>
        <CardHeader icon={FileText} title="Exam details" />
        <div className="space-y-5 p-5">
          <Field label="Name">{(id) => <Input id={id} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
          <Field label="Time per student" hint="Counted from the moment each student starts. Changing it affects students who haven't started yet.">
            <div className="flex items-center gap-3">
              <Stepper value={form.duration_minutes} onChange={(duration_minutes) => setForm({ ...form, duration_minutes })} min={1} max={600} label="Minutes" />
              <span className="text-sm text-muted">minutes</span>
            </div>
          </Field>
          <Field label="Instructions" hint="Students read these before they start.">
            {(id) => <Textarea id={id} rows={5} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader icon={MonitorUp} title="Proctoring" description="What students must do to write, and what happens when they leave." />
        <div className="divide-y divide-line">
          <div className="p-5">
            <Switch checked={s.require_fullscreen} onChange={(v) => setSetting("require_fullscreen", v)} label="Require fullscreen" description="The exam opens in fullscreen. Leaving it locks the paper until you unlock it." />
          </div>
          <div className="p-5">
            <Switch
              checked={s.require_screen_share}
              onChange={(v) => setSetting("require_screen_share", v)}
              label="Require entire-screen sharing"
              description="Students must share their whole screen (a window or tab is refused). They see it in a small box at the top; nothing is recorded or uploaded."
            />
          </div>
          <div className="p-5">
            <Switch checked={s.block_extended_display} onChange={(v) => setSetting("block_extended_display", v)} label="Block second monitors" description="Students with an extra display connected can't start." />
          </div>
          <div className="p-5">
            <Switch
              checked={!s.allow_leaving}
              onChange={(v) => setSetting("allow_leaving", !v)}
              label="Lock when a student leaves the tab"
              description={
                exam.type === "internal"
                  ? "Usually off for internals: students switch to their own IDE to write the programs."
                  : "Switching to another tab or window locks the paper until you enter the copy code."
              }
            />
          </div>
          <div className="p-5">
            <Switch
              checked={!s.allow_clipboard}
              onChange={(v) => setSetting("allow_clipboard", !v)}
              label="Block copy and paste"
              description="Copy, paste, cut and right-click are refused with a warning. They're never counted as cheating."
            />
          </div>
          <div className="p-5">
            <Switch
              checked={s.lock_on_rejoin}
              onChange={(v) => setSetting("lock_on_rejoin", v)}
              label="Lock when a student comes back"
              description="Reloading or reopening the exam locks it, so closing the tab can't be used to look something up."
            />
          </div>
          <div className="flex items-center justify-between gap-6 p-5">
            <div>
              <div className="text-sm font-medium text-ink">Auto-submit after violations</div>
              <div className="mt-0.5 text-[13px] leading-snug text-muted">Each tab switch, fullscreen exit or stopped share is one violation. 0 means never auto-submit.</div>
            </div>
            <Stepper value={s.max_violations} onChange={(v) => setSetting("max_violations", v)} min={0} max={20} label="Violations" />
          </div>
        </div>
      </Card>

      {exam.type !== "internal" && (
      <Card>
        <CardHeader icon={Trophy} title="Scoring and results" />
        <div className="space-y-6 p-5">
          {exam.type === "viva" && (
          <Field label="Multiple-correct questions" hint={s.multi_scoring === "strict" ? "Any wrong tick scores 0 for that question. Otherwise marks are shared by correct ticks: 2 of 3 correct = 2/3 of the marks." : "Each wrong tick cancels a right one: 2 right and 1 wrong of 3 correct = 1/3 of the marks. Never below 0."}>
            <Segmented
              value={s.multi_scoring}
              onChange={(v) => setSetting("multi_scoring", v)}
              disabled={exam.content_locked}
              options={[
                { value: "strict", label: "Partial, wrong tick = 0" },
                { value: "net", label: "Partial, wrong ticks subtract" },
              ]}
            />
          </Field>
          )}
          {exam.type === "external" && (
            <div className="flex items-center justify-between gap-6">
              <div>
                <div className="text-sm font-medium text-ink">AI checks per question</div>
                <div className="mt-0.5 text-[13px] leading-snug text-muted">
                  How many times a student can press Run on each question. Running unchanged code doesn't use one, and the final answer is always checked on submit. 0 means no limit.
                </div>
              </div>
              <Stepper value={s.max_runs} onChange={(v) => setSetting("max_runs", v)} min={0} max={200} label="Checks per question" />
            </div>
          )}
          <Field label="After submitting, students see">
            <Segmented
              value={s.result_visibility}
              onChange={(v) => setSetting("result_visibility", v)}
              options={[
                { value: "none", label: "Nothing" },
                { value: "score", label: "Their score" },
                { value: "full", label: "Score and answers" },
              ]}
            />
          </Field>
          <Switch checked={s.clear_answers_on_unlock} onChange={(v) => setSetting("clear_answers_on_unlock", v)} label="Clear answers when unlocking" description="After a violation, the student starts the same paper again from blank." />
        </div>
      </Card>
      )}

      <Card>
        <CardHeader icon={Shuffle} title="Shuffling" description="Students on the same set still see different papers." />
        <div className="divide-y divide-line">
          <div className="p-5">
            <Switch checked={s.shuffle_questions} onChange={(v) => setSetting("shuffle_questions", v)} label="Shuffle question order" />
          </div>
          {exam.type === "viva" && (
            <div className="p-5">
              <Switch checked={s.shuffle_options} onChange={(v) => setSetting("shuffle_options", v)} label="Shuffle option order" />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader icon={KeyRound} title="Teacher codes" description="Use the generated codes, or set your own (4–20 letters or digits)." />
        <div className="space-y-5 p-5">
          <TeacherCodes settings={exam.settings} onRegenerate={regenerate} busy={codesBusy} />
          <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Custom copy code">
              <Input value={codes.copy_code} onChange={(e) => setCodes({ ...codes, copy_code: e.target.value.toUpperCase() })} maxLength={20} className="font-mono uppercase tracking-widest" />
            </Field>
            <Field label="Custom refresh code">
              <Input value={codes.refresh_code} onChange={(e) => setCodes({ ...codes, refresh_code: e.target.value.toUpperCase() })} maxLength={20} className="font-mono uppercase tracking-widest" />
            </Field>
            <Button variant="secondary" onClick={saveCodes} loading={codesBusy} disabled={!codesDirty}>
              Save codes
            </Button>
          </div>
        </div>
      </Card>

      {exam.content_locked && exam.type === "viva" && (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Lock className="h-3.5 w-3.5" />
          Multiple-correct scoring is locked because students have started.
        </p>
      )}

      {dirty && (
        <div className="sticky bottom-4 z-20 flex animate-slide-up items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 px-5 py-3 shadow-pop backdrop-blur">
          <span className="text-sm font-medium text-ink">You have unsaved changes</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setForm(pick(exam))}>
              Discard
            </Button>
            <Button onClick={save} loading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
