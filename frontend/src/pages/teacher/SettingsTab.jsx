import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { FileText, KeyRound, Lock, MonitorUp, ShieldAlert, Shuffle, Trophy } from "lucide-react";
import { TeacherCodes } from "../../components/exam/ExamBits";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Field, Input, Segmented, Stepper, Switch, Textarea } from "../../components/ui/Form";
import { InfoTip } from "../../components/ui/Overlay";
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
  // The custom-code boxes start empty: the current codes stay hidden until the teacher clicks one.
  const [codes, setCodes] = useState({ copy_code: "", refresh_code: "" });
  const [saving, setSaving] = useState(false);
  const [codesBusy, setCodesBusy] = useState(false);

  useEffect(() => {
    setForm(pick(exam));
    setCodes({ copy_code: "", refresh_code: "" });
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
      const settings = {};
      if (codes.copy_code) settings.copy_code = codes.copy_code;
      if (codes.refresh_code) settings.refresh_code = codes.refresh_code;
      setBundle(await teacherApi.update(exam.id, { settings }));
      toast.success(Object.keys(settings).length === 2 ? "Both codes saved." : "Code saved.");
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

  const validCode = (code) => !code || /^[A-Z0-9]{4,20}$/.test(code);
  const codesDirty = Boolean(codes.copy_code || codes.refresh_code);
  const codesValid = validCode(codes.copy_code) && validCode(codes.refresh_code);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <Card>
        <CardHeader icon={KeyRound} title="Teacher codes" info="The copy code unlocks a student whose paper locked. The refresh code gives a student a new set and clears their answers. Type them on the student's laptop yourself; don't read them out." description="Use the generated codes, or type your own below (4–20 letters or digits). A box left empty keeps its code." />
        <div className="space-y-5 p-5">
          <TeacherCodes settings={exam.settings} onRegenerate={regenerate} busy={codesBusy} />
          <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Custom copy code" info="Type your own copy code and save it. The old one stops working at once." error={validCode(codes.copy_code) ? "" : "4–20 letters or digits"}>
              {(id) => (
                <Input
                  id={id}
                  value={codes.copy_code}
                  onChange={(e) => setCodes({ ...codes, copy_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                  maxLength={20}
                  autoComplete="off"
                  placeholder="Type a new code"
                  className="font-mono uppercase tracking-widest placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
                />
              )}
            </Field>
            <Field label="Custom refresh code" info="Type your own refresh code and save it. The old one stops working at once." error={validCode(codes.refresh_code) ? "" : "4–20 letters or digits"}>
              {(id) => (
                <Input
                  id={id}
                  value={codes.refresh_code}
                  onChange={(e) => setCodes({ ...codes, refresh_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                  maxLength={20}
                  autoComplete="off"
                  placeholder="Type a new code"
                  className="font-mono uppercase tracking-widest placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
                />
              )}
            </Field>
            <Button variant="secondary" onClick={saveCodes} loading={codesBusy} disabled={!codesDirty || !codesValid}>
              Save codes
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={ShieldAlert} title="Violations" info="A violation is a tab switch, a fullscreen exit or a stopped share. Each one locks the paper until you unlock it." />
        <div className="flex items-center justify-between gap-6 p-5">
          <div>
            <div className="text-sm font-medium text-ink">
              Auto-submit after violations
              <InfoTip text="After this many violations the paper is submitted with whatever the student has answered. 0 means a violation only ever locks the paper." className="ml-1.5" />
            </div>
            <div className="mt-0.5 text-[13px] leading-snug text-muted">Each tab switch, fullscreen exit or stopped share is one violation. 0 means never auto-submit.</div>
          </div>
          <Stepper value={s.max_violations} onChange={(v) => setSetting("max_violations", v)} min={0} max={20} label="Violations" />
        </div>
      </Card>

      <Card>
        <CardHeader icon={FileText} title="Exam details" info="What students see about the exam, and how long each of them gets." />
        <div className="space-y-5 p-5">
          <Field label="Name" info="Shown to students on their exam list and in the exam room.">{(id) => <Input id={id} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
          <Field label="Time per student" info="Each student's timer starts when they press Start, so a late starter still gets the full time." hint="Counted from the moment each student starts. Changing it affects students who haven't started yet.">
            <div className="flex items-center gap-3">
              <Stepper value={form.duration_minutes} onChange={(duration_minutes) => setForm({ ...form, duration_minutes })} min={1} max={600} label="Minutes" />
              <span className="text-sm text-muted">minutes</span>
            </div>
          </Field>
          <Field label="Instructions" info="Shown in the lobby before students start. Short is best." hint="Students read these before they start.">
            {(id) => <Textarea id={id} rows={5} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader icon={MonitorUp} title="Proctoring" info="What students must do while writing, and what counts as a violation. A violation locks the paper until you unlock it." description="What students must do to write, and what happens when they leave." />
        <div className="divide-y divide-line">
          <div className="p-5">
            <Switch checked={s.require_fullscreen} onChange={(v) => setSetting("require_fullscreen", v)} label="Require fullscreen" info="The exam runs in fullscreen. Leaving fullscreen is a violation and locks the paper." description="The exam opens in fullscreen. Leaving it locks the paper until you unlock it." />
          </div>
          <div className="p-5">
            <Switch
              checked={s.require_screen_share}
              onChange={(v) => setSetting("require_screen_share", v)}
              label="Require entire-screen sharing" info="Students share their whole screen while writing. They see it as a small preview at the top; nothing is recorded or uploaded."
              description="Students must share their whole screen (a window or tab is refused). They see it in a small box at the top; nothing is recorded or uploaded."
            />
          </div>
          <div className="p-5">
            <Switch checked={s.block_extended_display} onChange={(v) => setSetting("block_extended_display", v)} label="Block second monitors" info="A student whose computer reports a second display can't start, so they can't keep notes open on another screen." description="Students with an extra display connected can't start." />
          </div>
          <div className="p-5">
            <Switch
              checked={!s.allow_leaving}
              onChange={(v) => setSetting("allow_leaving", !v)}
              label="Lock when a student leaves the tab" info="Switching to another tab or app is a violation and locks the paper until you enter the copy code."
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
              label="Block copy and paste" info="Copy, paste, cut and right-click are refused with a warning. It's never counted as a violation."
              description="Copy, paste, cut and right-click are refused with a warning. They're never counted as cheating."
            />
          </div>
          <div className="p-5">
            <Switch
              checked={s.lock_on_rejoin}
              onChange={(v) => setSetting("lock_on_rejoin", v)}
              label="Lock when a student comes back" info="Reloading or reopening the exam locks it, so closing the tab can't be used to look something up."
              description="Reloading or reopening the exam locks it, so closing the tab can't be used to look something up."
            />
          </div>
        </div>
      </Card>

      {exam.type !== "internal" && (
      <Card>
        <CardHeader icon={Trophy} title="Scoring" info="How answers are marked. Students never see their score: you see every mark in Results." description="Students don't see a score after submitting. Every mark is in Results." />
        <div className="space-y-6 p-5">
          {exam.type === "viva" && (
          <Field label="Multiple-correct questions" info="How a partly right answer to a multiple-correct question is marked. It never goes below 0." hint={s.multi_scoring === "strict" ? "Any wrong tick scores 0 for that question. Otherwise marks are shared by correct ticks: 2 of 3 correct = 2/3 of the marks." : "Each wrong tick cancels a right one: 2 right and 1 wrong of 3 correct = 1/3 of the marks. Never below 0."}>
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
                <div className="text-sm font-medium text-ink">
                  AI checks per question
                  <InfoTip text="How many times a student can press Run on one question. Running unchanged code is free, and every answer is checked again when they submit, even if they never pressed Run." className="ml-1.5" />
                </div>
                <div className="mt-0.5 text-[13px] leading-snug text-muted">
                  How many times a student can press Run on each question. Running unchanged code doesn't use one, and the final answer is always checked on submit. 0 means no limit.
                </div>
              </div>
              <Stepper value={s.max_runs} onChange={(v) => setSetting("max_runs", v)} min={0} max={200} label="Checks per question" />
            </div>
          )}
          <Switch checked={s.clear_answers_on_unlock} onChange={(v) => setSetting("clear_answers_on_unlock", v)} label="Clear answers when unlocking" info="After a violation, the student restarts the same paper with every answer cleared." description="After a violation, the student starts the same paper again from blank." />
        </div>
      </Card>
      )}

      <Card>
        <CardHeader icon={Shuffle} title="Shuffling" info="Mixes up the order for each student, so neighbours on the same set see different papers." description="Students on the same set still see different papers." />
        <div className="divide-y divide-line">
          <div className="p-5">
            <Switch
              checked={s.shuffle_questions && !exam.blueprint?.custom}
              onChange={(v) => setSetting("shuffle_questions", v)}
              disabled={Boolean(exam.blueprint?.custom)}
              label="Shuffle question order"
              info="Each student sees their set's questions in a different order."
              description={exam.blueprint?.custom ? "Your own sets keep the order of your sheet, so every student sees I before II." : undefined}
            />
          </div>
          {exam.type === "viva" && (
            <div className="p-5">
              <Switch checked={s.shuffle_options} onChange={(v) => setSetting("shuffle_options", v)} label="Shuffle option order" info="Each student sees every MCQ's options in a different order. Marking isn't affected." />
            </div>
          )}
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
