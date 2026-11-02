import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap, LogOut, Moon, Sun } from "lucide-react";
import { clearSession, getUser, homeFor } from "../../lib/auth";
import { cn } from "../../lib/cn";
import { initials, rollFromEmail } from "../../lib/format";
import { useTheme } from "../../lib/hooks";
import { IconButton } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Menu } from "../ui/Overlay";

export function Logo({ compact = false, className }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-primary to-violet-500 text-white shadow-sm ring-1 ring-inset ring-white/20">
        <GraduationCap className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </span>
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
