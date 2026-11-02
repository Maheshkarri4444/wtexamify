import { Link } from "react-router-dom";
import { ShieldX } from "lucide-react";
import { Logo } from "../components/layout/AppShell";

const NotAllowed = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
    <Logo />
    <div className="mt-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger-text">
      <ShieldX className="h-7 w-7" />
    </div>
    <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">This account can't use Examify</h1>
    <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted">
      Students need to sign in with their <span className="font-medium text-ink-2">@rguktn.ac.in</span> Google account. Teachers need their email approved first.
    </p>
    <Link to="/login" className="mt-8 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink shadow-sm hover:bg-primary/90">
      Try another account
    </Link>
  </div>
);

export default NotAllowed;
