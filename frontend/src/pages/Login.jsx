import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { FlaskConical } from "lucide-react";
import { ExamifyMark, ThemeToggle } from "../components/layout/AppShell";
import { authApi, reachableBackend } from "../lib/api";
import { clearSession, getToken, getUser, homeFor } from "../lib/auth";

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

/** The front page: the name, what it's for, and Google sign-in. Nothing else. */
const Login = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    // Sent here because the server stopped accepting the sign-in: drop it and sign in again.
    if (params.get("expired")) {
      clearSession();
      return;
    }
    const user = getUser();
    if (user && getToken()) navigate(homeFor(user), { replace: true });
  }, [navigate, params]);

  useEffect(() => {
    if (params.get("expired")) toast("Your session expired. Please sign in again.", { id: "expired" });
  }, [params]);

  const signIn = async () => {
    // A random state, checked on the way back, so a stray login link can't sign you in.
    const state = crypto.randomUUID();
    sessionStorage.setItem("oauth_state", state);
    window.location.href = authApi.googleLoginUrl(state, await reachableBackend());
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <main className="w-full max-w-sm rounded-2xl border border-line bg-surface px-8 py-10 text-center shadow-card">
        <ExamifyMark className="mx-auto h-16 w-16 drop-shadow-sm" />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-ink">Examify</h1>
        <p className="mt-2 text-[15px] text-muted">CSE – Proctored Lab Exam Application</p>
        <button
          type="button"
          onClick={signIn}
          className="mt-9 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface text-[15px] font-semibold text-ink shadow-sm transition hover:border-line-strong hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:translate-y-px"
        >
          <GoogleMark />
          Sign in with Google
        </button>
        {import.meta.env.DEV && (
          <Link
            to="/dev"
            className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-dashed border-warning/50 bg-warning-soft px-4 py-2.5 text-[13px] font-medium text-warning-text transition hover:border-warning"
          >
            <FlaskConical className="h-4 w-4" />
            Developer login (local testing only)
          </Link>
        )}
      </main>
    </div>
  );
};

export default Login;
