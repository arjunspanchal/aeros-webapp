/**
 * Empty state — vertically centered block for "no data yet" surfaces.
 * Title in mono ink-400, description in sans ink-600, optional action below.
 *
 * Title text examples that read well in mono:
 *   "No jobs yet."   "Nothing to pack today."   "0 quotes saved."
 */
export function EmptyState({ title, description, action, className = "" }) {
  return (
    <div className={`py-16 max-w-sm mx-auto text-center ${className}`}>
      <p className="font-mono text-lg text-ink-400">{title}</p>
      {description && <p className="mt-2 text-sm text-ink-600">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
