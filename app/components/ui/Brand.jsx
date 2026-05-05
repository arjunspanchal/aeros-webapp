import Link from "next/link";

/**
 * Aeros wordmark. The single source of truth for the brand mark across the
 * shell top bar, mobile sheet, footer, and (Login Phase B) the brand panel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PLACEHOLDER STATE — text fallback in `font-logo` (Nunito Sans).
 * ─────────────────────────────────────────────────────────────────────────
 * The real wordmark is a refined display sans in #1E1E1E. When the official
 * SVG asset arrives at `public/Aeros.svg`, swap the inner `<span>` body for
 * inline-SVG content (read the file, paste the `<svg>` element as JSX,
 * remove width/height, set className={SIZE_SVG[size]}). No public-API
 * change for callers — `<Brand size>` continues to render the right thing.
 *
 * DO NOT propagate the text rendering elsewhere — Brand is the single
 * source of truth for the wordmark. New surfaces always import this
 * component.
 *
 * Sizes:
 *   sm — h-6   (mobile top bar, footer)
 *   md — h-8   (desktop top bar)
 *   lg — h-12+ (login brand panel, marketing surfaces)
 */

const SIZE_TEXT = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-display-md",
};

export function Brand({ size = "md", href = "/", className = "" }) {
  return (
    <Link
      href={href}
      aria-label="Aeros — home"
      className={`inline-flex items-center hover:opacity-80 transition-opacity ${className}`}
    >
      <span
        className={`font-logo font-bold text-ink-900 leading-none tracking-tight ${SIZE_TEXT[size]}`}
        aria-hidden="true"
      >
        Aeros
      </span>
    </Link>
  );
}
