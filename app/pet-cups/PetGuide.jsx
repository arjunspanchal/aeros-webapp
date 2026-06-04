// "Know your PET range" — a static, educational section explaining the clear
// PET cold cup and its three lid styles. Server component (no interactivity).
// Illustrations are inline, monochrome SVG line art to match the Aeros brand.

const GUIDE = [
  {
    code: "Cup",
    name: "PET Cup",
    blurb:
      "Crystal-clear, rigid thermoformed cold cup with glass-like clarity. Standard tapered and U-shape profiles, custom-brandable.",
    feel: "Rigid, glass-clear",
    bestFor: "Juice, iced coffee, smoothies, soda",
    sizing: "10oz – 24oz",
  },
  {
    code: "Dome",
    name: "Dome Lid",
    blurb:
      "A raised dome that clears whipped cream, fruit, scoops and tall garnishes. Straw-cross or solid top.",
    feel: "Tall, domed",
    bestFor: "Frappés, sundaes, topped drinks",
    sizing: "Ø 73 – 90 mm",
  },
  {
    code: "Flat",
    name: "Flat Lid",
    blurb:
      "A low-profile flat lid in straw-cut and solid options, for round cups and square cold containers.",
    feel: "Low, flat",
    bestFor: "Iced drinks, salads, cold deli",
    sizing: "Ø 62 – 148 mm · 125–180 mm sq",
  },
  {
    code: "Sipper",
    name: "Sipper Lid",
    blurb:
      "A flat lid with a raised drink spout — sip straight from the lid, no straw needed. Tidy and spill-resistant.",
    feel: "Flat, spouted",
    bestFor: "Takeaway cold drinks, on-the-go",
    sizing: "Ø 92 – 98 mm",
  },
];

export function PetGuide() {
  return (
    <section id="guide" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Know your PET range</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        One clear cold cup, three lid styles. PET (polyethylene terephthalate, resin code 1)
        is rigid, recyclable and glass-clear — ideal for cold drinks where you want to show off
        the contents.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <p className="mt-6 max-w-2xl text-xs text-ink-500">
        Cups are sold plain or custom-branded (printed). Lids are supplied clear/plain across the
        range. Match a lid by its diameter to the cup&rsquo;s top diameter (TD) shown in the rate
        sheet.
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
  const Svg = ART[code] || ART.Cup;
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
  // Clear tapered cup with a faint vertical highlight for "glass-clear".
  Cup: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M24 26 L56 26 L51 80 L29 80 Z" />
      <path d="M22 26 L58 26" />
      <path d="M34 32 L32 74" strokeWidth="1" opacity="0.5" />
    </svg>
  ),
  // Dome lid: rim with a raised half-dome.
  Dome: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M20 60 L60 60" />
      <path d="M24 60 a16 22 0 0 1 32 0" />
      <path d="M40 38 L40 33 M37 35 L43 35" strokeWidth="1" opacity="0.6" />
    </svg>
  ),
  // Flat lid: rim with a low flat top and a straw cross.
  Flat: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M20 54 L60 54 L57 62 L23 62 Z" />
      <path d="M36 54 L44 54 L43 50 L37 50 Z" strokeWidth="1" opacity="0.7" />
    </svg>
  ),
  // Sipper lid: rim with a flat top and a raised spout.
  Sipper: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M20 56 L60 56 L57 64 L23 64 Z" />
      <path d="M44 56 q6 -2 7 -10 q-6 1 -9 4" strokeWidth="1.4" />
    </svg>
  ),
};
