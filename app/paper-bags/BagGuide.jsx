// "Know your bags" — a static, educational section explaining each paper-bag
// type. Server component (no interactivity). Illustrations are inline,
// monochrome SVG line art to match the Aeros brand. To swap in real product
// photos later, set `image: "/paper-bags/<file>.jpg"` on a guide entry below
// and drop the file in `public/paper-bags/` — the <Illustration> falls back to
// the SVG whenever `image` is absent.

const GUIDE = [
  {
    code: "SOS",
    name: "Self-Opening Sack",
    blurb:
      "A flat, block-bottom sack that snaps open and stands on its own when filled. No handle — built for speed at the counter.",
    handle: "No handle",
    bestFor: "Grocery, bakery, produce, takeaway",
    sizing: "US pound rating — #6 to #25 lb",
    image: null,
  },
  {
    code: "PTH",
    name: "Paper Twisted Handle",
    blurb:
      "A carry bag with twisted paper-rope handles glued under a reinforced top fold. The premium retail look, comfortable to carry.",
    handle: "Twisted paper rope",
    bestFor: "Retail, boutique, gifting, takeaway",
    sizing: "By width × gusset × height",
    image: null,
  },
  {
    code: "FHB",
    name: "Flat Handle Bag",
    blurb:
      "A carry bag with flat paper-tape (patti) handles that lie flush. Economical and quick to pack — the workhorse for high volume.",
    handle: "Flat paper tape",
    bestFor: "Food courts, events, fast retail",
    sizing: "By width × gusset × height",
    image: null,
  },
  {
    code: "LIQ",
    name: "Liquor / Bottle Bag",
    blurb:
      "Tall and narrow, sized to hug a single bottle. Keeps the bottle upright and presentable from counter to door.",
    handle: "Optional twisted handle",
    bestFor: "Wine, spirits, oil bottles",
    sizing: "Single-bottle, by height",
    image: null,
  },
];

export function BagGuide() {
  return (
    <section id="guide" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Know your bags</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Four bag families, each built for a different job. Use the codes below to read the
        rate sheet — every SKU starts with its type.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {GUIDE.map((g) => (
          <article
            key={g.code}
            className="flex gap-4 rounded-md border border-ink-200 bg-white p-4"
          >
            <div className="flex h-28 w-24 shrink-0 items-center justify-center rounded border border-ink-100 bg-ink-50">
              <Illustration code={g.code} image={g.image} name={g.name} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white">
                  {g.code}
                </span>
                <h3 className="truncate text-sm font-bold text-ink-900">{g.name}</h3>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{g.blurb}</p>
              <dl className="mt-2 space-y-0.5 text-xs">
                <GuideRow label="Handle">{g.handle}</GuideRow>
                <GuideRow label="Best for">{g.bestFor}</GuideRow>
                <GuideRow label="Sizing">{g.sizing}</GuideRow>
              </dl>
            </div>
          </article>
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

function Illustration({ code, image, name }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={`${name} paper bag`} className="h-24 w-auto object-contain" />;
  }
  const Svg = BAG_SVG[code] || BAG_SVG.SOS;
  return <Svg />;
}

// ── Inline line-art illustrations ──────────────────────────────────────────
// Shared style: 80×96 portrait, currentColor stroke (set to ink-400 by the
// wrapper), no fill so they read as clean kraft-bag outlines.

const SVG_PROPS = {
  viewBox: "0 0 80 96",
  className: "h-24 w-auto text-ink-400",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinejoin: "round",
  strokeLinecap: "round",
};

const BAG_SVG = {
  // Self-opening sack: open zig-zag top, flat body, front gusset folds.
  SOS: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M20 28 L30 22 L40 28 L50 22 L60 28" />
      <path d="M20 28 L20 82 L60 82 L60 28" />
      <path d="M32 28 L32 82 M48 28 L48 82" strokeWidth="1" opacity="0.45" />
    </svg>
  ),
  // Twisted handle: two thin rounded loop handles over a turn-over top band.
  PTH: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M30 30 C30 16 38 16 40 26" strokeWidth="1.5" />
      <path d="M50 30 C50 16 42 16 40 26" strokeWidth="1.5" />
      <path d="M20 30 L60 30 L60 38 L20 38 Z" />
      <path d="M20 38 L20 82 L60 82 L60 38" />
    </svg>
  ),
  // Flat handle: two flat straps (rectangles) over the top edge.
  FHB: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M28 30 L28 18 L34 18 L34 30" />
      <path d="M46 30 L46 18 L52 18 L52 30" />
      <path d="M20 30 L60 30 L60 82 L20 82 Z" />
      <path d="M20 30 L60 30" strokeWidth="1" opacity="0.45" />
    </svg>
  ),
  // Bottle bag: tall narrow body with a folded top.
  LIQ: () => (
    <svg {...SVG_PROPS} aria-hidden="true">
      <path d="M30 24 L36 18 L48 18 L54 24" />
      <path d="M30 24 L30 84 L54 84 L54 24" />
      <path d="M42 24 L42 84" strokeWidth="1" opacity="0.45" />
    </svg>
  ),
};
