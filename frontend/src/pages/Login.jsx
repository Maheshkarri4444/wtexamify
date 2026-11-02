import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Activity, FlaskConical, Layers3, ShieldCheck } from "lucide-react";
import { Logo, ThemeToggle } from "../components/layout/AppShell";
import { authApi } from "../lib/api";
import { getToken, getUser, homeFor } from "../lib/auth";

const FEATURES = [
  { icon: Layers3, title: "Unique sets for every student", text: "Built from your question bank, balanced by difficulty, dealt out before the exam." },
  { icon: ShieldCheck, title: "Proctored like NPTEL", text: "Fullscreen, entire-screen sharing and teacher codes for every lock and refresh." },
  { icon: Activity, title: "Live and graded on submit", text: "Watch every student live; scores and question analysis the moment they finish." },
];

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.4 3.62v3h3.88c2.27-2.1 3.57-5.19 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.92l-3.88-3c-1.07.72-2.45 1.15-4.05 1.15-3.12 0-5.76-2.1-6.7-4.94H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.3a12 12 0 0 0 0 10.78l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.3 6.61l4 3.1C6.24 6.87 8.88 4.77 12 4.77Z" />
    </svg>
  );
}

const Login = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const user = getUser();
    if (user && getToken()) navigate(homeFor(user), { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (params.get("expired")) toast("Your session expired. Please sign in again.", { id: "expired" });
  }, [params]);

  const signIn = () => {
    // A random state, checked on the way back, so a stray login link can't sign you in.
    const state = crypto.randomUUID();
    sessionStorage.setItem("oauth_state", state);
    window.location.href = authApi.googleLoginUrl(state);
  };

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#0f0d2e] p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-indigo-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-[-6rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/30 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative flex items-center gap-2.5">
          <Logo compact />
          <span className="text-lg font-bold tracking-tight">Examify</span>
          <span className="rounded-md bg-white/10 px-1.5 py-px text-[11px] font-semibold text-indigo-100 ring-1 ring-inset ring-white/15">2.0</span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <p className="text-sm font-medium text-indigo-200">RGUKT Nuzvid · Online exams</p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.1] tracking-tight">Vivas your students can't game, results you don't have to mark.</h1>
          <div className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
                  <Icon className="h-5 w-5 text-indigo-100" />
                </span>
                <div>
                  <div className="font-semibold">{title}</div>
                  <div className="mt-0.5 text-sm leading-relaxed text-indigo-100/80">{text}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-12 text-xs text-indigo-200/70">Used for real exams with 480+ students across Web Technologies, COA, DBMS and OS.</p>
        </div>
      </section>

      <section className="relative flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:invisible">
            <Logo />
          </span>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h2 className="text-[28px] font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">Students use their RGUKT Google account. Teachers use the account their access was set up with.</p>
          <button
            type="button"
            onClick={signIn}
            className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface text-[15px] font-semibold text-ink shadow-sm transition hover:border-line-strong hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:translate-y-px"
          >
            <GoogleMark />
            Continue with Google
          </button>
          <p className="mt-4 text-center text-xs leading-relaxed text-muted">
            Only <span className="font-medium text-ink-2">@rguktn.ac.in</span> accounts and approved teachers can sign in.
          </p>
          {import.meta.env.DEV && (
            <Link
              to="/dev"
              className="mt-10 flex items-center justify-center gap-2 rounded-xl border border-dashed border-warning/50 bg-warning-soft px-4 py-3 text-sm font-medium text-warning-text transition hover:border-warning"
            >
              <FlaskConical className="h-4 w-4" />
              Developer login (local testing only)
            </Link>
          )}
        </div>
        <p className="text-center text-xs text-muted">Examify · Built for RGUKT</p>
      </section>
    </div>
  );
};

export default Login;
