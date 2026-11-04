import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  BarChart3,
  ChevronLeft,
  Clock3,
  Copy,
  EyeOff,
  FileQuestion,
  Layers3,
  LayoutDashboard,
  Lock,
  MoreHorizontal,
  Play,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { StatusBadge, TypeIcon } from "../../components/exam/ExamBits";
import { Button, IconButton } from "../../components/ui/Button";
import { Callout, PageLoader } from "../../components/ui/Feedback";
import { ConfirmModal, InfoTip, Menu } from "../../components/ui/Overlay";
import { cn } from "../../lib/cn";
import { teacherApi } from "../../lib/api";
import { formatMinutes, pluralize } from "../../lib/format";
import { usePolling } from "../../lib/hooks";

const TABS = [
  { to: "", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "questions", label: "Questions", icon: FileQuestion, count: (b) => b.exam.questions.length },
  { to: "sets", label: "Sets", icon: Layers3, count: (b) => b.exam.sets.length },
  { to: "students", label: "Students", icon: Users, count: (b) => b.exam.allowed_students.length },
  { to: "settings", label: "Settings", icon: Settings2 },
  { to: "live", label: "Live", icon: Radio, live: true },
  { to: "results", label: "Results", icon: BarChart3, count: (b) => b.stats.submitted },
];

const CONFIRM = {
  live: {
    title: "Start the exam?",
    description: "Every student on the list can start right away. Once the first student starts, questions and sets are locked.",
    label: "Start exam",
    icon: Play,
  },
  ended: {
    title: "End the exam?",
    description: "No one else can start, and everyone still writing is submitted with the answers they've saved.",
    label: "End exam",
    icon: Square,
    tone: "danger",
  },
};

const ExamWorkspace = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState(null);
  const [missing, setMissing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setBundle(await teacherApi.get(id));
    } catch (error) {
      if (error.status === 404) setMissing(true);
      else toast.error(error.message);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  // A student can start at any moment while the exam is live. Watch for that, so
  // no tab keeps offering to change questions, the blueprint or sets.
  const watchLock = bundle?.exam.status === "live" && !bundle.exam.content_locked;
  usePolling(
    async () => {
      try {
        const next = await teacherApi.get(id);
        if (!next.exam.content_locked) return;
        setBundle(next);
        toast("A student has started, so questions, blueprint and sets are now locked.", { icon: "🔒", id: "content-locked", duration: 8000 });
      } catch {
        // The next check tries again.
      }
    },
    5000,
    watchLock
  );

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      const next = await teacherApi.setStatus(id, status);
      setBundle(next);
      const messages = { ready: "Published. Students can see it as upcoming.", draft: "Back to draft. Students can't see it.", live: "The exam is live.", ended: "Exam ended. Everyone has been submitted." };
      toast.success(messages[status]);
      setConfirm(null);
      if (status === "live") navigate(`/teacher/exams/${id}/live`);
      if (status === "ended") navigate(`/teacher/exams/${id}/results`);
    } catch (error) {
      toast.error(error.message, { duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    try {
      const { id: copyId } = await teacherApi.duplicate(id);
      toast.success("Copied into a new draft, without students.");
      navigate(`/teacher/exams/${copyId}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await teacherApi.remove(id);
      toast.success("Exam deleted.");
      navigate("/teacher", { replace: true });
    } catch (error) {
      toast.error(error.message);
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <AppShell>
        <Callout tone="danger" title="Exam not found">
          It may have been deleted. <Link to="/teacher" className="font-medium underline">Back to your exams</Link>
        </Callout>
      </AppShell>
    );
  }
  if (!bundle) {
    return (
      <AppShell>
        <PageLoader label="Opening exam…" />
      </AppShell>
    );
  }

  const { exam, stats } = bundle;
  const actions = {
    draft: (
      <>
        <Button variant="secondary" icon={Send} onClick={() => changeStatus("ready")} loading={busy && !confirm}>
          Publish
        </Button>
        <Button icon={Play} onClick={() => setConfirm("live")}>
          Start exam
        </Button>
      </>
    ),
    ready: (
      <>
        <Button variant="ghost" icon={EyeOff} onClick={() => changeStatus("draft")} disabled={busy}>
          Unpublish
        </Button>
        <Button icon={Play} onClick={() => setConfirm("live")}>
          Start exam
        </Button>
      </>
    ),
    live: (
      <>
        <Button variant="secondary" icon={Radio} onClick={() => navigate(`/teacher/exams/${id}/live`)}>
          Live monitor
        </Button>
        <Button variant="danger" icon={Square} onClick={() => setConfirm("ended")}>
          End exam
        </Button>
      </>
    ),
    ended: (
      <>
        <Button variant="secondary" icon={RotateCcw} onClick={() => setConfirm("live")}>
          Reopen
        </Button>
        <Button icon={BarChart3} onClick={() => navigate(`/teacher/exams/${id}/results`)}>
          Results
        </Button>
      </>
    ),
  }[exam.status];

  return (
    <AppShell>
      <Link to="/teacher" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted transition hover:text-ink">
        <ChevronLeft className="h-4 w-4" />
        All exams
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <TypeIcon type={exam.type} className="h-12 w-12 rounded-2xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{exam.title}</h1>
              <StatusBadge status={exam.status} />
              <InfoTip text="Draft: only you can see it. Published: students see it as upcoming. Live: students on the list can start. Ended: everyone still writing was submitted." />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <span className="flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                {formatMinutes(exam.duration_minutes)}
              </span>
              <span>{pluralize(exam.questions.length, "question")}</span>
              <span>{pluralize(exam.sets.length, "set")} of {exam.blueprint.per_set}</span>
              <span>{pluralize(exam.allowed_students.length, "student")}</span>
              {stats.started > 0 && <span>{stats.submitted} / {stats.started} submitted</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <Menu
            trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="More actions" variant="secondary" onClick={toggle} />}
            items={[
              { label: "Duplicate", icon: Copy, onSelect: duplicate, hint: "for another batch" },
              "divider",
              { label: "Delete exam", icon: Trash2, danger: true, onSelect: () => setConfirm("delete") },
            ]}
          />
        </div>
      </div>

      {exam.content_locked && (
        <Callout tone="warning" icon={Lock} className="mt-5" title={`${pluralize(stats.started, "student")} started, so questions, blueprint and sets are locked`}>
          Every paper stays exactly as it was dealt. You can still add students, change the time and settings, and use the teacher codes.
        </Callout>
      )}

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Exam sections">
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition",
                isActive ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink"
              )
            }
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.count && <span className="rounded-full bg-subtle px-1.5 text-[11px] tabular-nums text-muted">{tab.count(bundle)}</span>}
            {tab.live && exam.status === "live" && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="pt-6">
        <Outlet context={{ bundle, setBundle, reload }} />
      </div>

      {confirm && confirm !== "delete" && (
        <ConfirmModal
          open
          onClose={() => setConfirm(null)}
          onConfirm={() => changeStatus(confirm)}
          loading={busy}
          title={exam.status === "ended" && confirm === "live" ? "Reopen the exam?" : CONFIRM[confirm].title}
          description={
            exam.status === "ended" && confirm === "live"
              ? "Students who haven't started can start again. Anyone already submitted stays submitted."
              : CONFIRM[confirm].description
          }
          confirmLabel={exam.status === "ended" && confirm === "live" ? "Reopen" : CONFIRM[confirm].label}
          icon={CONFIRM[confirm].icon}
          tone={CONFIRM[confirm].tone}
        />
      )}
      <ConfirmModal
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        loading={busy}
        tone="danger"
        icon={Trash2}
        title="Delete this exam?"
        description={`This removes ${exam.title}, its questions and ${pluralize(stats.started, "student attempt")}. It can't be undone.`}
        confirmLabel="Delete forever"
        confirmText={stats.started > 0 ? "delete" : undefined}
      />
    </AppShell>
  );
};

export default ExamWorkspace;
