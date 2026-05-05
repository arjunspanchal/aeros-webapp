/**
 * Editorial Table primitives. Compositional, not opinionated about cell content.
 *
 * Six exports — drop-in for native <table>/<thead>/<tbody>/<tr>/<th>/<td>.
 * Pass `className="text-right font-mono"` on a TH/TD for numeric columns;
 * the primitives don't enforce numeric alignment automatically.
 *
 * Hover styling is scoped to body rows only via the `[&>tr:hover]` arbitrary
 * variant on TBody, so header rows don't shimmer on cursor pass.
 */

export function Table({ className = "", children, ...rest }) {
  return (
    <table className={`w-full text-sm ${className}`} {...rest}>
      {children}
    </table>
  );
}

export function THead({ className = "", children, ...rest }) {
  return (
    <thead className={className} {...rest}>
      {children}
    </thead>
  );
}

export function TBody({ className = "", children, ...rest }) {
  return (
    <tbody className={`[&>tr:hover]:bg-ink-50 ${className}`} {...rest}>
      {children}
    </tbody>
  );
}

export function TR({ className = "", children, ...rest }) {
  return (
    <tr className={className} {...rest}>
      {children}
    </tr>
  );
}

export function TH({ className = "", children, ...rest }) {
  return (
    <th
      className={`text-xs uppercase tracking-wide text-ink-400 font-medium text-left py-2 px-3 ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({ className = "", children, ...rest }) {
  return (
    <td className={`py-3 px-3 text-ink-800 border-t border-ink-200 ${className}`} {...rest}>
      {children}
    </td>
  );
}
