"use client";

// Client-side browser for the public paper-bag rate sheet. Receives the
// already-fetched + grouped `sections` from the server page and owns all
// filter state (search, type, material, availability). Displayed currency
// comes from the shared CurrencyProvider. No data fetching here — keeps the
// Supabase service-role read server-only.

import { useMemo, useState } from "react";
import { useDisplay } from "./Currency";

// ── Money ──────────────────────────────────────────────────────────────────
// Rates are stored in INR. USD is an indicative conversion at `usdPerInr`.
function fmtUnit(currency, inr, usdPerInr) {
  if (inr == null) return null;
  if (currency === "USD") {
    return `$${(inr / usdPerInr).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
  }
  return `₹${inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCase(currency, inr, casePack, usdPerInr) {
  if (inr == null || !casePack) return null;
  const total = inr * casePack;
  if (currency === "USD") {
    return `$${(total / usdPerInr).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// Compact quantity-break label: 50000 → "50k", 250000 → "250k", 1500 → "1,500".
function fmtQty(n) {
  if (n == null) return "—";
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}k`;
  return n.toLocaleString("en-IN");
}

// ── Sizes ──────────────────────────────────────────────────────────────────
// Pull the first three numbers (W × G × H) out of the raw size string.
function parseDims(size) {
  if (!size) return null;
  const nums = (size.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
  return nums.length ? nums : null;
}

function mmLine(size) {
  const d = parseDims(size);
  return d ? d.join(" × ") : null;
}

function inLine(size) {
  const d = parseDims(size);
  if (!d) return null;
  return d.map((n) => (n / 25.4).toFixed(1)).join(" × ");
}

// One size string in the chosen unit, e.g. "152 × 95 × 305 mm" or
// "6.0 × 3.7 × 12.0 in".
function sizeLabel(size, unit) {
  if (unit === "in") {
    const v = inLine(size);
    return v ? `${v} in` : null;
  }
  const v = mmLine(size);
  return v ? `${v} mm` : null;
}

// Size buckets keyed off bag height (the 3rd dim of W × G × H) — the natural
// proxy for "how big is the bag". Thresholds in mm; labels carry the range.
const SIZE_BUCKETS = [
  { value: "all", label: "All", title: null, test: () => true },
  { value: "small", label: "Small", title: "Height ≤ 240 mm", test: (h) => h <= 240 },
  { value: "medium", label: "Medium", title: "Height 240–360 mm", test: (h) => h > 240 && h <= 360 },
  { value: "large", label: "Large", title: "Height > 360 mm", test: (h) => h > 360 },
];

// Bag height in mm = last of the parsed W × G × H dims.
function bagHeight(size) {
  const d = parseDims(size);
  return d && d.length ? d[d.length - 1] : null;
}

function materialLabel(r) {
  const mat = r.material || "";
  const colour = r.colour;
  if (/bleached/i.test(mat)) return "White kraft";
  if (/ogr/i.test(mat)) return "OGR recycled";
  if (/kraft/i.test(mat)) return colour === "White" ? "White kraft" : "Brown kraft";
  return mat || (colour ?? "—");
}

// "SOS (Self-Opening Sack)" → "SOS"
function shortCode(key) {
  const m = key.match(/^([A-Z]{2,4})\b/);
  return m ? m[1] : key;
}

export default function PaperBagsBrowser({
  sections,
  printedSections = [],
  priced,
  total,
  printedTotal = 0,
  usdPerInr = 90,
}) {
  const { currency, unit, market } = useDisplay();
  const [offering, setOffering] = useState("plain"); // "plain" | "printed"
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // "all" | section.key
  const [material, setMaterial] = useState("all"); // "all" | "brown" | "white"
  const [size, setSize] = useState("all"); // "all" | "small" | "medium" | "large"
  const [availability, setAvailability] = useState("all"); // "all" | "priced" | "request"

  const isPrinted = offering === "printed";
  const activeSections = isPrinted ? printedSections : sections;
  const activeTotal = isPrinted ? printedTotal : total;

  const typeOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...activeSections.map((s) => ({ value: s.key, label: shortCode(s.key), title: s.label })),
    ],
    [activeSections],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeSections
      .filter((s) => type === "all" || s.key === type)
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => {
          // Market filter — rows carry a market tag (untagged ⇒ Exports).
          if ((r.market || "Exports") !== market) return false;
          if (q && !`${r.sku} ${r.name}`.toLowerCase().includes(q)) return false;
          if (material !== "all") {
            const label = materialLabel(r).toLowerCase();
            if (material === "white" && !label.includes("white")) return false;
            if (material === "brown" && !label.includes("brown")) return false;
          }
          if (size !== "all") {
            const h = bagHeight(r.size);
            const bucket = SIZE_BUCKETS.find((b) => b.value === size);
            if (h == null || !bucket?.test(h)) return false;
          }
          // Availability only applies to plain rates; printed rows are all priced.
          if (!isPrinted) {
            if (availability === "priced" && r.priceInr == null) return false;
            if (availability === "request" && r.priceInr != null) return false;
          }
          return true;
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [activeSections, isPrinted, query, type, material, size, availability, market]);

  // Does the selected market have *any* bags at all (before other filters)?
  // Distinguishes a genuinely empty market (Domestic, until SKUs are added)
  // from a too-narrow filter set.
  const marketHasRows = useMemo(
    () =>
      activeSections.some((s) =>
        s.rows.some((r) => (r.market || "Exports") === market),
      ),
    [activeSections, market],
  );

  const shown = filtered.reduce((n, s) => n + s.rows.length, 0);
  const isFiltered =
    query.trim() !== "" ||
    type !== "all" ||
    material !== "all" ||
    size !== "all" ||
    (!isPrinted && availability !== "all");

  // Switching plain ⇄ printed clears the type chip, since the available types
  // differ between the two sheets (e.g. printed has no FHB / LIQ yet).
  const switchOffering = (next) => {
    setOffering(next);
    setType("all");
  };

  const reset = () => {
    setQuery("");
    setType("all");
    setMaterial("all");
    setSize("all");
    setAvailability("all");
  };

  return (
    <section id="rates" className="mt-12">
      <div className="flex items-baseline justify-between border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Full rate sheet</h2>
        <span className="font-mono text-xs text-ink-400">
          {isPrinted ? `${printedTotal} bags printable` : `${priced} of ${total} priced`}
        </span>
      </div>

      {/* Plain ⇄ Printed view toggle */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5">
          <SegBtn active={!isPrinted} onClick={() => switchOffering("plain")}>
            Plain
          </SegBtn>
          <SegBtn active={isPrinted} onClick={() => switchOffering("printed")}>
            Printed
          </SegBtn>
        </div>
        <p className="text-xs text-ink-500">
          {isPrinted
            ? "Custom-branded rates — per piece, by print tier and order quantity."
            : "Stock plain (unprinted) bags — single per-piece rate."}
        </p>
      </div>

      {/* Filter bar */}
      <div className="mt-4 rounded-md border border-ink-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          {/* Search */}
          <div>
            <label htmlFor="bag-search" className="block text-xs uppercase tracking-wide text-ink-400">
              Search
            </label>
            <input
              id="bag-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Code or name — e.g. SOS, bistro, #12"
              className="mt-1.5 h-10 w-full rounded border border-ink-200 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-1 focus:ring-ink-900"
            />
          </div>

          {/* Type segmented control */}
          <div>
            <span className="block text-xs uppercase tracking-wide text-ink-400">Type</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {typeOptions.map((opt) => (
                <Chip
                  key={opt.value}
                  active={type === opt.value}
                  onClick={() => setType(opt.value)}
                  title={opt.title}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Material */}
          <div>
            <span className="block text-xs uppercase tracking-wide text-ink-400">Material</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { value: "all", label: "All" },
                { value: "brown", label: "Brown kraft" },
                { value: "white", label: "White kraft" },
              ].map((opt) => (
                <Chip key={opt.value} active={material === opt.value} onClick={() => setMaterial(opt.value)}>
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Size — bucketed by bag height. */}
          <div>
            <span className="block text-xs uppercase tracking-wide text-ink-400">Size (height)</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SIZE_BUCKETS.map((opt) => (
                <Chip
                  key={opt.value}
                  active={size === opt.value}
                  onClick={() => setSize(opt.value)}
                  title={opt.title}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Availability — plain sheet only (printed rows are all priced). */}
          {!isPrinted && (
            <div>
              <span className="block text-xs uppercase tracking-wide text-ink-400">Availability</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  { value: "all", label: "All" },
                  { value: "priced", label: "Priced" },
                  { value: "request", label: "On request" },
                ].map((opt) => (
                  <Chip
                    key={opt.value}
                    active={availability === opt.value}
                    onClick={() => setAvailability(opt.value)}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
          <span className="text-xs text-ink-500">
            Showing <strong className="text-ink-900">{shown}</strong> of {activeTotal} bags · prices in{" "}
            <strong className="text-ink-900">{currency}</strong> · sizes in{" "}
            <strong className="text-ink-900">{unit}</strong>
          </span>
          {isFiltered && (
            <button
              type="button"
              onClick={reset}
              className="text-xs font-medium text-ink-600 underline-offset-2 hover:text-ink-900 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {!marketHasRows ? (
        <div className="mt-6 rounded-md border border-dashed border-ink-200 bg-white p-8 text-center">
          <p className="font-semibold text-ink-900">
            No {market.toLowerCase()}-market bags listed yet.
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {market === "Domestic"
              ? "Our domestic India range is being added — switch to Exports for the full rate sheet, or contact us for domestic pricing."
              : "Switch the market toggle to see the available range."}
          </p>
          {market === "Domestic" && (
            <a
              href="mailto:arjun@aeros-x.com?subject=Domestic%20paper-bag%20pricing"
              className="mt-3 inline-flex rounded border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-100"
            >
              Ask for domestic pricing
            </a>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-md border border-dashed border-ink-200 bg-white p-8 text-center">
          <p className="font-semibold text-ink-900">No bags match these filters.</p>
          <p className="mt-1 text-sm text-ink-500">Try clearing the search or widening the type.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex rounded border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-100"
          >
            Clear filters
          </button>
        </div>
      ) : (
        filtered.map((section) =>
          isPrinted ? (
            <PrintedSection
              key={section.key}
              section={section}
              currency={currency}
              unit={unit}
              usdPerInr={usdPerInr}
            />
          ) : (
          <div key={section.key} className="mt-8">
            <div className="flex items-baseline justify-between">
              <h3 className="text-base font-bold text-ink-900">{section.label}</h3>
              <span className="font-mono text-xs text-ink-400">{section.rows.length} sizes</span>
            </div>

            {/* Desktop table */}
            <div className="mt-3 hidden overflow-hidden rounded-md border border-ink-200 bg-white md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Bag</th>
                    <th className="px-3 py-2 font-medium">Size (W×G×H)</th>
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="px-3 py-2 text-right font-medium">GSM</th>
                    <th className="px-3 py-2 text-right font-medium">Case (pcs)</th>
                    <th className="px-3 py-2 text-right font-medium">Unit rate</th>
                    <th className="px-3 py-2 text-right font-medium">Case rate</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((r) => {
                    const unitRate = fmtUnit(currency, r.priceInr, usdPerInr);
                    const caseRate = fmtCase(currency, r.priceInr, r.casePack, usdPerInr);
                    return (
                      <tr key={r.sku} className="border-b border-ink-100 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs text-ink-600">{r.sku}</td>
                        <td className="px-3 py-2 text-ink-900">{r.name}</td>
                        <td className="px-3 py-2 text-ink-600">{sizeLabel(r.size, unit) ?? "—"}</td>
                        <td className="px-3 py-2 text-ink-600">{materialLabel(r)}</td>
                        <td className="px-3 py-2 text-right text-ink-600">{r.gsm ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-ink-600">
                          {r.casePack ? r.casePack.toLocaleString("en-IN") : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {unitRate ? (
                            <span className="font-medium text-ink-900">{unitRate}</span>
                          ) : (
                            <span className="text-ink-400">On request</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-600">{caseRate ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mt-3 space-y-2 md:hidden">
              {section.rows.map((r) => {
                const unitRate = fmtUnit(currency, r.priceInr, usdPerInr);
                const caseRate = fmtCase(currency, r.priceInr, r.casePack, usdPerInr);
                return (
                  <div key={r.sku} className="rounded-md border border-ink-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-ink-400">{r.sku}</p>
                        <p className="mt-0.5 font-medium text-ink-900">{r.name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {unitRate ? (
                          <>
                            <p className="font-semibold text-ink-900">{unitRate}</p>
                            <p className="text-xs text-ink-400">
                              {caseRate ? `${caseRate}/case` : "per piece"}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-ink-400">On request</p>
                        )}
                      </div>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-600">
                      <Spec label="Size">{sizeLabel(r.size, unit) ?? "—"}</Spec>
                      <Spec label="Material">{materialLabel(r)}</Spec>
                      <Spec label="GSM">{r.gsm ?? "—"}</Spec>
                      <Spec label="Case pack">
                        {r.casePack ? `${r.casePack.toLocaleString("en-IN")} pcs` : "—"}
                      </Spec>
                    </dl>
                  </div>
                );
              })}
            </div>
          </div>
          )
        )
      )}
    </section>
  );
}

// ── Printed view ────────────────────────────────────────────────────────────
// One card per bag, showing its three print tiers (rows) against the order-
// quantity breaks (columns). Cells are the per-piece rate in the chosen
// currency; a blank break for a tier shows "—".
function PrintedSection({ section, currency, unit, usdPerInr }) {
  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-ink-900">{section.label}</h3>
        <span className="font-mono text-xs text-ink-400">{section.rows.length} bags</span>
      </div>

      <div className="mt-3 space-y-3">
        {section.rows.map((r) => (
          <div key={r.sku} className="overflow-hidden rounded-md border border-ink-200 bg-white">
            {/* Bag header */}
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-ink-100 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-500">{r.sku}</span>
                  <h4 className="truncate text-sm font-bold text-ink-900">{r.name}</h4>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">
                  {[sizeLabel(r.size, unit), materialLabel(r), r.gsm ? `${r.gsm} gsm` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>

            {/* Tier × quantity matrix */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-4 py-2 text-left font-medium">Print tier</th>
                    {r.qtyBreaks.map((q) => (
                      <th key={q} className="px-4 py-2 text-right font-medium">
                        {fmtQty(q)} pcs
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.tiers.map((t) => {
                    const byQty = new Map(t.breaks.map((b) => [b.minQty, b.priceInr]));
                    return (
                      <tr key={t.code} className="border-b border-ink-100 last:border-0">
                        <td className="px-4 py-2">
                          <span className="font-medium text-ink-900">{t.coverage}% coverage</span>
                          <span className="ml-1.5 text-xs text-ink-500">
                            {t.colours}-colour
                          </span>
                        </td>
                        {r.qtyBreaks.map((q) => {
                          const rate = fmtUnit(currency, byQty.get(q) ?? null, usdPerInr);
                          return (
                            <td key={q} className="px-4 py-2 text-right">
                              {rate ? (
                                <span className="font-medium text-ink-900">{rate}</span>
                              ) : (
                                <span className="text-ink-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SegBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded px-3.5 py-1.5 text-sm font-semibold transition-colors " +
        (active ? "bg-ink-900 text-white" : "text-ink-600 hover:text-ink-900")
      }
    >
      {children}
    </button>
  );
}

function Chip({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-ink-900 bg-ink-900 text-white"
          : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900")
      }
    >
      {children}
    </button>
  );
}

function Spec({ label, children }) {
  return (
    <div>
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-ink-800">{children}</dd>
    </div>
  );
}
