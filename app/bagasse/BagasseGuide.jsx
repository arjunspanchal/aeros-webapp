// "Know your bagasse range" — a static, educational section explaining what
// bagasse is, the product forms, and how to read sizes. Server component (no
// interactivity). Illustrations are inline, monochrome SVG line art to match the
// Aeros brand.

const FORMS = [
  {
    code: "Plates",
    name: "Plates & Trays",
    blurb:
      "Round dinner plates and square / rectangular compartment trays. Deep wells keep gravies and sides apart without bleed-through.",
    art: "Plate",
    bestFor: "Thalis, canteens, events, QSR",
    sizing: "6\" – 12\" · 2 – 6 compartments",
  },
  {
    code: "Bowls",
    name: "Bowls & Clamshells",
    blurb:
      "Bowls for soups, curries and desserts, and hinged clamshell boxes for takeaway — snap-shut, leak-resistant and stackable.",
    art: "Bowl",
    bestFor: "Soups, curries, delivery, takeaway",
    sizing: "180 – 360 ml · 6\" – 9\" boxes",
  },
  {
    code: "Cups",
    name: "Cups, Lids & Cutlery",
    blurb:
      "Moulded drink cups with matching fibre lids, plus spoons, forks, knives and an ice-cream spoon — a fully plastic-free table set.",
    art: "Cutlery",
    bestFor: "Drinks, dessert, full table service",
    sizing: "220 – 250 ml · Ø80 / Ø90 lids",
  },
];

const PROPS = [
  { k: "Microwave & oven safe", v: "Stable to +120 °C; fridge / freezer to −10 °C" },
  { k: "Oil & water resistant", v: "No plastic lining — natural grease & leak resistance" },
  { k: "Compostable", v: "Home & industrial compostable, fully biodegradable" },
  { k: "Food-safe & non-toxic", v: "100% plant fibre, food-contact safe, natural look" },
];

export function BagasseGuide() {
  return (
    <section id="guide" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Know your bagasse range</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Bagasse is the fibre left after juice is pressed from sugarcane — an agricultural by-product
        moulded under heat and pressure into rigid tableware. No plastic, no wax: just{" "}
        <strong className="text-ink-900">100% plant fibre</strong> that is sturdy, microwave- and
        oven-safe, and fully compostable. A clean replacement for foam and plastic.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {FORMS.map((g) => (
          <article key={g.code} className="rounded-md border border-ink-200 bg-white p-4">
            <div className="flex h-28 w-full items-center justify-center rounded border border-ink-100 bg-ink-50">
              <Illustration code={g.art} />
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
                <GuideRow label="Best for">{g.bestFor}</GuideRow>
                <GuideRow label="Sizes">{g.sizing}</GuideRow>
              </dl>
            </div>
          </article>
        ))}
      </div>

      {/* Properties quick-reference */}
      <div className="mt-6 rounded-md border border-ink-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-ink-400">Why bagasse</p>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {PROPS.map((b) => (
            <div key={b.k} className="flex gap-3 text-xs">
              <dt className="w-40 shrink-0 font-medium text-ink-900">{b.k}</dt>
              <dd className="text-ink-600">{b.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-6 max-w-2xl text-xs text-ink-500">
        All items are supplied plain (unprinted). Choose <strong className="text-ink-500">bulk</strong>{" "}
        polybags for in-house use, or <strong className="text-ink-500">retail 25-pc / shrink packs</strong>{" "}
        for shelf presentation. Custom-printed brown cartons available on request.
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
  const Svg = ART[code] || ART.Plate;
  return <Svg />;
}

// ── Inline line-art illustrations ──────────────────────────────────────────
// Shared style: 96×96, currentColor stroke (ink-400), no fill.
const SVG_PROPS = {
  viewBox: "0 0 96 96",
  className: "h-24 w-auto text-ink-400",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinejoin: "round",
  strokeLinecap: "round",
};

const ART = {
  // Plate: two nested ellipses (rim + well) seen slightly from above.
  Plate: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <ellipse cx="48" cy="50" rx="34" ry="20" />
      <ellipse cx="48" cy="49" rx="22" ry="12" strokeWidth="1.1" opacity="0.7" />
    </svg>
  ),
  // Bowl: a rounded cross-section bowl with a rim line.
  Bowl: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <ellipse cx="48" cy="34" rx="30" ry="9" />
      <path d="M18 34 C20 60 34 72 48 72 C62 72 76 60 78 34" />
      <ellipse cx="48" cy="34" rx="20" ry="5.5" strokeWidth="1.1" opacity="0.7" />
    </svg>
  ),
  // Cutlery: a spoon + fork pair.
  Cutlery: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      {/* spoon */}
      <ellipse cx="36" cy="28" rx="9" ry="12" />
      <path d="M36 40 L36 76" />
      {/* fork */}
      <path d="M60 18 L60 76" />
      <path d="M54 18 L54 30 M60 18 L60 30 M66 18 L66 30" strokeWidth="1.2" />
      <path d="M54 30 C54 36 66 36 66 30" strokeWidth="1.2" />
    </svg>
  ),
};
