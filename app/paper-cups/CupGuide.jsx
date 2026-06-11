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

      {/* How we size — the TD × BD × H convention the rate sheet uses. */}
      <div className="mt-8 rounded-md border border-ink-200 bg-white p-5">
        <h3 className="text-sm font-bold text-ink-900">How we size</h3>
        <p className="mt-1 max-w-2xl text-xs text-ink-600">
          Every size in the rate sheet is written as{" "}
          <span className="font-mono text-ink-900">TD × BD × H</span> — top diameter × bottom
          diameter × height, in millimetres. Lids are matched to the cup&rsquo;s top diameter (TD).
        </p>
        <div className="mt-4 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
          <figure className="mx-auto rounded border border-ink-100 bg-ink-50 p-3">
            <SizedCup />
          </figure>
          <div className="space-y-1 text-xs text-ink-600">
            <p>
              <span className="font-mono font-semibold text-ink-900">TD</span> — top (rim)
              diameter, measured across the open mouth
            </p>
            <p>
              <span className="font-mono font-semibold text-ink-900">BD</span> — bottom (base)
              diameter, across the foot of the cup
            </p>
            <p>
              <span className="font-mono font-semibold text-ink-900">H</span> — overall height,
              rim to base
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// Annotated side profile: cup outline in ink-700, dimension lines lighter via
// opacity — TD across the rim, BD across the base, H down the side. Matches the
// PET/PP guide drawings so the size convention reads the same across sheets.
function SizedCup() {
  return (
    <svg
      viewBox="0 0 200 196"
      className="mx-auto h-44 w-auto text-ink-700"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Paper cup profile marked with top diameter, bottom diameter and height"
    >
      {/* cup body — straight taper, flat base */}
      <path d="M56 50 L72 150 L128 150 L144 50" strokeWidth="1.75" />
      <ellipse cx="100" cy="50" rx="44" ry="8" strokeWidth="1.75" />
      <path d="M84 62 L80 140" strokeWidth="1" opacity="0.35" />
      {/* dimension lines */}
      <g strokeWidth="0.9" opacity="0.55">
        <path d="M56 36 L144 36" />
        <path d="M56 31 L56 41" />
        <path d="M144 31 L144 41" />
        <path d="M36 50 L36 150" />
        <path d="M31 50 L41 50" />
        <path d="M31 150 L41 150" />
        <path d="M72 168 L128 168" />
        <path d="M72 163 L72 173" />
        <path d="M128 163 L128 173" />
      </g>
      {/* labels */}
      <g
        fill="currentColor"
        stroke="none"
        fontSize="12"
        opacity="0.85"
        textAnchor="middle"
        fontFamily="var(--font-mono, monospace)"
      >
        <text x="100" y="26">TD</text>
        <text x="22" y="104">H</text>
        <text x="100" y="186">BD</text>
      </g>
    </svg>
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
