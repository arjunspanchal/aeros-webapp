/**
 * Editorial Badge — rounded (4px, NOT pill), text-xs, semantic variants
 * carry pale bg + saturated text. Set `mono` for numeric badges (job
 * counts, qty, etc.) where character alignment helps readability.
 *
 * Variants use Tailwind's default red/green/amber/blue palettes — there
 * are no semantic aliases (`bg-success`, etc.) in this codebase.
 */
const VARIANT_CLS = {
  default: "bg-ink-100 text-ink-800",
  success: "bg-green-50 text-green-800",
  warning: "bg-amber-50 text-amber-800",
  danger:  "bg-red-50 text-red-700",
  info:    "bg-blue-50 text-blue-800",
};

export function Badge({ variant = "default", mono = false, children, className = "", ...rest }) {
  const base = "inline-flex items-center rounded text-xs px-2 py-0.5 font-medium";
  const monoCls = mono ? "font-mono tracking-wider" : "";
  return (
    <span className={`${base} ${VARIANT_CLS[variant]} ${monoCls} ${className}`} {...rest}>
      {children}
    </span>
  );
}
