import { forwardRef } from "react";

/**
 * Editorial Input primitive — h-12, visible label above (no floating labels),
 * royal focus ring, red border + helper line on error. Mono variant for codes,
 * IDs, and numeric input where character alignment matters. Light-only.
 *
 * Props:
 *   label   — required-ish (visible, above the input). Pass empty string only
 *             if you have a separate label element above this component.
 *   type    — "text" | "email" | "tel" | "number" | "password"
 *   mono    — sets font-mono + tighter tracking. Default false.
 *   error   — when set, swaps border to danger and shows the message below.
 *   helper  — sub-label below the input. Hidden when `error` is set.
 *
 * Forwards a ref to the underlying <input> for focus management
 * (e.g. OTP cell distribution).
 */

const INPUT_BASE =
  "h-12 w-full px-3 rounded border bg-white text-ink-800 placeholder:text-ink-400 " +
  "focus:outline-none";

const STATE_DEFAULT =
  "border-ink-200 focus:border-royal-600 focus:ring-1 focus:ring-royal-600";

const STATE_ERROR =
  "border-red-600 focus:border-red-600 focus:ring-1 focus:ring-red-600";

function deriveId(label) {
  if (typeof label !== "string" || !label) return undefined;
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const Input = forwardRef(function Input(
  { label, type = "text", mono = false, error, helper, id, className = "", ...rest },
  ref,
) {
  const inputId = id || deriveId(label);
  const stateCls = error ? STATE_ERROR : STATE_DEFAULT;
  const monoCls = mono ? "font-mono tracking-wider" : "";
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm text-ink-600 mb-1.5">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        type={type}
        aria-invalid={error ? "true" : undefined}
        className={`${INPUT_BASE} ${stateCls} ${monoCls} ${className}`}
        {...rest}
      />
      {error ? (
        <p className="text-xs text-red-600 mt-1.5">{error}</p>
      ) : helper ? (
        <p className="text-xs text-ink-400 mt-1.5">{helper}</p>
      ) : null}
    </div>
  );
});
