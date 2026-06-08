// "Know your straw range" — a static, educational section explaining the two
// straw materials and how to read bore / length. Server component (no
// interactivity). Illustrations are inline, monochrome SVG line art to match the
// Aeros brand.

const GUIDE = [
  {
    code: "Paper",
    name: "Paper Straws",
    blurb:
      "Spiral-wound from FDA-grade paper — sturdy, soda-resistant and home-compostable. The standard plastic-straw replacement for cold drinks.",
    feel: "Firm, holds shape",
    bestFor: "Soft drinks, juices, cocktails, QSR",
    sizing: "Ø6 – Ø12 mm · 8\" – 10\"",
  },
  {
    code: "Rice",
    name: "Rice Straws",
    blurb:
      "Extruded from rice flour and tapioca starch — firmer than paper with no sogginess, and edible / fully compostable. A premium plant-based option.",
    feel: "Rigid, no sog",
    bestFor: "Smoothies, bubble tea, cold brew",
    sizing: "Ø6.5 – Ø13 mm · 20 – 24 cm",
  },
];

const BORE_GUIDE = [
  { dia: "6 mm", use: "Water, soft drinks, juice" },
  { dia: "8 mm", use: "Iced coffee, milkshakes" },
  { dia: "10 mm", use: "Thick shakes, smoothies" },
  { dia: "12 – 13 mm", use: "Bubble tea, tapioca pearls" },
];

export function StrawGuide() {
  return (
    <section id="guide" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Know your straw range</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Two plastic-free straw materials — paper and rice — across the common bore diameters and
        lengths. Straws are sized by <strong className="text-ink-900">bore</strong> (the inner
        drinking diameter, in mm) and <strong className="text-ink-900">length</strong>. A wider bore
        suits thicker drinks; rice straws stay firmer for longer.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {GUIDE.map((g) => (
          <article key={g.code} className="rounded-md border border-ink-200 bg-white p-4">
            <div className="flex h-28 w-full items-center justify-center rounded border border-ink-100 bg-ink-50">
              <Illustration code={g.code} />
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white">
                  {g.code}
                </span>
                <h3 className="truncate text-sm font-bold text-ink-900">{g.name}</h3>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{g.blurb}</p>
              <dl className="mt-2 space-y-0.5 text-xs">
                <GuideRow label="Feel">{g.feel}</GuideRow>
                <GuideRow label="Best for">{g.bestFor}</GuideRow>
                <GuideRow label="Sizes">{g.sizing}</GuideRow>
              </dl>
            </div>
          </article>
        ))}
      </div>

      {/* Bore quick-reference */}
      <div className="mt-6 rounded-md border border-ink-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-ink-400">Choosing a bore</p>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {BORE_GUIDE.map((b) => (
            <div key={b.dia} className="flex gap-3 text-xs">
              <dt className="w-20 shrink-0 font-mono font-medium text-ink-900">{b.dia}</dt>
              <dd className="text-ink-600">{b.use}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-6 max-w-2xl text-xs text-ink-500">
        All straws are supplied plain (unprinted). Choose <strong className="text-ink-500">bulk</strong>{" "}
        bagged for in-house use, or <strong className="text-ink-500">individually paper-wrapped</strong>{" "}
        for hygiene and takeaway. Custom-printed wrappers available on request.
      </p>
    </section>
  );
}

function GuideRow({ label, children }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-ink-400">{label}</dt>
      <dd className="text-ink-800">{children}</dd>
    </div>
  );
}

function Illustration({ code }) {
  const Svg = ART[code] || ART.Paper;
  return <Svg />;
}

// ── Inline line-art illustrations ──────────────────────────────────────────
// Shared style: 80×96 portrait, currentColor stroke (ink-400), no fill.
const SVG_PROPS = {
  viewBox: "0 0 80 96",
  className: "h-24 w-auto text-ink-400",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinejoin: "round",
  strokeLinecap: "round",
};

const ART = {
  // Paper straw: a tall tube with diagonal spiral-wind lines.
  Paper: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M34 14 L46 14 L44 82 L36 82 Z" />
      <path d="M34 24 L46 20 M34 34 L46 30 M34 44 L46 40 M34 54 L46 50 M34 64 L46 60 M34 74 L46 70" strokeWidth="1" opacity="0.6" />
    </svg>
  ),
  // Rice straw: a tall tube with a couple of cut-end facets, no spiral.
  Rice: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M35 14 L45 14 L43 82 L37 82 Z" />
      <path d="M35 18 L45 18" strokeWidth="1" opacity="0.6" />
      <path d="M37 80 L43 80" strokeWidth="1" opacity="0.6" />
    </svg>
  ),
};
