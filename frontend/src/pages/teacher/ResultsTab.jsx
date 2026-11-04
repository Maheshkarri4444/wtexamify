import { Fragment, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ArrowDownUp, BarChart3, ChevronDown, ClipboardList, Download, Flag, Hourglass, ListOrdered, RefreshCw, Search, Users } from "lucide-react";
import { DifficultyBadge, QuestionText, QuestionTypeBadge } from "../../components/exam/ExamBits";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Histogram, Meter, StatTile } from "../../components/ui/Data";
import { Callout, EmptyState, PageLoader } from "../../components/ui/Feedback";
import { Input, Segmented } from "../../components/ui/Form";
import { cn } from "../../lib/cn";
import { teacherApi } from "../../lib/api";
import { exportResults } from "../../lib/excel";
import { SUBMIT_REASONS, formatDateTime, formatNumber, formatSpan, languageLabel, letter, pluralize, scoreTone } from "../../lib/format";
import { usePolling } from "../../lib/hooks";
import AttemptDrawer from "./AttemptDrawer";

const BANDS = ["0", "10", "20", "30", "40", "50", "60", "70", "80", "90"];

function OptionSpread({ question }) {
  const total = question.option_counts.reduce((sum, n) => sum + n, 0) || 1;
  return (
    <div className="space-y-1.5 py-1">
      {question.options.map((option, i) => {
        const correct = question.correct.includes(i);
        const share = (question.option_counts[i] / total) * 100;
        return (
          <div key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)_7rem_3rem] items-center gap-3 text-[13px]">
            <span className="font-semibold text-muted">{letter(i)}</span>
            <span className={cn("truncate", correct ? "font-medium text-success-text" : "text-ink-2")}>
              {option}
              {correct && " ✓"}
            </span>
            <Meter value={share} tone={correct ? "primary" : "neutral"} label={`Option ${letter(i)} picked`} />
            <span className="text-right tabular-nums text-muted">{question.option_counts[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

/** How the AI rated everyone's code for one question. */
function CodeSpread({ question }) {
  const parts = [
    [question.correct_count, "full marks"],
    [question.partial, "partly right"],
    [question.wrong, "zero"],
    [question.unanswered, "blank"],
    [question.pending, "waiting for the AI"],
  ].filter(([count]) => count > 0);
  return (
    <p className="text-[13px] text-muted">
      {parts.map(([count, label]) => `${count} ${label}`).join(" · ")}. Average {formatNumber(question.avg_awarded)} of {formatNumber(question.marks)} marks.
    </p>
  );
}

function SearchBar({ query, setQuery, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search students" className="h-9 pl-9" />
      </div>
      {children}
    </div>
  );
}

const matches = (row, query) => !query || row.email.includes(query) || row.roll.toLowerCase().includes(query) || row.name?.toLowerCase().includes(query);

const StudentCell = ({ row }) => (
  <td className="py-3 pl-5">
    <div className="font-medium tabular-nums text-ink">{row.roll}</div>
    <div className="max-w-[14rem] truncate text-xs text-muted">{row.name || row.email}</div>
  </td>
);

/** Internals aren't marked here, so the results are an attendance sheet. */
function Attendance({ exam, data, onOpen }) {
  const [query, setQuery] = useState("");
  const summary = data.summary;
  const writing = data.rows.filter((r) => r.status === "in_progress").length;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((r) => matches(r, q));
  }, [data.rows, query]);

  if (!data.rows.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Nobody has opened the paper yet"
        description={exam.status === "live" ? "Students appear here the moment they start. This page refreshes on its own." : "Once students write the internal, you'll see who opened the paper and when they finished."}
      />
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Opened the paper" value={summary.attempts} hint={`of ${pluralize(summary.allowed, "student")}`} icon={Users} tone="primary" />
        <StatTile label="Finished" value={summary.submitted} />
        <StatTile label="Still writing" value={writing} />
        <StatTile label="Haven't started" value={Math.max(0, summary.allowed - summary.attempts)} />
      </div>
      <Callout title="Internals aren't marked in Examify">
        Students see the questions here and write the programs in their lab setup. This sheet shows who opened the paper, which set they got and when they finished.
      </Callout>
      <Card>
        <SearchBar query={query} setQuery={setQuery}>
          <Button size="sm" variant="secondary" icon={Download} onClick={() => exportResults(exam.title, data.rows, [], exam.type)}>
            Export to Excel
          </Button>
        </SearchBar>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2.5 pl-5 font-medium">Student</th>
                <th className="px-3 py-2.5 font-medium">Set</th>
                <th className="px-3 py-2.5 font-medium">Started</th>
                <th className="px-3 py-2.5 font-medium">Finished</th>
                <th className="px-3 py-2.5 font-medium">Time spent</th>
                <th className="px-3 py-2.5 font-medium">Violations</th>
                <th className="py-2.5 pr-5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.email} onClick={() => onOpen(row.attempt_id)} className="cursor-pointer transition hover:bg-subtle/60">
                  <StudentCell row={row} />
                  <td className="px-3 py-3 tabular-nums text-ink-2">{row.set}</td>
                  <td className="px-3 py-3 text-ink-2">{formatDateTime(row.started_at)}</td>
                  <td className="px-3 py-3 text-ink-2">{formatDateTime(row.submitted_at)}</td>
                  <td className="px-3 py-3 text-ink-2">{row.submitted_at ? formatSpan(new Date(row.submitted_at) - new Date(row.started_at)) : "—"}</td>
                  <td className={cn("px-3 py-3 tabular-nums", row.violations ? "font-medium text-danger-text" : "text-muted")}>{row.violations}</td>
                  <td className="py-3 pr-5">
                    {row.status === "submitted" ? (
                      <Badge tone={row.submit_reason === "submitted" ? "success" : "warning"}>{row.submit_reason === "submitted" ? "Finished" : SUBMIT_REASONS[row.submit_reason]}</Badge>
                    ) : (
                      <Badge tone="info" dot pulse>
                        Writing
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MarkedResults({ exam, data, onOpen }) {
  const external = exam.type === "external";
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("roll");
  const [view, setView] = useState("students");
  const [openQuestion, setOpenQuestion] = useState(null);

  const submitted = useMemo(() => data.rows.filter((r) => r.status === "submitted"), [data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = submitted.filter((r) => matches(r, q));
    return list.sort((a, b) => (sort === "score" ? b.percent - a.percent || a.email.localeCompare(b.email) : a.email.localeCompare(b.email)));
  }, [submitted, query, sort]);
  const shownQuestions = useMemo(() => data.questions.filter((q) => q.shown > 0), [data]);
  const checking = submitted.filter((r) => r.grading === "pending").length;
  const failed = submitted.filter((r) => r.grading === "failed").length;
  const summary = data.summary;

  if (!submitted.length) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No submissions yet"
        description={exam.status === "live" ? "Results appear here the moment students submit. This page refreshes on its own." : "Once students write the exam, their scores and a question-by-question analysis show up here."}
      />
    );
  }

  return (
    <div className="space-y-6">
      {checking > 0 && (
        <Callout icon={Hourglass} title={`AI is still checking ${pluralize(checking, "answer sheet")}`}>
          Their scores go up as each check finishes, and this page refreshes on its own. Averages below include them as they are now.
        </Callout>
      )}
      {failed > 0 && (
        <Callout tone="danger" title={`${pluralize(failed, "answer sheet")} couldn't be checked`}>
          The AI kept failing on {failed === 1 ? "it" : "them"}. Open the sheet and press “Re-check with AI”, or set the marks yourself.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Submitted" value={summary.submitted} hint={`of ${pluralize(summary.allowed, "student")}`} icon={Users} tone="primary" />
        <StatTile label="Average" value={`${formatNumber(summary.average)}%`} />
        <StatTile label="Median" value={`${formatNumber(summary.median)}%`} />
        <StatTile label="Highest" value={`${formatNumber(summary.highest)}%`} />
        <StatTile label="Lowest" value={`${formatNumber(summary.lowest)}%`} />
      </div>

      <Card>
        <CardHeader icon={BarChart3} title="Score distribution" description="Students per 10% band. Hover a column for the count." />
        <div className="px-5 pb-5 pt-6">
          <Histogram
            bins={summary.distribution}
            labels={BANDS}
            tooltip={(i, count) => ({ value: pluralize(count, "student"), label: i === 9 ? "90–100%" : `${i * 10}–${i * 10 + 9}%` })}
          />
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "students", label: "Students", icon: Users, count: submitted.length },
            { value: "questions", label: "Questions", icon: ListOrdered, count: shownQuestions.length },
          ]}
        />
        <Button variant="secondary" icon={Download} onClick={() => exportResults(exam.title, data.rows, data.questions, exam.type)}>
          Export to Excel
        </Button>
      </div>

      {view === "students" ? (
        <Card>
          <SearchBar query={query} setQuery={setQuery}>
            <Button size="sm" variant="ghost" icon={ArrowDownUp} onClick={() => setSort(sort === "roll" ? "score" : "roll")}>
              {sort === "roll" ? "Sorted by roll number" : "Sorted by score"}
            </Button>
          </SearchBar>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2.5 pl-5 font-medium">Student</th>
                  <th className="px-3 py-2.5 font-medium">Set</th>
                  <th className="px-3 py-2.5 text-right font-medium">Score</th>
                  <th className="w-44 px-3 py-2.5 font-medium">Percent</th>
                  <th className="px-3 py-2.5 font-medium">Violations</th>
                  <th className="px-3 py-2.5 font-medium">Time taken</th>
                  <th className="py-2.5 pr-5 font-medium">Submitted because</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.email} onClick={() => onOpen(row.attempt_id)} className="cursor-pointer transition hover:bg-subtle/60">
                    <StudentCell row={row} />
                    <td className="px-3 py-3 tabular-nums text-ink-2">{row.set}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-ink">
                      {formatNumber(row.score)} <span className="font-normal text-muted">/ {formatNumber(row.max_score)}</span>
                      {row.grading === "pending" && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-normal text-info-text">
                          <Hourglass className="h-3 w-3" />
                          AI checking
                        </div>
                      )}
                      {row.grading === "failed" && <div className="mt-0.5 text-[11px] font-normal text-danger-text">Check failed</div>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <Meter value={row.percent} tone={scoreTone(row.percent)} label={`${row.roll} score`} className="flex-1" />
                        <span className="w-10 text-right text-xs tabular-nums text-ink-2">{formatNumber(row.percent)}%</span>
                      </div>
                    </td>
                    <td className={cn("px-3 py-3 tabular-nums", row.violations ? "font-medium text-danger-text" : "text-muted")}>
                      {row.violations}
                      {row.refreshes > 0 && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-normal text-muted">
                          <RefreshCw className="h-3 w-3" />
                          {row.refreshes}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink-2">{row.started_at && row.submitted_at ? formatSpan(new Date(row.submitted_at) - new Date(row.started_at)) : "—"}</td>
                    <td className="py-3 pr-5">
                      <Badge tone={row.submit_reason === "submitted" ? "neutral" : row.submit_reason === "violations" ? "danger" : "warning"}>{SUBMIT_REASONS[row.submit_reason] || "—"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader
            icon={ListOrdered}
            title="How each question did"
            description={
              external
                ? "The average AI correctness of everyone's code. Under 30% is flagged: the question may be unclear, or the topic needs revising."
                : "Questions under 30% correct are flagged: they may be badly worded, or the topic needs revising. Click one to see which options students picked."
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2.5 pl-5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Question</th>
                  <th className="px-3 py-2.5 font-medium">Shown</th>
                  <th className="w-52 px-3 py-2.5 font-medium">{external ? "Average correctness" : "Correct"}</th>
                  <th className="w-10 py-2.5 pr-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shownQuestions.map((q) => {
                  const code = q.type === "code";
                  const pct = code ? q.avg_percent : (q.correct_count / q.shown) * 100;
                  const open = openQuestion === q.id;
                  return (
                    <Fragment key={q.id}>
                      <tr onClick={() => setOpenQuestion(open ? null : q.id)} className="cursor-pointer align-top transition hover:bg-subtle/60">
                        <td className="py-3 pl-5 font-medium tabular-nums text-muted">Q{q.number}</td>
                        <td className="px-3 py-3">
                          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                            {code ? <Badge tone="primary">{languageLabel(q.language)}</Badge> : <QuestionTypeBadge type={q.type} />}
                            <DifficultyBadge difficulty={q.difficulty} />
                            {pct !== null && pct < 30 && (
                              <Badge tone="danger" icon={Flag}>
                                Review
                              </Badge>
                            )}
                          </div>
                          <QuestionText text={q.text} className="line-clamp-2 text-ink" />
                        </td>
                        <td className="px-3 py-3 tabular-nums text-ink-2">{q.shown}</td>
                        <td className="px-3 py-3">
                          {pct === null ? (
                            <span className="text-xs text-muted">Waiting for the AI</span>
                          ) : (
                            <div className="flex items-center gap-2.5">
                              <Meter value={pct} tone={scoreTone(pct)} label={`Q${q.number} ${code ? "average correctness" : "answered correctly"}`} className="flex-1" />
                              <span className="w-10 text-right text-xs tabular-nums text-ink-2">{Math.round(pct)}%</span>
                            </div>
                          )}
                          <div className="mt-1 text-[11px] text-muted">
                            {q.partial > 0 && `${q.partial} partly · `}
                            {q.wrong} {code ? "zero" : "wrong"} · {q.unanswered} blank
                            {q.pending > 0 && ` · ${q.pending} checking`}
                          </div>
                        </td>
                        <td className="py-3 pr-5">
                          <ChevronDown className={cn("h-4 w-4 text-muted transition", open && "rotate-180")} />
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-subtle/40">
                          <td />
                          <td colSpan={4} className="px-3 pb-4 pt-1">
                            {code ? (
                              <CodeSpread question={q} />
                            ) : q.type === "fill" ? (
                              <p className="text-[13px] text-muted">
                                Accepted: <span className="font-medium text-success-text">{q.answers.join(" | ")}</span>
                              </p>
                            ) : (
                              <OptionSpread question={q} />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function ResultsTab() {
  const { bundle } = useOutletContext();
  const { exam } = bundle;
  const [data, setData] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = () =>
    teacherApi
      .results(exam.id)
      .then(setData)
      .catch(() => setData((current) => current ?? { rows: [], questions: [], summary: {} }));
  const checking = data?.rows.some((r) => r.grading === "pending");
  usePolling(load, exam.status === "live" || checking ? 10000 : 60000);

  if (!data) return <PageLoader label="Marking up the results…" />;
  return (
    <>
      {exam.type === "internal" ? <Attendance exam={exam} data={data} onOpen={setViewing} /> : <MarkedResults exam={exam} data={data} onOpen={setViewing} />}
      <AttemptDrawer examId={exam.id} examType={exam.type} attemptId={viewing} onClose={() => setViewing(null)} onChanged={load} />
    </>
  );
}
