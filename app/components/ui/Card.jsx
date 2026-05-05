/**
 * Editorial Card — border-only, no shadow, ink-200 border, rounded-md.
 * For NEW surfaces only. Do NOT replace `app/calculator/_components/ui.jsx::Card`,
 * which has different visual rules (rounded-xl, shadow-sm) and 80+ existing
 * usages across calculator + factoryos + rate-cards. The two coexist by
 * import path:
 *
 *   import { Card } from "@/app/components/ui";              // editorial — this one
 *   import { Card } from "@/app/calculator/_components/ui";  // legacy
 *
 * Props:
 *   padded — default true. Set to false when the card wraps a table or any
 *            element that wants edge-to-edge layout.
 */
export function Card({ padded = true, className = "", children, ...rest }) {
  const base = "border border-ink-200 rounded-md bg-white";
  return (
    <div className={`${base} ${padded ? "p-6" : ""} ${className}`} {...rest}>
      {children}
    </div>
  );
}
