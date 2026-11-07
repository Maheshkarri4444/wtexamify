import { useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Eye,
  Info,
  KeyRound,
  Lock,
  MonitorOff,
  MoreHorizontal,
  PencilLine,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Unlock,
  Users,
  WifiOff,
} from "lucide-react";
import { TeacherCodes } from "../../components/exam/ExamBits";
import { Badge } from "../../components/ui/Badge";
import { Button, IconButton } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Meter, StatTile } from "../../components/ui/Data";
import { Callout, EmptyState, PageLoader } from "../../components/ui/Feedback";
import { Input, Segmented } from "../../components/ui/Form";
import { ConfirmModal, InfoTip, Menu, Tooltip } from "../../components/ui/Overlay";
import { cn } from "../../lib/cn";
import { teacherApi } from "../../lib/api";
import { formatClock, pluralize, timeAgo } from "../../lib/format";
import { useNow, usePolling } from "../../lib/hooks";
import AttemptDrawer from "./AttemptDrawer";

// What each status means and what the teacher can do about it, shown on hover.
const STATUS_HELP = {
  locked: {
    title: "Locked",
    text: "The student left the exam, so their paper is hidden until you let them back in. Type the copy code on their laptop, or choose Unlock from the ⋯ menu on this row. Their saved answers are kept.",
  },
  offline: {
    title: "Offline",
    text: "Their browser hasn't checked in for over 45 seconds: the laptop may be asleep, off Wi-Fi, or the tab was closed. Everything saved so far is safe; they continue when they reconnect.",
  },
  writing: { title: "Writing", text: "The student is writing. Their answers save automatically every few seconds." },
  not_started: { title: "Not started", text: "This student hasn't opened the exam yet." },
  submitted: { title: "Submitted", text: "The student has finished and can't change their answers. Open ⋯ → View answers to see their paper." },
  grading: { title: "Submitted, being checked", text: "Finished. Gemini is still checking some answers, so the score will update in a moment." },
};

function statusOf(row) {
  if (row.status === "submitted" && row.grading === "pending") return { key: "submitted", help: "grading", label: "Checking", tone: "info", icon: CheckCircle2 };
  if (row.status === "submitted") return { key: "submitted", label: "Submitted", tone: "success", icon: CheckCircle2 };
  if (row.status === "in_progress" && row.locked) return { key: "locked", label: "Locked", tone: "danger", icon: Lock };
  if (row.status === "in_progress" && !row.online) return { key: "offline", label: "Offline", tone: "warning", icon: WifiOff };
  if (row.status === "in_progress") return { key: "writing", label: "Writing", tone: "info", icon: PencilLine };
  return { key: "not_started", label: "Not started", tone: "neutral", icon: CircleDashed };
}

function StatusHelp({ state, reason }) {
  const help = STATUS_HELP[state.help || state.key];
  return (
    <span className="block">
      <span className="block font-semibold text-ink">{help.title}</span>
      {reason && <span className="mt-0.5 block text-danger-text">Why: {reason}</span>}
      <span className="mt-1 block">{help.text}</span>
    </span>
  );
}

// Every action on the board except Unlock asks first and says what it will do:
// a stray click on "Give a new set" once wiped a student's answers mid-exam.
function confirmDetails(confirm, writing) {
  if (!confirm) return null;
  const { action, row, minutes } = confirm;
  switch (action) {
    case "new_set":
      return {
        title: `Give ${row.roll} a new set?`,
        attention: `This clears all of ${row.roll}'s answers and Run results and gives them a different set. It can't be undone.`,
        confirmLabel: "Give a new set",
        tone: "danger",
        icon: RefreshCw,
      };
    case "extend":
      return {
        title: `Add ${minutes} minutes for ${row.roll}?`,
        attention: `Only ${row.roll} gets the extra time: their deadline moves ${minutes} minutes later.`,
        confirmLabel: `Add ${minutes} minutes`,
        tone: "primary",
        icon: Plus,
      };
    case "submit":
      return {
        title: `Submit ${row.roll}'s exam now?`,
        attention: "Their saved answers are marked and they can't write any more. It can't be undone.",
        confirmLabel: "Submit now",
        tone: "danger",
        icon: Send,
      };
    case "extend_all":
      return {
        title: `Add ${minutes} minutes for everyone writing?`,
        attention: `All ${writing} student${writing === 1 ? "" : "s"} writing right now get ${minutes} more minutes.`,
        confirmLabel: `Add ${minutes} minutes`,
        tone: "primary",
        icon: Plus,
      };
    default:
      return null;
  }
}

export default function LiveTab() {
  const { bundle, reload } = useOutletContext();
  const { exam } = bundle;
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState(null);
  const [confirm, setConfirm] = useState(null); // an action waiting for the teacher to confirm it
  const [busy, setBusy] = useState(false);
  const offset = useRef(0);
  const now = useNow(1000);

  const refresh = () =>
    teacherApi
      .monitor(exam.id)
      .then((result) => {
        offset.current = new Date(result.server_now).getTime() - Date.now();
        setData(result);
      })
      .catch(() => {});

  usePolling(refresh, 4000);

  const rows = useMemo(() => (data?.rows || []).map((row) => ({ ...row, state: statusOf(row) })), [data]);
  const counts = useMemo(() => {
    const c = { all: rows.length, writing: 0, locked: 0, offline: 0, not_started: 0, submitted: 0 };
    for (const row of rows) c[row.state.key]++;
    return c;
  }, [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order = { locked: 0, offline: 1, writing: 2, not_started: 3, submitted: 4 };
    return rows
      .filter((row) => (filter === "all" || row.state.key === filter) && (!q || row.email.includes(q) || row.roll.toLowerCase().includes(q) || row.name?.toLowerCase().includes(q)))
      .sort((a, b) => order[a.state.key] - order[b.state.key] || a.email.localeCompare(b.email));
  }, [rows, filter, query]);

  const act = async (row, action, minutes) => {
    setBusy(true);
    try {
      await teacherApi.attemptAction(exam.id, row.attempt_id, action, minutes);
      const messages = { unlock: `${row.roll} unlocked.`, new_set: `${row.roll} got a new set.`, extend: `Added ${minutes} minutes for ${row.roll}.`, submit: `${row.roll} submitted.` };
      toast.success(messages[action]);
      setConfirm(null);
      refresh();
      if (action === "submit") reload();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const extendAll = async (minutes) => {
    setBusy(true);
    try {
      const { extended } = await teacherApi.extendAll(exam.id, minutes);
      toast.success(`Added ${minutes} minutes for ${extended} student${extended === 1 ? "" : "s"} still writing.`);
      setConfirm(null);
      refresh();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <PageLoader label="Connecting to the exam room…" />;
  const summary = data.summary;
  const details = confirmDetails(confirm, summary.in_progress || 0);

  return (
    <div className="space-y-6">
      {exam.status !== "live" && (
        <Callout tone={exam.status === "ended" ? "info" : "warning"} icon={Radio}>
          {exam.status === "ended" ? "This exam has ended. The board below is the final state." : "The exam isn't live yet. Start it from the top of the page and students will appear here as they join."}
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Allowed" info="Everyone on this exam's student list." value={summary.allowed || 0} icon={Users} tone="neutral" />
        <StatTile label="Not started" info="On the list, but hasn't opened the paper yet." value={summary.not_started || 0} icon={CircleDashed} tone="neutral" />
        <StatTile label="Writing" info="Writing right now. Offline means their browser hasn't checked in for a while; what they saved so far is safe." value={summary.writing || 0} icon={PencilLine} tone="info" hint={summary.offline ? `${summary.offline} offline` : "All online"} />
        <StatTile label="Locked" info="Papers locked because the student left the tab, left fullscreen or stopped sharing. Unlock them from their row, or type the copy code on their laptop." value={summary.locked || 0} icon={ShieldAlert} tone="danger" hint={summary.locked ? "Waiting for you" : "No one"} />
        <StatTile label="Submitted" info="Handed in by the student, or automatically when time ran out or after too many violations." value={summary.submitted || 0} icon={CheckCircle2} tone="success" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "locked", label: "Locked", count: counts.locked },
                { value: "writing", label: "Writing", count: counts.writing },
                { value: "offline", label: "Offline", count: counts.offline },
                { value: "not_started", label: "Not started", count: counts.not_started },
                { value: "submitted", label: "Submitted", count: counts.submitted },
              ]}
            />
            <InfoTip text="Everyone on the list and where they are now. Hover a status to see what it means. A row's menu lets you unlock a student, add time, give a new set or submit for them." />
            <div className="relative ml-auto w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Roll number or name" className="h-9 pl-9" />
            </div>
          </div>
          {visible.length === 0 ? (
            <EmptyState icon={Users} title={rows.length ? "No students here" : "No students on the list"} description={rows.length ? "Try another filter." : "Add students in the Students tab."} className="m-5 border-none" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2.5 pl-5 font-medium">Student</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Set</th>
                    <th className="px-3 py-2.5 font-medium">{exam.type === "internal" ? "Paper" : "Answered"}</th>
                    <th className="px-3 py-2.5 font-medium">Violations</th>
                    <th className="px-3 py-2.5 font-medium">Time left</th>
                    <th className="px-3 py-2.5 font-medium">Last seen</th>
                    <th className="w-12 py-2.5 pr-5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((row) => {
                    const left = row.deadline_at ? new Date(row.deadline_at).getTime() - (now + offset.current) : null;
                    const writing = row.status === "in_progress";
                    return (
                      <tr key={row.email} className={cn("transition hover:bg-subtle/50", row.state.key === "locked" && "bg-danger-soft/40")}>
                        <td className="py-3 pl-5">
                          <div className="font-medium tabular-nums text-ink">{row.roll}</div>
                          <div className="max-w-[12rem] truncate text-xs text-muted">{row.name || row.email}</div>
                        </td>
                        <td className="px-3 py-3">
                          <Tooltip content={<StatusHelp state={row.state} reason={row.locked ? row.lock_reason : ""} />}>
                            <Badge tone={row.state.tone} icon={row.state.icon}>
                              {row.state.label}
                              <Info className="h-3 w-3 opacity-60" />
                            </Badge>
                          </Tooltip>
                          {row.locked && row.lock_reason && <div className="mt-1 max-w-[12rem] truncate text-[11px] text-danger-text">{row.lock_reason}</div>}
                          {writing && row.flags && !row.flags.sharing && exam.settings.require_screen_share && !row.locked && (
                            <Tooltip content="Their last check-in said screen sharing is off. They'll be locked once their browser notices; if not, check their laptop." className="mt-1">
                              <span className="flex items-center gap-1 text-[11px] text-warning-text">
                                <MonitorOff className="h-3 w-3" /> Not sharing
                              </span>
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-ink-2">{row.set || "—"}</td>
                        <td className="w-36 px-3 py-3">
                          {row.status === "not_started" ? (
                            <span className="text-muted">—</span>
                          ) : exam.type === "internal" ? (
                            <span className="text-xs text-ink-2">{pluralize(row.total, "question")}</span>
                          ) : (
                            <div className="space-y-1">
                              <div className="text-xs tabular-nums text-ink-2">
                                {row.answered} / {row.total}
                              </div>
                              <Meter value={row.total ? (row.answered / row.total) * 100 : 0} label={`${row.roll} answered`} />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {row.violations > 0 ? (
                            <Tooltip
                              content={`Times this student left the exam (tab switch, fullscreen exit or stopped sharing). Each one locked their paper.${exam.settings.max_violations > 0 ? ` At ${exam.settings.max_violations}, the exam is submitted automatically.` : ""}`}
                            >
                              <span className="inline-flex items-center gap-1 font-medium tabular-nums text-danger-text">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                {row.violations}
                                {exam.settings.max_violations > 0 && <span className="font-normal text-muted">/ {exam.settings.max_violations}</span>}
                              </span>
                            </Tooltip>
                          ) : (
                            <span className="tabular-nums text-muted">0</span>
                          )}
                          {row.refreshes > 0 && <div className="text-[11px] text-muted">{row.refreshes} refresh</div>}
                          {row.runs > 0 && <div className="text-[11px] text-muted">{row.runs} code checks</div>}
                        </td>
                        <td className="px-3 py-3 font-mono text-[13px] tabular-nums">
                          {writing && left !== null ? <span className={cn(left < 60000 ? "text-danger-text" : left < 300000 ? "text-warning-text" : "text-ink-2")}>{formatClock(left)}</span> : <span className="font-sans text-muted">—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted">{row.status === "submitted" ? timeAgo(row.submitted_at, now) : row.last_seen_at ? timeAgo(row.last_seen_at, now) : "—"}</td>
                        <td className="py-3 pr-5 text-right">
                          {row.attempt_id && (
                            <Menu
                              trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label={`Actions for ${row.roll}`} size="sm" onClick={toggle} />}
                              items={[
                                { label: "View answers", icon: Eye, onSelect: () => setViewing(row.attempt_id) },
                                writing && "divider",
                                writing && row.locked && { label: "Unlock", icon: Unlock, onSelect: () => act(row, "unlock") },
                                writing && { label: "Give a new set", icon: RefreshCw, onSelect: () => setConfirm({ action: "new_set", row }), hint: "clears answers" },
                                writing && { label: "Add 5 minutes", icon: Plus, onSelect: () => setConfirm({ action: "extend", row, minutes: 5 }) },
                                writing && { label: "Submit now", icon: Send, danger: true, onSelect: () => setConfirm({ action: "submit", row }) },
                              ]}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={KeyRound} title="Teacher codes" info="The copy code unlocks a student whose paper locked. The refresh code gives a student a new set and clears their answers. Type them on the student's laptop yourself; don't read them out." />
            <div className="p-5">
              <TeacherCodes settings={exam.settings} />
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Clock3 className="h-4 w-4 text-muted" />
              Add time for everyone writing
              <InfoTip text="Gives every student who is writing right now extra minutes, for example after a power cut. Students who haven't started already get the full time." />
            </div>
            <p className="mt-1 text-[13px] text-muted">For a power cut or a late start. Students who haven't started get the full time anyway.</p>
            <div className="mt-3 flex gap-2">
              {[2, 5, 10].map((minutes) => (
                <Button key={minutes} variant="secondary" size="sm" icon={Plus} onClick={() => setConfirm({ action: "extend_all", minutes })} disabled={!summary.in_progress}>
                  {minutes} min
                </Button>
              ))}
            </div>
          </Card>
          <p className="flex items-center gap-2 px-1 text-xs text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Updates every few seconds
          </p>
        </div>
      </div>

      <AttemptDrawer examId={exam.id} examType={exam.type} examTitle={exam.title} attemptId={viewing} onClose={() => setViewing(null)} />
      <ConfirmModal
        open={Boolean(details)}
        onClose={() => setConfirm(null)}
        onConfirm={() => (confirm.action === "extend_all" ? extendAll(confirm.minutes) : act(confirm.row, confirm.action, confirm.minutes))}
        loading={busy}
        tone={details?.tone}
        icon={details?.icon}
        title={details?.title}
        confirmLabel={details?.confirmLabel}
      >
        {details && (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-[13px] leading-relaxed text-warning-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold">Attention: </span>
              {details.attention}
            </p>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
