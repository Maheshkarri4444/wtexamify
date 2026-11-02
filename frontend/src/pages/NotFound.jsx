import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Logo } from "../components/layout/AppShell";
import { getUser, homeFor } from "../lib/auth";

const NotFound = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
    <Logo />
    <div className="mt-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-text">
      <Compass className="h-7 w-7" />
    </div>
    <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">This page doesn't exist</h1>
    <p className="mt-2 max-w-md text-[15px] text-muted">The link may be old, or the exam may have been deleted.</p>
    <Link to={homeFor(getUser())} className="mt-8 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink shadow-sm hover:bg-primary/90">
      Go home
    </Link>
  </div>
);

export default NotFound;
