import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Logo } from "../components/layout/AppShell";
import { Spinner } from "../components/ui/Feedback";
import { authApi } from "../lib/api";
import { clearSession, homeFor, setSession } from "../lib/auth";

const GoogleCallback = () => {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const expected = sessionStorage.getItem("oauth_state");
    sessionStorage.removeItem("oauth_state");

    if (!code || (expected && params.get("state") !== expected)) {
      toast.error("That sign-in link isn't valid. Please try again.");
      navigate("/login", { replace: true });
      return;
    }

    authApi
      .googleCallback(code)
      .then(({ token, user }) => {
        setSession(token, user);
        toast.success(`Welcome, ${user.name?.split(" ")[0] || "back"}!`);
        navigate(homeFor(user), { replace: true });
      })
      .catch((error) => {
        clearSession();
        if (error.status === 403) {
          navigate("/not-allowed", { replace: true });
          return;
        }
        toast.error("Sign-in failed. Please try again.");
        navigate("/login", { replace: true });
      });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas">
      <Logo />
      <div className="flex items-center gap-2.5 text-sm text-muted">
        <Spinner className="h-4 w-4 text-primary" />
        Signing you in…
      </div>
    </div>
  );
};

export default GoogleCallback;
