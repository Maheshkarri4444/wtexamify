import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCheck, Clock3, FileQuestion, Layers3, Plus, Radio, Search, Users } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { StatusBadge, TypeIcon } from "../../components/exam/ExamBits";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/Card";
import { StatTile, Meter } from "../../components/ui/Data";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Input, Segmented } from "../../components/ui/Form";
import { teacherApi } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { EXAM_TYPES } from "../../lib/examTypes";
import { firstName, formatMinutes, timeAgo } from "../../lib/format";
import { usePolling } from "../../lib/hooks";
import CreateExamModal from "./CreateExamModal";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function ExamCard({ exam }) {
  const showProgress = exam.status === "live" || exam.status === "ended";
  const progress = exam.student_count ? (exam.submitted / exam.student_count) * 100 : 0;
  return (
    <Link
      to={`/teacher/exams/${exam.id}${exam.status === "live" ? "/live" : ""}`}
      className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TypeIcon type={exam.type} />
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-ink transition group-hover:text-primary-text">{exam.title}</h3>
            <p className="text-xs text-muted">
              {EXAM_TYPES[exam.type]?.label} · edited {timeAgo(exam.updated_at)}
            </p>
          </div>
        </div>
        <StatusBadge status={exam.status} />
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-2">
        {[
          { label: "Questions", value: exam.question_count, icon: FileQuestion },
          { label: "Sets", value: exam.set_count, icon: Layers3 },
          { label: "Students", value: exam.student_count, icon: Users },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl bg-subtle/70 px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
              <Icon className="h-3 w-3" />
              {label}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto pt-4">
        {showProgress ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Submitted</span>
              <span className="font-medium tabular-nums text-ink-2">
                {exam.submitted} / {exam.student_count}
              </span>
            </div>
            <Meter value={progress} label="Students who submitted" />
          </div>
        ) : (
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {formatMinutes(exam.duration_minutes)}
            </span>
            <span>{exam.per_set} per set</span>
          </div>
        )}
      </div>
    </Link>
  );
}

const TeacherDashboard = () => {
  const user = getUser();
  const [exams, setExams] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  usePolling(() => {
    teacherApi
      .list()
      .then((data) => setExams(data.exams))
      .catch(() => setExams((current) => current ?? []));
  }, 15000);

  const counts = useMemo(() => {
    const list = exams || [];
    return {
      all: list.length,
      draft: list.filter((e) => e.status === "draft").length,
      ready: list.filter((e) => e.status === "ready").length,
      live: list.filter((e) => e.status === "live").length,
      ended: list.filter((e) => e.status === "ended").length,
      students: list.reduce((sum, e) => sum + e.student_count, 0),
      submitted: list.reduce((sum, e) => sum + e.submitted, 0),
    };
  }, [exams]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (exams || []).filter((e) => (filter === "all" || e.status === filter) && (!q || e.title.toLowerCase().includes(q)));
  }, [exams, filter, query]);

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${greeting()}${firstName(user?.name) ? `, ${firstName(user?.name)}` : ""}`}
        title="Your exams"
        description="Build a viva, deal unique sets to your students and watch them write it live."
        actions={
          <Button icon={Plus} size="lg" onClick={() => setCreating(true)}>
            Create exam
          </Button>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Exams" info="Every exam you've made. Drafts are visible only to you; published exams show up for their students as upcoming." value={exams ? counts.all : "—"} icon={Layers3} tone="primary" hint={`${counts.draft} draft · ${counts.ended} ended`} />
        <StatTile label="Live now" info="Exams running right now. Students on their lists can start them." value={exams ? counts.live : "—"} icon={Radio} tone="success" hint={counts.live ? "Students are writing" : "Nothing running"} />
        <StatTile label="Students added" info="Students across all your exam lists. Someone on two lists is counted twice." value={exams ? counts.students.toLocaleString("en-IN") : "—"} icon={Users} tone="info" hint="Across all exams" />
        <StatTile label="Submissions" info="Answer sheets handed in across all your exams, including ones submitted automatically when time ran out." value={exams ? counts.submitted.toLocaleString("en-IN") : "—"} icon={CheckCheck} tone="neutral" hint="Marked automatically" />
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "draft", label: "Drafts", count: counts.draft },
            { value: "ready", label: "Published", count: counts.ready },
            { value: "live", label: "Live", count: counts.live },
            { value: "ended", label: "Ended", count: counts.ended },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exams" className="pl-9" />
        </div>
      </div>

      <div className="mt-5">
        {exams === null ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[214px] rounded-2xl" />
            ))}
          </div>
        ) : visible.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((exam, i) => (
              <div key={exam.id} className="animate-slide-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <ExamCard exam={exam} />
              </div>
            ))}
          </div>
        ) : exams.length ? (
          <EmptyState icon={Search} title="No exams match" description="Try another filter or search." />
        ) : (
          <EmptyState icon={Layers3} title="Create your first viva" description="Add questions by hand or from Excel, choose how many go in each set, add your students, and you're ready to go live.">
            <Button icon={Plus} onClick={() => setCreating(true)}>
              Create exam
            </Button>
          </EmptyState>
        )}
      </div>

      <CreateExamModal open={creating} onClose={() => setCreating(false)} />
    </AppShell>
  );
};

export default TeacherDashboard;
