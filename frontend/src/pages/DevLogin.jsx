import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowRight, FlaskConical, GraduationCap, UserRound } from "lucide-react";
import { Logo, ThemeToggle } from "../components/layout/AppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, Input, Segmented } from "../components/ui/Form";
import { authApi } from "../lib/api";
import { homeFor, setSession } from "../lib/auth";

// Test identities for local development. They only exist in the dev database.
const PRESETS = [
  { email: "teacher@examify.test", name: "Test Teacher", role: "teacher" },
  ...Array.from({ length: 6 }, (_, i) => ({ email: `n29900${i + 1}@rguktn.ac.in`, name: `Test Student ${i + 1}`, role: "student" })),
];

const DevLogin = () => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState("");
  const [custom, setCustom] = useState({ email: "", name: "", role: "student" });

  const signIn = async ({ email, name, role }) => {
    setBusy(email);
    try {
      const { token, user } = await authApi.devLogin(email, role, name);
      setSession(token, user);
      navigate(homeFor(user), { replace: true });
    } catch (error) {
      toast.error(error.status === 404 ? "Dev login is off. Set APP_ENV=development in backend/.env." : error.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="min-h-screen bg-canvas bg-dots">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="mt-10 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning-soft text-warning-text">
            <FlaskConical className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Developer login</h1>
            <p className="text-sm text-muted">Sign in as a test teacher or student without Google. Works only on localhost with APP_ENV=development.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.email}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => signIn(preset)}
              className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop disabled:opacity-60"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
                {preset.role === "teacher" ? <GraduationCap className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{preset.name}</span>
                  <Badge tone={preset.role === "teacher" ? "primary" : "info"}>{preset.role}</Badge>
                </span>
                <span className="block truncate text-[13px] text-muted">{preset.email}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary-text" />
            </button>
          ))}
        </div>

        <Card className="mt-6 p-5">
          <h2 className="font-semibold text-ink">Someone else</h2>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              signIn(custom);
            }}
          >
            <Field label="Email">
              <Input required type="email" value={custom.email} onChange={(e) => setCustom({ ...custom, email: e.target.value })} placeholder="n210368@rguktn.ac.in" />
            </Field>
            <Field label="Name">
              <Input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Optional" />
            </Field>
            <Segmented
              value={custom.role}
              onChange={(role) => setCustom({ ...custom, role })}
              options={[
                { value: "student", label: "Student" },
                { value: "teacher", label: "Teacher" },
              ]}
              className="h-10 items-center"
            />
            <Button type="submit" loading={Boolean(busy) && busy === custom.email} className="sm:col-span-3">
              Sign in
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default DevLogin;
