// "Know your cups" — a static, educational section explaining each paper-cup
// wall type and the coatings. Server component (no interactivity).
// Illustrations are inline, monochrome SVG line art to match the Aeros brand.

const GUIDE = [
  {
    code: "SW",
    name: "Single Wall",
    blurb:
      "One coated paper-board wall. Light and economical — the everyday cup for water, cold drinks and short-hold hot beverages.",
    feel: "Thin, lightweight",
    bestFor: "Vending, water, cold & quick hot",
    sizing: "100ml – 20oz",
  },
  {
    code: "DW",
    name: "Double Wall",
    blurb:
      "A second outer wall traps an insulating air gap, so the cup stays comfortable to hold hot — no sleeve needed. The premium café cup.",
    feel: "Rigid, insulated",
    bestFor: "Coffee, tea, hot takeaway",
    sizing: "8oz – 20oz",
  },
  {
    code: "Ripple",
    name: "Ripple",
    blurb:
      "A fluted, corrugated outer wall gives maximum insulation and a sure grip, with an artisanal natural-kraft look.",
    feel: "Corrugated, textured",
    bestFor: "Specialty coffee, premium hot",
    sizing: "100ml – 480ml",
  },
];

const LININGS = [
  {
    code: "PE",
    name: "PE-lined",
    blurb: "Standard polyethylene moisture barrier. Reliable and economical for hot and cold.",
  },
  {
    code: "Aqueous",
    name: "Aqueous-coated",
    blurb: "Water-based barrier — repulpable and recyclable through the regular paper stream.",
  },
  {
    code: "PLA",
    name: "PLA-lined",
    blurb: "Plant-based compostable barrier for certified-compostable, plastic-free cups.",
  },
];

export function CupGuide() {
  return (
    <section id="guide" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Know your cups</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Three wall constructions for three jobs. Use the codes below to read the rate
        sheet — every SKU starts with its type (PC-SW, PC-DW, PC-RIP).
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {GUIDE.map((g) => (
          <article key={g.code} className="rounded-md border border-ink-200 bg-white p-4">
            <div className="flex h-28 w-full items-center justify-center rounded border border-ink-100 bg-ink-50">
              <Illustration code={g.code} name={g.name} />
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

      {/* Coatings / linings */}
      <p className="mt-8 max-w-2xl text-sm text-ink-600">
        Every wall type is available with three barrier coatings — pick by how the cup is
        disposed of:
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {LININGS.map((l) => (
          <div key={l.code} className="rounded-md border border-ink-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="rounded border border-ink-300 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-ink-700">
                {l.code}
              </span>
              <p className="text-sm font-semibold text-ink-900">{l.name}</p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{l.blurb}</p>
          </div>
        ))}
      </div>
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

function Illustration({ code, name }) {
  const Svg = CUP_SVG[code] || CUP_SVG.SW;
  return <Svg />;
}

// ── Inline line-art illustrations ──────────────────────────────────────────
// Shared style: 80×96 portrait, tapered-cup silhouette, currentColor stroke
// (set to ink-400 by the wrapper), no fill.

const SVG_PROPS = {
  viewBox: "0 0 80 96",
  className: "h-24 w-auto text-ink-400",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinejoin: "round",
  strokeLinecap: "round",
};

const CUP_SVG = {
  // Single wall: clean tapered cup, thin rim.
  SW: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M24 26 L56 26 L51 80 L29 80 Z" />
      <path d="M22 26 L58 26" />
    </svg>
  ),
  // Double wall: tapered cup with a parallel outer-wall line.
  DW: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M24 26 L56 26 L51 80 L29 80 Z" />
      <path d="M27 30 L53 30 L49 76 L31 76 Z" strokeWidth="1" opacity="0.5" />
      <path d="M22 26 L58 26" />
    </svg>
  ),
  // Ripple: tapered cup with vertical flute lines on the body.
  Ripple: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M24 26 L56 26 L51 80 L29 80 Z" />
      <path d="M22 26 L58 26" />
      <path
        d="M33 30 L31 76 M40 30 L40 76 M47 30 L49 76"
        strokeWidth="1"
        opacity="0.5"
      />
    </svg>
  ),
};
