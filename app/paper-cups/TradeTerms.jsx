// Static, client-facing trade information for the public paper-cup page:
// supply terms (port, payment, lead time, incoterms) and quality / compliance
// (food-grade board, food-safe manufacturing, per-batch QC). Server
// components — no interactivity.

import fs from "node:fs";
import path from "node:path";

export function SupplyTerms() {
  return (
    <section id="supply" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Terms of supply</h2>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Payment — given visual weight as the key commercial term. */}
        <div className="rounded-md border border-ink-200 bg-white p-5 sm:col-span-2">
          <p className="text-xs uppercase tracking-wide text-ink-400">Payment</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-2xl font-bold text-ink-900">50%</span>
              <span className="text-sm text-ink-600">advance with the purchase order</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-2xl font-bold text-ink-900">50%</span>
              <span className="text-sm text-ink-600">balance before dispatch</span>
            </div>
          </div>
        </div>

        <TermCard label="Lead time">
          <strong className="text-ink-900">~30 days</strong> from receipt of a confirmed PO and the
          advance payment.
        </TermCard>
        <TermCard label="Incoterms">
          <strong className="text-ink-900">EXW India</strong> by default; FOB on request.
        </TermCard>
        <TermCard label="Port of loading">
          <strong className="text-ink-900">Nhava Sheva (JNPT)</strong>, Mumbai — India&rsquo;s primary
          container gateway.
        </TermCard>
        <TermCard label="Packing">
          Cups are <strong className="text-ink-900">sleeve-packed</strong>, then{" "}
          <strong className="text-ink-900">carton-packed</strong> by the case pack listed per size.
          Palletised and shrink-wrapped for export on request.
        </TermCard>
      </div>
    </section>
  );
}

export function QualityChecks() {
  const stages = [
    {
      n: "01",
      title: "Incoming board",
      body: "Every reel of food-grade cup board is checked for GSM, coating and shade before it enters production.",
    },
    {
      n: "02",
      title: "In-process",
      body: "Operators verify rim curl, seam seal and leak resistance at set intervals across the run.",
    },
    {
      n: "03",
      title: "Pre-dispatch",
      body: "A sample from each batch is inspected to AQL for capacity, finish and defects; cartons are counted and sealed.",
    },
    {
      n: "04",
      title: "Documentation",
      body: "Each shipment carries a batch record, so every case is traceable back to its run.",
    },
  ];

  return (
    <section id="quality" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Quality &amp; compliance</h2>
      </div>

      {/* Standing assurances */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Assurance title="Food-grade cup board">
          Cups are made from virgin food-grade paper board with a food-contact-safe barrier coating —
          PE, water-based aqueous, or compostable PLA.
        </Assurance>
        <Assurance title="Food-safe manufacturing">
          Produced in a clean, food-safe environment suitable for direct food and beverage contact.
        </Assurance>
      </div>

      {/* Per-supply QC process */}
      <p className="mt-6 text-sm text-ink-600">
        Every supply is checked at four stages before it ships:
      </p>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2">
        {stages.map((s) => (
          <li key={s.n} className="flex gap-3 rounded-md border border-ink-200 bg-white p-4">
            <span className="font-mono text-sm font-bold text-ink-300">{s.n}</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">{s.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Packing showcase ────────────────────────────────────────────────────────
// Real product photos of how each order ships. Drop the files into
// `public/paper-cups/` using either base name below (any of .jpg/.jpeg/.png/
// .webp) and they appear automatically; until then a labelled placeholder
// renders so the section never shows a broken image.

const PACK_DIR = path.join(process.cwd(), "public", "paper-cups");

function findImage(base) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    try {
      if (fs.existsSync(path.join(PACK_DIR, `${base}.${ext}`))) {
        return `/paper-cups/${base}.${ext}`;
      }
    } catch {
      // ignore — fall through to placeholder
    }
  }
  return null;
}

export function PackingVisual() {
  const tiles = [
    { base: "sleeve-packing", title: "Sleeve-packed", sub: "Stacked & sleeved cups" },
    { base: "carton-packing", title: "Carton-packed", sub: "Cases by the listed case pack" },
    { base: "pallet-packing", title: "Palletised", sub: "Shrink-wrapped for export" },
  ];

  return (
    <section id="packing" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">How your cups are packed</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Cups are stacked and <strong className="text-ink-900">sleeve-packed</strong> to protect the
        rims, then <strong className="text-ink-900">carton-packed</strong> by the case pack listed
        against each size. Cartons are palletised and shrink-wrapped for export on request.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const src = findImage(t.base);
          return (
            <figure
              key={t.base}
              className="overflow-hidden rounded-md border border-ink-200 bg-white"
            >
              <div className="aspect-[4/3] w-full bg-ink-50">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={`${t.title} — ${t.sub} — Aeros paper cups`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <PackPlaceholder title={t.title} />
                )}
              </div>
              <figcaption className="p-3">
                <h3 className="text-sm font-bold text-ink-900">{t.title}</h3>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-ink-500">
                  {t.sub}
                </p>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

function PackPlaceholder({ title }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-300">
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
      <span className="px-3 text-center font-mono text-[10px] uppercase tracking-wider">
        {title} photo coming soon
      </span>
    </div>
  );
}

function TermCard({ label, children }) {
  return (
    <div className="rounded-md border border-ink-200 bg-white p-4 text-sm text-ink-600">
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

function Assurance({ title, children }) {
  return (
    <div className="rounded-md border border-ink-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <CheckMark />
        <p className="text-sm font-semibold text-ink-900">{title}</p>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{children}</p>
    </div>
  );
}

function CheckMark() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 text-ink-900"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" strokeWidth="1.5" />
      <path d="M6.5 10.5 L9 13 L13.5 7.5" />
    </svg>
  );
}

// ── Printing & customisation ────────────────────────────────────────────────
// Mirrors the paper-bag sheet's explainer: the two print methods we run, then
// what "ink coverage" means and why it moves the rate. The cup fan is printed
// flat (before forming), so both methods describe printing the blank.

const PRINT_METHODS = [
  {
    name: "Flexographic",
    tag: "Flexo",
    how: "Flexible relief plates print the cup board on the reel, before the fan is cut and formed. One plate per colour, made once for your artwork.",
    look: "Bold logos, line work and solid Pantone-matched colours — crisp, consistent, fast.",
    pick: "The workhorse for branded cups: up to 4 spot colours, best value on volume runs.",
  },
  {
    name: "Offset",
    tag: "Offset",
    how: "Sheet-fed litho printing on the flat cup blank, which is then die-cut and formed. Plates carry much finer detail than flexo.",
    look: "Halftones, gradients and photographic artwork — magazine-grade detail on the cup.",
    pick: "Pick for premium, art-heavy designs where fine detail matters more than run speed.",
  },
];

// Coverage tiers — the share of the cup's printable fan carrying ink. Drawn as
// a cup with that much ink filled, same convention as the paper-bag sheet.
const CUP_COVERAGE = [
  {
    pct: "10%",
    word: "Light",
    variant: "light",
    body: "A single small logo or mark on the bare board — minimal ink, the most economical print. Typical café-branded cups.",
  },
  {
    pct: "30%",
    word: "Medium",
    variant: "medium",
    body: "Logo plus text, a band or part-background. A fuller branded look at a moderate ink cost.",
  },
  {
    pct: "100%",
    word: "Full",
    variant: "full",
    body: "Edge-to-edge flood colour or full-wrap artwork. The richest look and the most ink — the highest print rate.",
  },
];

function CoverageCup({ variant }) {
  const clipId = `cup-ink-${variant}`;
  return (
    <svg viewBox="0 0 80 100" className="h-16 w-auto" fill="none" aria-hidden="true">
      <defs>
        {/* keep ink inside the tapered body */}
        <clipPath id={clipId}>
          <path d="M22 24 L30 88 L50 88 L58 24 Z" />
        </clipPath>
      </defs>

      {/* ink coverage */}
      {variant === "light" && (
        <circle cx="40" cy="52" r="9" className="text-ink-900" fill="currentColor" />
      )}
      {variant === "medium" && (
        <g className="text-ink-900" fill="currentColor" clipPath={`url(#${clipId})`}>
          <rect x="20" y="58" width="40" height="22" />
          <rect x="31" y="36" width="18" height="4" rx="1" />
        </g>
      )}
      {variant === "full" && (
        <g clipPath={`url(#${clipId})`}>
          <rect x="20" y="24" width="40" height="64" className="text-ink-900" fill="currentColor" />
          <circle cx="40" cy="50" r="8" className="text-ink-50" fill="currentColor" />
        </g>
      )}

      {/* cup outline on top — taper, rim, base */}
      <g className="text-ink-300" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M22 24 L30 88" />
        <path d="M58 24 L50 88" />
        <ellipse cx="40" cy="24" rx="18" ry="4" />
        <path d="M30 88 L50 88" />
      </g>
    </svg>
  );
}

export function PrintingAndCoverage() {
  return (
    <section id="printing" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Printing &amp; customisation</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Every cup on this sheet is also made to order in your branding. The cup is printed flat —
        as a fan, before it&rsquo;s formed — by one of two methods, and priced by how much of it
        carries ink.
      </p>

      {/* The two print methods */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {PRINT_METHODS.map((m) => (
          <div key={m.tag} className="rounded-md border border-ink-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <span className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white">
                {m.tag}
              </span>
              <p className="text-sm font-bold text-ink-900">{m.name}</p>
            </div>
            <dl className="mt-3 space-y-2 text-xs leading-relaxed text-ink-600">
              <div>
                <dt className="font-semibold uppercase tracking-wide text-ink-400">How it works</dt>
                <dd className="mt-0.5">{m.how}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-ink-400">The look</dt>
                <dd className="mt-0.5">{m.look}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-ink-400">When to pick it</dt>
                <dd className="mt-0.5">{m.pick}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-3 max-w-2xl text-xs text-ink-500">
        Both methods carry a <strong className="text-ink-700">one-time plate (flexo) or die
        (offset) charge per colour</strong>, made once for your artwork and amortised over the
        run — quoted with your design, separate from the per-cup rate.
      </p>

      {/* Ink-coverage explainer — what 10% / 30% / 100% means and why it drives cost. */}
      <div className="mt-6 rounded-md border border-ink-200 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-ink-400">Print coverage &amp; cost</p>
        <p className="mt-2 max-w-2xl text-sm text-ink-600">
          &ldquo;Coverage&rdquo; is the share of the cup&rsquo;s printable surface that carries
          ink. More coverage means more ink and a richer look — and a higher print rate:
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {CUP_COVERAGE.map((c) => (
            <div key={c.variant} className="rounded-md border border-ink-200 bg-ink-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded border border-ink-200 bg-white">
                  <CoverageCup variant={c.variant} />
                </div>
                <div>
                  <p className="font-mono text-2xl font-bold leading-none text-ink-900">{c.pct}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    {c.word}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-600">{c.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-500">
          The <strong className="text-ink-700">Customised</strong> rates in the sheet below are an{" "}
          <strong className="text-ink-700">approximate indication</strong> — they cover custom
          print up to 4 colours on a quantity ladder from 5,000 pcs, and the final price varies
          with your artwork (coverage, colour count and finish). We confirm the exact rate when we
          quote your design.
        </p>
      </div>
    </section>
  );
}
