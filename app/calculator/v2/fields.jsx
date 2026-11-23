"use client";
// Compact form controls for the calculator, in the app's editorial language:
// ink borders, royal focus ring, 4 px radius, mono numerics. Denser than the
// h-12 Input primitive because a costing form carries thirty-odd fields.

const CONTROL =
  "h-10 w-full rounded border border-ink-200 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-400 " +
  "focus:outline-none focus:border-royal-600 focus:ring-1 focus:ring-royal-600 disabled:bg-ink-50 disabled:text-ink-400";

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

/** Number input held as a string, so "blank" stays distinct from zero. */
export function Num({ label, hint, value, onChange, suffix, placeholder, className, ...rest }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <span className="relative block">
        <input
          type="number" inputMode="decimal" value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${CONTROL} font-mono ${suffix ? "pr-14" : ""}`}
          {...rest}
        />
        {suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-400">{suffix}</span> : null}
      </span>
    </Field>
  );
}

export function Text({ label, hint, value, onChange, placeholder, className }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={CONTROL} />
    </Field>
  );
}

/** options: [{ value, label }] or [{ group, options: [...] }] */
export function Select({ label, hint, value, onChange, options, className }) {
  const opt = (o) => <option key={o.value} value={o.value}>{o.label}</option>;
  return (
    <Field label={label} hint={hint} className={className}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={CONTROL}>
        {options.map((o) => (o.group ? <optgroup key={o.group} label={o.group}>{o.options.map(opt)}</optgroup> : opt(o)))}
      </select>
    </Field>
  );
}

export function Segmented({ label, value, onChange, options, className = "" }) {
  return (
    <div className={className}>
      {label ? <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span> : null}
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
              className={`h-10 rounded border px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600 focus-visible:ring-offset-1 ${on ? "border-ink-800 bg-ink-800 font-medium text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-ink-200 text-royal-600 focus:ring-royal-600" />
      <span className="text-sm text-ink-800">
        {label}
        {hint ? <span className="block text-xs text-ink-400">{hint}</span> : null}
      </span>
    </label>
  );
}

export function Section({ title, aside, children }) {
  return (
    <section className="border-t border-ink-200 px-5 py-5 first:border-t-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
        {aside ? <span className="min-w-0 text-xs text-ink-400">{aside}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

/** Rarely-changed settings, folded away. Blank fields fall back to the rate book. */
export function Advanced({ title = "Adjust rates for this quote", children }) {
  return (
    <details className="group border-t border-ink-200 px-5 py-4">
      <summary className="cursor-pointer list-none text-sm font-medium text-royal-600 hover:text-royal-700">
        <span className="group-open:hidden">+ {title}</span>
        <span className="hidden group-open:inline">− {title}</span>
      </summary>
      <p className="mt-2 text-xs text-ink-400">Leave a field blank to use the rate book.</p>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">{children}</div>
    </details>
  );
}

export const full = "col-span-2 sm:col-span-3";
