// "Know your PET range" — a static, educational section explaining the clear
// PET cold cup and its three lid styles. Server component (no interactivity).
// Illustrations are inline, monochrome SVG line art to match the Aeros brand.

const GUIDE = [
  {
    code: "Cup",
    name: "PET Cup",
    blurb:
      "Crystal-clear, rigid thermoformed cold cup with glass-like clarity. F-Bottom and U-Bottom profiles, custom-brandable.",
    feel: "Rigid, glass-clear",
    bestFor: "Juice, iced coffee, smoothies, soda",
    sizing: "Ø 74–117 mm · 5oz – 32oz",
  },
  {
    code: "Dome",
    name: "Dome Lid",
    blurb:
      "A raised dome that clears whipped cream, fruit, scoops and tall garnishes. Clear PET, supplied plain.",
    feel: "Tall, domed",
    bestFor: "Frappés, sundaes, topped drinks",
    sizing: "Ø 78–117 mm",
  },
  {
    code: "Flat",
    name: "Flat Lid",
    blurb:
      "A low-profile flat lid with a straw cut, sized to the cup's top diameter. Clear PET, supplied plain.",
    feel: "Low, flat",
    bestFor: "Iced drinks, cold takeaway",
    sizing: "Ø 78–117 mm",
  },
  {
    code: "Sipper",
    name: "Sipper Lid",
    blurb:
      "A flat lid with a raised drink spout — sip straight from the lid, no straw needed. Tidy and spill-resistant.",
    feel: "Flat, spouted",
    bestFor: "Takeaway cold drinks, on-the-go",
    sizing: "Ø 89–107 mm",
  },
];

export function PetGuide() {
  return (
    <section id="guide" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Know your PET range</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Clear cold cups across a range of top diameters (Ø74–Ø117 mm), with matching dome, flat
        and sipper lids. PET (polyethylene terephthalate, resin code 1) is rigid, recyclable and
        glass-clear — ideal for cold drinks where you want to show off the contents.
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

      {/* Cup profiles — F-Bottom vs U-Bottom, annotated with the TD × BD × H size format. */}
      <div className="mt-8 rounded-md border border-ink-200 bg-white p-5">
        <h3 className="text-sm font-bold text-ink-900">Cup profiles &amp; how we size</h3>
        <p className="mt-1 max-w-2xl text-xs text-ink-600">
          Cups come with an <strong className="text-ink-900">F-Bottom</strong> (flat base) or a{" "}
          <strong className="text-ink-900">U-Bottom</strong> (rounded base). Each size in the rate sheet is
          written as <span className="font-mono text-ink-900">TD × BD × H</span> — top diameter ×
          bottom diameter × height, in millimetres.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <figure className="rounded border border-ink-100 bg-ink-50 p-3">
            <FlatCup />
            <figcaption className="mt-1 text-center text-xs font-medium text-ink-700">
              F-Bottom
            </figcaption>
          </figure>
          <figure className="rounded border border-ink-100 bg-ink-50 p-3">
            <UShapeCup />
            <figcaption className="mt-1 text-center text-xs font-medium text-ink-700">
              U-Bottom
            </figcaption>
          </figure>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500">
          <span>
            <span className="font-mono text-ink-700">TD</span> top diameter
          </span>
          <span>
            <span className="font-mono text-ink-700">BD</span> bottom diameter
          </span>
          <span>
            <span className="font-mono text-ink-700">H</span> height
          </span>
        </div>
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

// ── Annotated cup profiles ─────────────────────────────────────────────────
// Monochrome line art: cup outline in ink-700, dimension lines/labels lighter
// (via opacity), marking TD (top Ø), BD (bottom Ø) and H (height) — the same
// order the rate sheet writes sizes in.
const DIM_LINE = { strokeWidth: 0.9, opacity: 0.55 };
const DIM_TEXT = {
  fill: "currentColor",
  stroke: "none",
  fontSize: 12,
  opacity: 0.85,
  textAnchor: "middle",
  fontFamily: "var(--font-mono, monospace)",
};

function FlatCup() {
  return (
    <svg
      viewBox="0 0 200 196"
      className="mx-auto h-44 w-auto text-ink-700"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="F-Bottom (flat base) PET cup, marked with top diameter, bottom diameter and height"
    >
      {/* cup body — straight taper, flat base */}
      <path d="M56 50 L72 150 L128 150 L144 50" strokeWidth="1.75" />
      <ellipse cx="100" cy="50" rx="44" ry="8" strokeWidth="1.75" />
      <path d="M84 62 L80 140" strokeWidth="1" opacity="0.35" />
      {/* dimension lines */}
      <g {...DIM_LINE}>
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
      <g {...DIM_TEXT}>
        <text x="100" y="28">TD</text>
        <text x="22" y="104">H</text>
        <text x="100" y="185">BD</text>
      </g>
    </svg>
  );
}

function UShapeCup() {
  return (
    <svg
      viewBox="0 0 200 196"
      className="mx-auto h-44 w-auto text-ink-700"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="U-Bottom (rounded base) PET cup, marked with top diameter, bottom diameter and height"
    >
      {/* cup body — straight walls into a rounded U base */}
      <path d="M58 50 L68 120 Q100 164 132 120 L142 50" strokeWidth="1.75" />
      <ellipse cx="100" cy="50" rx="42" ry="8" strokeWidth="1.75" />
      <path d="M82 64 L79 116" strokeWidth="1" opacity="0.35" />
      {/* dimension lines */}
      <g {...DIM_LINE}>
        <path d="M58 36 L142 36" />
        <path d="M58 31 L58 41" />
        <path d="M142 31 L142 41" />
        <path d="M36 50 L36 146" />
        <path d="M31 50 L41 50" />
        <path d="M31 146 L41 146" />
        <path d="M68 168 L132 168" />
        <path d="M68 163 L68 173" />
        <path d="M132 163 L132 173" />
      </g>
      <g {...DIM_TEXT}>
        <text x="100" y="28">TD</text>
        <text x="22" y="102">H</text>
        <text x="100" y="185">BD</text>
      </g>
    </svg>
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
