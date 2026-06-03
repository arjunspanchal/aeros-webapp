// Static, client-facing trade information for the public paper-bag page:
// supply terms (port, payment, lead time, incoterms) and quality / compliance
// (FSC paper, food-safe manufacturing, per-batch QC process). Server
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
          <strong className="text-ink-900">Handle bags (PTH, FHB) are carton-packed</strong>;{" "}
          <strong className="text-ink-900">SOS sacks are bale-packed</strong> in compressed bundles
          to save volume. Both are palletised and shrink-wrapped for export on request.
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
      body: "Every paper reel is checked for GSM, shade and FSC documentation before it enters production.",
    },
    {
      n: "02",
      title: "In-process",
      body: "Operators verify bag dimensions, gluing and handle pull-strength at set intervals across the run.",
    },
    {
      n: "03",
      title: "Pre-dispatch",
      body: "A sample from each batch is inspected to AQL for count, finish and defects; cartons are weighed and sealed.",
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
        <Assurance title="FSC®-certified paper">
          All kraft is sourced from responsibly managed, FSC-certified forests — chain-of-custody
          documentation available on request.
        </Assurance>
        <Assurance title="Food-safe manufacturing">
          Bags are produced in a clean, food-safe environment suitable for direct food contact.
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
// `public/paper-bags/` using either base name below (any of .jpg/.jpeg/.png/
// .webp) and they appear automatically; until then a labelled placeholder
// renders so the section never shows a broken image.

const PACK_DIR = path.join(process.cwd(), "public", "paper-bags");

function findImage(base) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    try {
      if (fs.existsSync(path.join(PACK_DIR, `${base}.${ext}`))) {
        return `/paper-bags/${base}.${ext}`;
      }
    } catch {
      // ignore — fall through to placeholder
    }
  }
  return null;
}

export function PackingVisual() {
  const tiles = [
    {
      base: "bale-packing",
      title: "Bale-packed",
      sub: "Shrink-wrapped · SOS sacks",
      ref: "SOS Bag 6 (SOS-011)",
    },
    {
      base: "bale-packing-plain",
      title: "Bale-packed",
      sub: "Unwrapped bale · SOS sacks",
      ref: "SOS Bag 6 (SOS-011)",
    },
    { base: "carton-packing", title: "Carton-packed", sub: "PTH & FHB handle bags", ref: null },
  ];

  return (
    <section id="packing" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">How your bags are packed</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Handle-less <strong className="text-ink-900">SOS sacks ship as compact bales</strong> —
        strapped and, for export, shrink-wrapped to protect them in transit.{" "}
        <strong className="text-ink-900">Handle bags (PTH, FHB) ship carton-packed</strong> to keep
        the handles and finish clean. Both are palletised on request.
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
                    alt={`${t.title} — ${t.sub} — Aeros paper bags`}
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
                {t.ref && (
                  <p className="mt-1 text-[11px] text-ink-400">
                    Shown: <span className="font-medium text-ink-600">{t.ref}</span>
                  </p>
                )}
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
// Plain bags are stocked; printed/custom is the bigger half of the business.
// Print is priced by ink coverage × colours (see the internal bag-rate calc),
// plus a one-time plate/cylinder charge per colour amortised over the run.
// Printed rates are being finalised in the catalogue — kept "on request" here.

export function Customisation() {
  return (
    <section id="customisation" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Printing &amp; customisation</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Every bag on this sheet is also made to order in your branding — your print, size, kraft
        and GSM. Plain stock ships fast; custom is where most of our work is.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TermCard label="Print">
          Flexo &amp; offset, multi-colour, <strong className="text-ink-900">Pantone-matched</strong>.
          Logos, full-wrap artwork and solids on brown or white kraft.
        </TermCard>
        <TermCard label="How print is priced">
          By <strong className="text-ink-900">ink coverage</strong> (light → full) and number of
          colours. A one-time plate/cylinder charge per colour amortises over the run — quoted with
          your design.
        </TermCard>
        <TermCard label="Custom build">
          Bespoke <strong className="text-ink-900">sizes, GSM and handle type</strong>, plus
          white-kraft on any model. New sizes may carry a one-time die charge.
        </TermCard>
        <TermCard label="Artwork">
          Send vector art (AI / PDF). We return a free dieline and digital mock-up for sign-off
          before any plate is cut.
        </TermCard>
      </div>

      {/* Printed MOQ — set expectations up front. */}
      <div className="mt-3 rounded-md border border-ink-200 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-ink-400">Printed minimum order</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-bold text-ink-900">25,000</span>
            <span className="text-sm text-ink-600">pcs / design — twisted-handle (PTH)</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-bold text-ink-900">1,00,000</span>
            <span className="text-sm text-ink-600">pcs / design — SOS sacks</span>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          Minimums are per design and ladder up with bag size. Flat-handle (FHB) and bottle (LIQ)
          MOQs confirmed per SKU. <strong className="text-ink-700">Printed rates are quoted on
          request</strong> against your size, coverage and colours.
        </p>
      </div>
    </section>
  );
}

// ── Export & shipping readiness ─────────────────────────────────────────────
export function ExportReadiness() {
  return (
    <section id="export" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Export &amp; shipping readiness</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Set up to ship internationally from Nhava Sheva, with the paperwork importers need to clear
        customs cleanly.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TermCard label="Container loading">
          Loaded for volume — SOS bales compress to fit more per container. Exact pieces per{" "}
          <strong className="text-ink-900">20&prime; / 40&prime;</strong> confirmed per SKU at quote.
        </TermCard>
        <TermCard label="HS code">
          <strong className="text-ink-900">4819.30</strong> (sacks &amp; bags, base ≥ 40 cm) /{" "}
          <strong className="text-ink-900">4819.40</strong> (other paper bags).
        </TermCard>
        <TermCard label="Documents provided">
          Commercial invoice, packing list, bill of lading, Certificate of Origin and FSC
          chain-of-custody. Fumigation / phytosanitary on request.
        </TermCard>
        <TermCard label="Market compliance">
          FSC-certified, food-contact safe, <strong className="text-ink-900">recyclable and
          biodegradable</strong> — plastic-free kraft that meets single-use-plastic-ban rules in
          most export markets.
        </TermCard>
      </div>
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
            href={`mailto:${EMAIL}?subject=Paper%20bag%20enquiry`}
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
