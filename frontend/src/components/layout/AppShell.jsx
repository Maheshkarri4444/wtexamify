import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Moon, Sun } from "lucide-react";
import { clearSession, getUser, homeFor } from "../../lib/auth";
import { cn } from "../../lib/cn";
import { initials, rollFromEmail } from "../../lib/format";
import { useTheme } from "../../lib/hooks";
import { IconButton } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Menu } from "../ui/Overlay";

/** Examify's mark: an exam sheet with a check, on an indigo-to-violet tile. Same as public/examify.svg. */
export function ExamifyMark({ className }) {
  const tile = useId(); // one gradient per copy, so several marks on a page don't clash
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${tile})`} />
      <path d="M22 12h15l9 9v27a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z" fill="#fff" />
      <path d="M37 12v6a3 3 0 0 0 3 3h6Z" fill="#c7d2fe" />
      <rect x="23" y="22" width="9" height="3" rx="1.5" fill="#c7d2fe" />
      <rect x="23" y="28" width="15" height="3" rx="1.5" fill="#c7d2fe" />
      <path d="M24.5 40.5l4.5 4.5 9.5-10.5" fill="none" stroke="#4f46e5" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ compact = false, className }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <ExamifyMark className="h-8 w-8 drop-shadow-sm" />
      {!compact && (
        <span className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold tracking-tight text-ink">Examify</span>
          <span className="rounded-md bg-primary-soft px-1.5 py-px text-[10px] font-semibold text-primary-text">2.0</span>
        </span>
      )}
    </span>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <IconButton
      icon={theme === "dark" ? Sun : Moon}
      label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      size="sm"
    />
  );
}

// RGUKT students have a photo on the intranet; everyone else gets their Google picture or initials.
function avatarSource(user) {
  if (user?.role === "student" && user.email?.endsWith("@rguktn.ac.in")) {
    const id = user.email.split("@")[0];
    return `https://intranet.rguktn.ac.in/SMS/usrphotos/user/${id.charAt(0).toUpperCase()}${id.slice(1)}.jpg`;
  }
  return user?.image || "";
}

export function Avatar({ user, size = "md", className }) {
  const [failed, setFailed] = useState(false);
  const src = avatarSource(user);
  const sizes = { sm: "h-7 w-7 text-[11px]", md: "h-8 w-8 text-xs", lg: "h-14 w-14 text-base", xl: "h-16 w-16 text-lg" };
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary-text ring-2 ring-surface", sizes[size], className)}>
      {src && !failed ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        initials(user?.name, user?.email)
      )}
    </span>
  );
}

function UserMenu({ user }) {
  const navigate = useNavigate();
  return (
    <Menu
      width="w-64"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" aria-label="Account menu">
          <Avatar user={user} />
        </button>
      )}
      items={[
        {
          heading: (
            <span className="block normal-case tracking-normal">
              <span className="block truncate text-sm font-semibold text-ink">{user?.name || rollFromEmail(user?.email)}</span>
              <span className="block truncate text-xs font-normal text-muted">{user?.email}</span>
              <Badge tone={user?.role === "teacher" ? "primary" : "info"} className="mt-2 capitalize">
                {user?.role}
              </Badge>
            </span>
          ),
        },
        "divider",
        {
          label: "Sign out",
          icon: LogOut,
          onSelect: () => {
            clearSession();
            navigate("/login", { replace: true });
          },
        },
      ]}
    />
  );
}

export function AppShell({ children, wide = false }) {
  const user = getUser();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-xl">
        <div className={cn("mx-auto flex h-14 items-center gap-4 px-4 sm:px-6 lg:px-8", wide ? "max-w-[1440px]" : "max-w-7xl")}>
          <Link to={homeFor(user)} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
            <Logo />
          </Link>
          <span className="hidden text-sm text-muted sm:block">{user?.role === "teacher" ? "Teacher workspace" : "Student"}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </div>
      </header>
      <main className={cn("mx-auto w-full px-4 pb-20 pt-6 sm:px-6 sm:pt-8 lg:px-8", wide ? "max-w-[1440px]" : "max-w-7xl")}>{children}</main>
    </div>
  );
}
