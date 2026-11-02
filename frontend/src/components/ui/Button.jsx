import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

const VARIANTS = {
  primary: "bg-primary text-primary-ink shadow-sm hover:bg-primary/90",
  secondary: "border border-line bg-surface text-ink shadow-sm hover:border-line-strong hover:bg-subtle",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink",
  soft: "bg-primary-soft text-primary-text hover:bg-primary/15",
  danger: "bg-danger text-white shadow-sm hover:bg-danger/90",
  "danger-soft": "bg-danger-soft text-danger-text hover:bg-danger/15",
};

const SIZES = {
  xs: "h-7 gap-1 rounded-md px-2 text-xs",
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
  lg: "h-12 gap-2 rounded-xl px-6 text-[15px]",
};

const ICON_SIZES = { xs: "h-7 w-7 rounded-md", sm: "h-8 w-8 rounded-lg", md: "h-10 w-10 rounded-lg", lg: "h-12 w-12 rounded-xl" };

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

export function Button({ variant = "primary", size = "md", icon: Icon, iconRight: IconRight, loading = false, className, children, type = "button", disabled, ...props }) {
  return (
    <button type={type} disabled={disabled || loading} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" strokeWidth={2.2} /> : null}
      {children}
      {IconRight && !loading ? <IconRight className="h-4 w-4" /> : null}
    </button>
  );
}

export function IconButton({ icon: Icon, label, variant = "ghost", size = "md", className, type = "button", ...props }) {
  return (
    <button type={type} aria-label={label} title={label} className={cn(BASE, VARIANTS[variant], ICON_SIZES[size], className)} {...props}>
      <Icon className="h-4 w-4" />
    </button>
  );
}
