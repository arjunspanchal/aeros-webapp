// Static, client-facing trade information for the public bagasse page: supply
// terms (port, payment, lead time, incoterms) and quality / compliance
// (food-grade moulded pulp, compostability, per-batch QC). Server components —
// no interactivity.

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
          Supplied <strong className="text-ink-900">bulk in polybags</strong> (loose) by default, then{" "}
          <strong className="text-ink-900">carton-packed</strong> by the case pack listed per item.
          Retail 25-pc LDPE packs and shrink-wrap-with-label available on request.
        </TermCard>
      </div>
    </section>
  );
}

export function QualityChecks() {
  const stages = [
    {
      n: "01",
      title: "Incoming material",
      body: "Every batch of sugarcane-bagasse pulp is checked for grade, moisture and freedom from contamination before it enters production.",
    },
    {
      n: "02",
      title: "In-process",
      body: "Operators verify wall thickness, dimensions, rim integrity and water/oil resistance at set intervals across the run.",
    },
    {
      n: "03",
      title: "Pre-dispatch",
      body: "A sample from each batch is inspected to AQL for dimensions, strength and defects; cartons are counted and sealed.",
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
        <Assurance title="Food-grade & oil/water resistant">
          Moulded from food-contact-safe sugarcane bagasse with no plastic lining — naturally
          grease- and water-resistant, microwave- and oven-safe to 120 °C.
        </Assurance>
        <Assurance title="Plastic-free & compostable">
          100% plant-fibre — a genuine single-use-plastic and foam replacement that is home- and
          industrially compostable and fully biodegradable.
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
// `public/bagasse/` using either base name below (any of .jpg/.jpeg/.png/.webp)
// and they appear automatically; until then a labelled placeholder renders so
// the section never shows a broken image.

const PACK_DIR = path.join(process.cwd(), "public", "bagasse");

function findImage(base) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    try {
      if (fs.existsSync(path.join(PACK_DIR, `${base}.${ext}`))) {
        return `/bagasse/${base}.${ext}`;
      }
    } catch {
      // ignore — fall through to placeholder
    }
  }
  return null;
}

export function PackingVisual() {
  const tiles = [
    { base: "bulk-packing", title: "Bulk in polybags", sub: "Loose, poly-bagged" },
    { base: "retail-packing", title: "Retail packs", sub: "25-pc LDPE / shrink + label" },
    { base: "carton-packing", title: "Carton-packed", sub: "Cases by the listed case pack" },
  ];

  return (
    <section id="packing" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">How your order is packed</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Bagasse tableware is supplied <strong className="text-ink-900">bulk in polybags</strong>{" "}
        (loose) by default, then <strong className="text-ink-900">carton-packed</strong> by the case
        pack listed against each item. <strong className="text-ink-900">Retail 25-pc LDPE packs</strong>{" "}
        and shrink-wrap-with-label are available on request. Cartons are palletised and
        shrink-wrapped for export on request.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const src = findImage(t.base);
          return (
            <figure key={t.base} className="overflow-hidden rounded-md border border-ink-200 bg-white">
              <div className="aspect-[4/3] w-full bg-ink-50">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={`${t.title} — ${t.sub} — Aeros bagasse tableware`}
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
