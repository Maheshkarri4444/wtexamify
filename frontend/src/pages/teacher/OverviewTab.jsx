import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowRight, CheckCircle2, Circle, KeyRound, ListChecks, MonitorUp, Shuffle, Sparkles, Timer, Trophy } from "lucide-react";
import { TeacherCodes } from "../../components/exam/ExamBits";
import { Badge } from "../../components/ui/Badge";
import { Card, CardHeader } from "../../components/ui/Card";
import { StatTile } from "../../components/ui/Data";
import { teacherApi } from "../../lib/api";
import { formatMinutes, pluralize } from "../../lib/format";

const CHECK_LINKS = { questions: "questions", sets: "sets", students: "students", duration: "settings", codes: "settings" };

const VISIBILITY = { none: "Hidden until you share them", score: "Score shown after submitting", full: "Score and correct answers shown" };

export default function OverviewTab() {
  const { bundle, setBundle } = useOutletContext();
  const { exam, stats, readiness } = bundle;
  const [busy, setBusy] = useState(false);
  const done = readiness.filter((c) => c.ok).length;
  const s = exam.settings;

  const regenerate = async (which) => {
    setBusy(true);
    try {
      setBundle(await teacherApi.regenerateCodes(exam.id, which));
      toast.success("New code ready. The old one no longer works.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const proctoring = [
    s.require_fullscreen && "Fullscreen",
    s.require_screen_share && "Entire-screen sharing",
    s.block_extended_display && "Single monitor",
    !s.allow_leaving && "Lock on leaving the tab",
    !s.allow_clipboard && "No copy/paste",
    s.lock_on_rejoin && "Lock on rejoin",
  ].filter(Boolean);
  const rows = [
    { icon: Timer, label: "Time per student", value: formatMinutes(exam.duration_minutes) },
    { icon: Shuffle, label: "Shuffling", value: [s.shuffle_questions && "questions", exam.type === "viva" && s.shuffle_options && "options"].filter(Boolean).join(" and ") || "Off" },
    { icon: MonitorUp, label: "Proctoring", value: proctoring.length ? proctoring.join(" · ") : "Off" },
    s.max_violations > 0 || exam.type !== "internal" ? { icon: KeyRound, label: "Auto-submit", value: s.max_violations ? `After ${pluralize(s.max_violations, "violation")}` : "Never" } : null,
    exam.type === "external" && { icon: Sparkles, label: "AI checks", value: s.max_runs ? `${s.max_runs} per question` : "No limit" },
    { icon: Trophy, label: "Results", value: exam.type === "internal" ? "Not marked in Examify" : VISIBILITY[s.result_visibility] },
  ].filter(Boolean);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader
            icon={ListChecks}
            title="Setup"
            description={done === readiness.length ? "Everything is ready. Start the exam when your students are seated." : `${done} of ${readiness.length} done`}
          />
          <ul className="divide-y divide-line">
            {readiness.map((check) => (
              <li key={check.key}>
                <Link to={CHECK_LINKS[check.key]} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-subtle/60">
                  {check.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <Circle className="h-5 w-5 shrink-0 text-line-strong" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{check.label}</div>
                    <div className="truncate text-[13px] text-muted">{check.detail}</div>
                  </div>
                  {!check.ok && <Badge tone="warning">To do</Badge>}
                  <ArrowRight className="h-4 w-4 text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Started" value={stats.started} hint={`of ${exam.allowed_students.length}`} />
          <StatTile label="Writing" value={stats.in_progress} />
          <StatTile label="Submitted" value={stats.submitted} />
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader icon={KeyRound} title="Teacher codes" description="Type these on a student's laptop during invigilation." />
          <div className="p-5">
            <TeacherCodes settings={s} onRegenerate={regenerate} busy={busy} />
          </div>
        </Card>

        <Card>
          <CardHeader title={`How this ${exam.type} runs`} />
          <dl className="divide-y divide-line text-sm">
            {rows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3 px-5 py-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <dt className="w-32 shrink-0 text-muted">{label}</dt>
                <dd className="min-w-0 flex-1 font-medium text-ink">{value.charAt(0).toUpperCase() + value.slice(1)}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-line px-5 py-3">
            <Link to="settings" className="text-[13px] font-medium text-primary-text hover:underline">
              Change settings
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
