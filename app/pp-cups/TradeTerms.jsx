// Static, client-facing trade information for the public PP cup & IM lid page:
// supply terms (port, payment, lead time, incoterms) and quality / compliance
// (food-grade PP, food-safe manufacturing, per-batch QC). Server components —
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
          Cups are <strong className="text-ink-900">sleeve-packed</strong> and lids{" "}
          <strong className="text-ink-900">bagged</strong>, then{" "}
          <strong className="text-ink-900">carton-packed</strong> by the case pack listed per item.
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
      title: "Incoming resin",
      body: "Every batch of food-grade PP resin is checked for grade, melt flow and freedom from contamination before it enters production.",
    },
    {
      n: "02",
      title: "In-process",
      body: "Operators verify rim curl, wall thickness, fit between cup and lid, and tab/spout function at set intervals across the run.",
    },
    {
      n: "03",
      title: "Pre-dispatch",
      body: "A sample from each batch is inspected to AQL for capacity, fit and defects; cartons are counted and sealed.",
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
        <Assurance title="Food-grade PP">
          Cups and lids are made from virgin, food-contact-safe polypropylene (resin identification
          code 5) — tough, flexible and recyclable.
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
// `public/pp-cups/` using either base name below (any of .jpg/.jpeg/.png/
// .webp) and they appear automatically; until then a labelled placeholder
// renders so the section never shows a broken image.

const PACK_DIR = path.join(process.cwd(), "public", "pp-cups");

function findImage(base) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    try {
      if (fs.existsSync(path.join(PACK_DIR, `${base}.${ext}`))) {
        return `/pp-cups/${base}.${ext}`;
      }
    } catch {
      // ignore — fall through to placeholder
    }
  }
  return null;
}

export function PackingVisual() {
  const tiles = [
    { base: "sleeve-packing", title: "Sleeve-packed", sub: "Stacked & sleeved cups, bagged lids" },
    { base: "carton-packing", title: "Carton-packed", sub: "Cases by the listed case pack" },
    { base: "pallet-packing", title: "Palletised", sub: "Shrink-wrapped for export" },
  ];

  return (
    <section id="packing" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">How your order is packed</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Cups are stacked and <strong className="text-ink-900">sleeve-packed</strong> to protect the
        rims and lids are <strong className="text-ink-900">bagged</strong>, then{" "}
        <strong className="text-ink-900">carton-packed</strong> by the case pack listed against each
        item. Cartons are palletised and shrink-wrapped for export on request.
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
                    alt={`${t.title} — ${t.sub} — Aeros PP cups & lids`}
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

// ── Printing & customisation ────────────────────────────────────────────────
// PP cups print; lids are supplied plain. Printed cups are a single per-piece
// ladder (no coverage tiers like the bags) — surfaced under the "Customised"
// toggle in the rate sheet below.
export function Customisation() {
  return (
    <section id="customisation" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Printing &amp; customisation</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Every cup on this sheet is also made to order in your branding. Plain stock ships fast;
        custom-printed is where most of our work is. Lids are supplied plain across the range.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TermCard label="Print">
          <strong className="text-ink-900">Multi-colour wrap print</strong>, Pantone-matched —
          logos, text and full-wrap artwork around the cup wall, on clear or frosted PP.
        </TermCard>
        <TermCard label="How print is priced">
          By <strong className="text-ink-900">number of colours</strong>. A one-time plate charge
          per colour amortises over the run — quoted with your design. Live per-piece rates are
          under the <strong className="text-ink-900">Customised</strong> toggle below.
        </TermCard>
        <TermCard label="Custom build">
          <strong className="text-ink-900">Clear or frosted</strong> finish, flat-bottom or U-shape,
          across the size range. New sizes may carry a one-time mould charge.
        </TermCard>
        <TermCard label="Artwork">
          Send vector art (AI / PDF). We return a free dieline and digital mock-up for sign-off
          before any plate is cut.
        </TermCard>
      </div>

      {/* Printed MOQ — set expectations up front. */}
      <div className="mt-3 rounded-md border border-ink-200 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-ink-400">Printed minimum order</p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-2xl font-bold text-ink-900">5,000</span>
          <span className="text-sm text-ink-600">pcs / design — printed PP cups</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          Minimums are per design and the unit rate drops as quantity rises.{" "}
          <strong className="text-ink-700">Live printed rates are in the rate sheet below</strong> —
          switch it to <strong className="text-ink-700">Customised</strong> for the per-piece price
          at each order quantity.
        </p>
      </div>
    </section>
  );
}

// ── Export & shipping readiness ─────────────────────────────────────────────
export function ExportReadiness() {
  const containerImg = findImage("container-40ft");

  const cards = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      <TermCard label="Container loading">
        Cups are <strong className="text-ink-900">nested</strong> for volume — U-shape profiles
        nest tightest. Exact pieces per <strong className="text-ink-900">20&prime; / 40&prime;</strong>{" "}
        confirmed per SKU at quote.
      </TermCard>
      <TermCard label="HS code">
        <strong className="text-ink-900">3924.10</strong> — tableware &amp; kitchenware of
        plastics (cups and lids).
      </TermCard>
      <TermCard label="Country of origin">
        Listed <strong className="text-ink-900">per item</strong> in the rate sheet (India or
        China) and filterable. Certificate of Origin issued accordingly with each shipment.
      </TermCard>
      <TermCard label="Documents provided">
        Commercial invoice, packing list, bill of lading and Certificate of Origin. Fumigation /
        phytosanitary on request.
      </TermCard>
      <TermCard label="Market compliance">
        Food-contact safe and <strong className="text-ink-900">recyclable PP (resin code 5)</strong>.
        Single-use-plastic rules vary by market — confirm acceptance for your destination.
      </TermCard>
    </div>
  );

  return (
    <section id="export" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Export &amp; shipping readiness</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Set up to ship internationally from Nhava Sheva, with the paperwork importers need to clear
        customs cleanly.
      </p>

      {containerImg ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
          <figure className="overflow-hidden rounded-md border border-ink-200 bg-white">
            <div className="aspect-[3/4] w-full bg-ink-50 sm:aspect-[4/3] lg:aspect-[3/4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={containerImg}
                alt="40-foot container loaded with cartons of PP cups and lids"
                className="h-full w-full object-cover"
              />
            </div>
            <figcaption className="p-3">
              <h3 className="text-sm font-bold text-ink-900">40&prime; container — carton-loaded</h3>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-ink-500">
                Nested cups & bagged lids, loaded at origin
              </p>
            </figcaption>
          </figure>
          {cards}
        </div>
      ) : (
        <div className="mt-4">{cards}</div>
      )}
    </section>
  );
}

// ── Samples & how to order + contact CTA ────────────────────────────────────
const WHATSAPP_URL = "https://wa.me/918433536369";
const EMAIL = "arjun@aeros-x.com";

export function OrderingAndSamples() {
  const steps = [
    { n: "01", title: "Share specs", body: "Size, quantity and plain or printed — by WhatsApp or email." },
    { n: "02", title: "Get a quote", body: "We reply with the rate, MOQ and lead time for your spec." },
    { n: "03", title: "Approve a sample", body: "Samples are chargeable and adjusted against your first order." },
    { n: "04", title: "Confirm the PO", body: "50% advance confirms the order and locks production." },
    { n: "05", title: "Production", body: "~30 days from the advance, with in-line QC across the run." },
    { n: "06", title: "Dispatch", body: "Balance before dispatch; EXW India or FOB Nhava Sheva." },
  ];

  return (
    <section id="order" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Samples &amp; how to order</h2>
      </div>

      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3 rounded-md border border-ink-200 bg-white p-4">
            <span className="font-mono text-sm font-bold text-ink-300">{s.n}</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">{s.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* CTA */}
      <div className="mt-4 flex flex-col items-start gap-3 rounded-md border border-ink-300 bg-ink-900 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-bold text-white">Ready for a quote?</p>
          <p className="mt-0.5 text-sm text-ink-300">
            Send your size, quantity and artwork — we reply with rate, MOQ and lead time.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-100"
          >
            WhatsApp us
          </a>
          <a
            href={`mailto:${EMAIL}?subject=PP%20cup%20enquiry`}
            className="rounded-md border border-ink-500 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800"
          >
            Email
          </a>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-500">
        WhatsApp <span className="font-medium text-ink-700">+91 84335 36369</span> · {" "}
        <a href={`mailto:${EMAIL}`} className="font-medium text-ink-700 underline-offset-2 hover:underline">
          {EMAIL}
        </a>
      </p>
    </section>
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
