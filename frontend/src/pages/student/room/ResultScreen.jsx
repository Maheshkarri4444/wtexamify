import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, ScrollText } from "lucide-react";
import { Logo, ThemeToggle } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { SUBMIT_REASONS } from "../../../lib/format";

/** After submitting: a confirmation only. Students never see a score; their teacher has every mark. */
export default function ResultScreen({ info, state }) {
  const internal = info.type === "internal";
  const reason = state.submit_reason && state.submit_reason !== "submitted" ? SUBMIT_REASONS[state.submit_reason] : null;

  return (
    <div className="min-h-screen bg-canvas bg-dots">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <Card className="animate-scale-in overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 via-transparent to-violet-500/10 px-6 pb-8 pt-10 text-center sm:px-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft text-success-text">
              {internal ? <ScrollText className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{internal ? "Question paper closed" : "Exam submitted"}</h1>
            <p className="mt-1 text-sm text-muted">{info.title}</p>
            {reason && (
              <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-[13px] font-medium text-warning-text">
                <AlertTriangle className="h-3.5 w-3.5" />
                {reason}
              </div>
            )}
            <p className="mx-auto mt-6 max-w-sm text-[15px] leading-relaxed text-ink-2">
              {internal ? "You're done. Your teacher marks your programs separately." : "Your answers are in. You can close this page now."}
            </p>
          </div>
          <div className="flex justify-center border-t border-line px-6 py-4">
            <Link to="/student" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink shadow-sm hover:bg-primary/90">
              <ArrowLeft className="h-4 w-4" />
              Back to my exams
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}
