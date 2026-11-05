import { ScrollText, Send } from "lucide-react";
import { ContextSection } from "../../../components/exam/DataText";
import { DifficultyBadge, QuestionText } from "../../../components/exam/ExamBits";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { cn } from "../../../lib/cn";
import { formatNumber, pluralize } from "../../../lib/format";
import { RoomHeader } from "./ExamScreen";

/** An internal: the student's question paper, read here and answered in the lab. */
export default function PaperScreen({ info, state, setContext, questions, stream, offsetRef, onExpire, onSubmit, onTools }) {
  const marks = questions.reduce((sum, q) => sum + q.marks, 0);
  return (
    <div className={cn("min-h-screen bg-canvas", info.requirements.block_clipboard && "no-select")}>
      <RoomHeader info={info} state={state} stream={stream} offsetRef={offsetRef} onExpire={onExpire} onSubmit={onSubmit} onTools={onTools} submitLabel="Finish" />

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-sm">
            <ScrollText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-primary-text">Question paper</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">{info.title}</h1>
            {questions.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                {pluralize(questions.length, "question")} · {formatNumber(marks)} marks in all
              </p>
            )}
          </div>
        </div>

        {info.instructions && (
          <div className="mt-6 rounded-xl border border-line bg-subtle/50 p-4">
            <div className="text-[13px] font-semibold text-ink">From your teacher</div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{info.instructions}</p>
          </div>
        )}

        {questions.length > 0 && (setContext || info.context) && (
          <div className="mt-6 space-y-3">
            <ContextSection title="Tables and data for your set" text={setContext} definitions={false} />
            <ContextSection title="Tables and data for every question" text={info.context} definitions={false} />
          </div>
        )}

        <ol className="mt-6 space-y-4">
          {questions.map((question, i) => (
            <li key={question.id}>
              <Card className="animate-fade-in p-5 sm:p-7">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold tabular-nums text-primary-text">{i + 1}</span>
                  <DifficultyBadge difficulty={question.difficulty} />
                  <span className="ml-auto text-xs font-medium text-muted">{pluralize(question.marks, "mark")}</span>
                </div>
                <QuestionText text={question.text} className="text-[16px] leading-relaxed text-ink" />
                {question.context && <ContextSection title="Tables and data for this question" text={question.context} definitions={false} className="mt-4" />}
              </Card>
            </li>
          ))}
        </ol>

        {questions.length > 0 && (
          <div className="mt-10 flex flex-col items-center gap-2.5 text-center">
            <Button size="lg" icon={Send} onClick={onSubmit}>
              I'm done, close the paper
            </Button>
            <p className="max-w-sm text-xs leading-relaxed text-muted">Write your programs the way your teacher asked. Closing the paper only records that you've finished.</p>
          </div>
        )}
      </main>
    </div>
  );
}
