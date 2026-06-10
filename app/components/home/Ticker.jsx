"use client";
// Marquee strip below the hero. Renders metrics + production facts and
// scrolls left infinitely. Two copies of the content sit side-by-side so
// the loop is seamless. Pause on hover.
export default function Ticker({ items = [] }) {
  if (!items.length) return null;
  return (
    <div className="relative overflow-hidden border-y border-ink-200 bg-ink-100/70 py-2 group">
      <div className="ticker-track flex gap-10 whitespace-nowrap will-change-transform">
        {[...items, ...items].map((it, i) => (
          <span key={i} className="inline-flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider text-ink-600">
            <span className="h-1 w-1 rounded-full bg-royal-600 inline-block" aria-hidden />
            <span className="text-ink-900 font-semibold tabular-nums">{it.value}</span>
            <span>{it.label}</span>
          </span>
        ))}
      </div>
      {/* Edge fades — only visible when the row overflows. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-ink-100 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-ink-100 to-transparent" />
    </div>
  );
}
