/**
 * Editorial Button primitive — royal CTA, ink-tinted secondary, ghost tertiary,
 * red danger. Never gold. For NEW surfaces only; existing inline button styles
 * across the app stay until their pages are rewritten.
 *
 * Variants:
 *   primary    — bg-royal-600,  hover royal-700, active royal-800
 *   secondary  — white + ink-200 border
 *   tertiary   — ghost (no border, ink-50 hover surface)
 *   danger     — red-600, hover red-700, active red-800
 *
 * Sizes: sm (h-9) / md (h-10) / lg (h-12)
 *
 * `loading` shows an inline spinner and disables interaction. The label stays
 * mounted at reduced opacity so the button width doesn't jump.
 */

const SIZE_CLS = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

const VARIANT_CLS = {
  primary:
    "bg-royal-600 text-white hover:bg-royal-700 active:bg-royal-800 focus-visible:ring-royal-600",
  secondary:
    "bg-white border border-ink-200 text-ink-800 hover:bg-ink-50 focus-visible:ring-royal-600",
  tertiary:
    "text-ink-600 hover:bg-ink-50 hover:text-ink-800 focus-visible:ring-royal-600",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-600",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded font-medium transition-colors duration-150 ease-out " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${SIZE_CLS[size]} ${VARIANT_CLS[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      <span className={loading ? "opacity-70" : ""}>{children}</span>
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
    </svg>
  );
}
