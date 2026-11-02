import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, FileQuestion, Hourglass, Inbox, Maximize, MonitorUp, Play } from "lucide-react";
import { AppShell, Avatar } from "../../components/layout/AppShell";
import { TypeIcon } from "../../components/exam/ExamBits";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { cn } from "../../lib/cn";
import { studentApi } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { firstName, formatMinutes, formatNumber, rollFromEmail, timeAgo } from "../../lib/format";
import { usePolling } from "../../lib/hooks";

function Requirements({ exam }) {
  const r = exam.requirements;
  if (!r.fullscreen && !r.screen_share) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {r.fullscreen && (
        <Badge icon={Maximize} tone="neutral">
          Fullscreen
        </Badge>
      )}
      {r.screen_share && (
        <Badge icon={MonitorUp} tone="neutral">
          Screen sharing
        </Badge>
      )}
    </div>
  );
}

function LiveCard({ card }) {
  const { exam, attempt } = card;
  const resuming = attempt?.status === "in_progress";
  return (
    <Link
      to={`/student/exams/${exam.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-primary/30 bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <TypeIcon type={exam.type} />
        <Badge tone="success" dot pulse>
          Live now
        </Badge>
      </div>
      <h3 className="relative mt-4 text-lg font-semibold text-ink">{exam.title}</h3>
      <div className="relative mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" />
          {formatMinutes(exam.duration_minutes)}
        </span>
        <span className="flex items-center gap-1.5">
          <FileQuestion className="h-3.5 w-3.5" />
          {exam.questions_per_set} questions
        </span>
      </div>
      <div className="relative mt-4">
        <Requirements exam={exam} />
      </div>
      <span className="relative mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-ink shadow-sm transition group-hover:bg-primary/90">
        <Play className="h-4 w-4" />
        {resuming ? "Resume exam" : "Start exam"}
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function SmallCard({ card }) {
  const { exam, attempt } = card;
  const submitted = attempt?.status === "submitted";
  const missed = exam.status === "ended" && !attempt;
  let badge;
  if (submitted) {
    badge =
      attempt.percent !== null && attempt.percent !== undefined ? (
        <span className="text-right">
          <span className="block text-lg font-semibold text-ink">{formatNumber(attempt.percent)}%</span>
          <span className="block text-xs text-muted">
            {formatNumber(attempt.score)} / {formatNumber(attempt.max_score)}
          </span>
        </span>
      ) : (
        <Badge tone="success" icon={CheckCircle2}>
          Submitted
        </Badge>
      );
  } else if (missed) {
    badge = <Badge>Missed</Badge>;
  } else if (exam.status === "ended") {
    badge = <Badge tone="warning">Being submitted</Badge>;
  } else {
    badge = (
      <Badge tone="info" icon={Hourglass}>
        Not started yet
      </Badge>
    );
  }
  return (
    <Link
      to={`/student/exams/${exam.id}`}
      className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-line-strong hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <TypeIcon type={exam.type} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-ink">{exam.title}</div>
        <div className="text-[13px] text-muted">
          {submitted ? `Submitted ${timeAgo(attempt.submitted_at)}` : `${formatMinutes(exam.duration_minutes)} · ${exam.questions_per_set} questions`}
        </div>
      </div>
      {badge}
    </Link>
  );
}

const StudentDashboard = () => {
  const user = getUser();
  const [cards, setCards] = useState(null);

  usePolling(() => {
    studentApi
      .list()
      .then((data) => setCards(data.exams))
      .catch(() => setCards((current) => current ?? []));
  }, 8000);

  const groups = useMemo(() => {
    const live = [];
    const upcoming = [];
    const done = [];
    for (const card of cards || []) {
      if (card.attempt?.status === "submitted" || card.exam.status === "ended") done.push(card);
      else if (card.exam.status === "live") live.push(card);
      else upcoming.push(card);
    }
    return { live, upcoming, done };
  }, [cards]);

  return (
    <AppShell>
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-primary/10 to-transparent" />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar user={user} size="xl" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-muted">Welcome back</p>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{firstName(user?.name) || rollFromEmail(user?.email)}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {rollFromEmail(user?.email)} · {user?.email}
            </p>
          </div>
        </div>
      </Card>

      {cards === null ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={Inbox}
          title="No exams for you yet"
          description="When your teacher adds you to a viva, it shows up here. This page checks for new exams by itself."
        />
      ) : (
        <div className="mt-8 space-y-10">
          {groups.live.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                Live now
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {groups.live.map((card) => (
                  <LiveCard key={card.exam.id} card={card} />
                ))}
              </div>
            </section>
          )}
          {groups.upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                <CalendarClock className="h-4 w-4 text-muted" />
                Upcoming
              </h2>
              <div className={cn("grid gap-3", "md:grid-cols-2")}>
                {groups.upcoming.map((card) => (
                  <SmallCard key={card.exam.id} card={card} />
                ))}
              </div>
            </section>
          )}
          {groups.done.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                <CheckCircle2 className="h-4 w-4 text-muted" />
                Completed
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {groups.done.map((card) => (
                  <SmallCard key={card.exam.id} card={card} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
};

export default StudentDashboard;
