// Static, client-facing trade information for the public paper-bag page:
// supply terms (port, payment, lead time, incoterms) and quality / compliance
// (FSC paper, food-safe manufacturing, per-batch QC process). Server
// components — no interactivity.

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
          Packed by the case; cartons palletised and shrink-wrapped for export on request.
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
