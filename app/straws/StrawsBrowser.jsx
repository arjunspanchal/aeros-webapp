"use client";

// Client-side browser for the public straw rate sheet. Receives the
// already-fetched + grouped `sections` from the server page and owns all filter
// state (search, material, bore, wrapping, availability). Straws are a plain,
// single-MOQ line — no quantity ladder — so each row carries one price. The
// active currency and rate basis (FCL/DDP) come from the shared
// CurrencyProvider; no data fetching here.

import { useMemo, useState } from "react";
import { useDisplay } from "./Currency";

// ── Money ──────────────────────────────────────────────────────────────────
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

// Pick the active-mode unit price from a slab: FCL (price_inr) or India DDP.
// DDP is null when the SKU has no delivered rate costed yet → "On request".
function pickInr(slab, rateMode) {
  if (!slab) return null;
  return rateMode === "ddp" ? slab.ddpInr ?? null : slab.priceInr;
}

// 5000 → "5K", 10000 → "10K", 1500 → "1.5K"
function fmtQty(n) {
  if (n == null) return "";
  if (n >= 100000) {
    const l = n / 100000;
    return `${Number.isInteger(l) ? l : l.toFixed(1)}L`;
  }
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return n.toLocaleString("en-IN");
}

// Bore label: 6 → "Ø 6 mm", 6.5 → "Ø 6.5 mm".
function boreLabel(bore) {
  return bore != null ? `Ø ${bore} mm` : "—";
}

export default function StrawsBrowser({ sections, plainPriced, total, usdPerInr = 90 }) {
  const { currency, rateMode } = useDisplay();
  const basisLabel = rateMode === "ddp" ? "DDP India · incl. freight + GST" : "EXW India · bare";
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // "all" | section.key
  const [bore, setBore] = useState("all"); // "all" | bore number
  const [wrapped, setWrapped] = useState("all"); // "all" | "yes" | "no"
  const [availability, setAvailability] = useState("all"); // "all" | "priced" | "request"

  const typeOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...sections.map((s) => ({ value: s.key, label: s.code, title: s.label })),
    ],
    [sections],
  );

  // Distinct bore diameters present in the data, ascending — drives the bore filter.
  const boreOptions = useMemo(() => {
    const set = new Set();
    for (const s of sections) for (const r of s.rows) if (r.bore != null) set.add(r.bore);
    return [...set].sort((a, b) => a - b);
  }, [sections]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .filter((s) => type === "all" || s.key === type)
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => {
          if (
            q &&
            !`${r.sku} ${r.name} ${r.bore ?? ""}mm ${r.length ?? ""} ${r.material ?? ""}`
              .toLowerCase()
              .includes(q)
          )
            return false;
          if (bore !== "all" && r.bore !== bore) return false;
          if (wrapped === "yes" && !r.wrapped) return false;
          if (wrapped === "no" && r.wrapped) return false;
          const hasPrice = pickInr(r.plain?.entry, rateMode) != null;
          if (availability === "priced" && !hasPrice) return false;
          if (availability === "request" && hasPrice) return false;
          return true;
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [sections, query, type, bore, wrapped, availability, rateMode]);

  const shown = filtered.reduce((n, s) => n + s.rows.length, 0);
  const isFiltered =
    query.trim() !== "" ||
    type !== "all" ||
    bore !== "all" ||
    wrapped !== "all" ||
    availability !== "all";

  const reset = () => {
    setQuery("");
    setType("all");
    setBore("all");
    setWrapped("all");
    setAvailability("all");
  };

  return (
    <section id="rates" className="mt-12">
      <div className="flex items-baseline justify-between border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Full rate sheet</h2>
        <span className="font-mono text-xs text-ink-400">
          {plainPriced} of {total} priced
        </span>
      </div>

      {/* Filter bar */}
      <div className="mt-4 rounded-md border border-ink-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          {/* Search */}
          <div>
            <label htmlFor="straw-search" className="block text-xs uppercase tracking-wide text-ink-400">
              Search
            </label>
            <input
              id="straw-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Code, size or material — e.g. 8mm, paper, wrapped, rice"
              className="mt-1.5 h-10 w-full rounded border border-ink-200 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-1 focus:ring-ink-900"
            />
          </div>

          {/* Material segmented control */}
          <div>
            <span className="block text-xs uppercase tracking-wide text-ink-400">Material</span>
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

        {/* Bore diameter */}
        {boreOptions.length > 0 && (
          <div className="mt-4">
            <span className="block text-xs uppercase tracking-wide text-ink-400">Bore</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip active={bore === "all"} onClick={() => setBore("all")}>
                All
              </Chip>
              {boreOptions.map((b) => (
                <Chip key={b} active={bore === b} onClick={() => setBore(b)}>
                  {b}mm
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Wrapping */}
          <div>
            <span className="block text-xs uppercase tracking-wide text-ink-400">Wrapping</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { value: "all", label: "All" },
                { value: "yes", label: "Individually wrapped" },
                { value: "no", label: "Bulk" },
              ].map((opt) => (
                <Chip key={opt.value} active={wrapped === opt.value} onClick={() => setWrapped(opt.value)}>
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Availability */}
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
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
          <span className="text-xs text-ink-500">
            Showing <strong className="text-ink-900">{shown}</strong> of {total} straws · prices in{" "}
            <strong className="text-ink-900">{currency}</strong> ·{" "}
            <strong className="text-ink-900">{rateMode === "ddp" ? "DDP India" : "EXW India"}</strong>
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
      {filtered.length === 0 ? (
        <div className="mt-6 rounded-md border border-dashed border-ink-200 bg-white p-8 text-center">
          <p className="font-semibold text-ink-900">No straws match these filters.</p>
          <p className="mt-1 text-sm text-ink-500">Try clearing the search or widening the material.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex rounded border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-100"
          >
            Clear filters
          </button>
        </div>
      ) : (
        filtered.map((section) => (
          <div key={section.key} className="mt-8">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-base font-bold text-ink-900">{section.label}</h3>
                <span className="text-xs text-ink-400">Rates shown: {basisLabel}</span>
              </div>
              <span className="font-mono text-xs text-ink-400">{section.rows.length} sizes</span>
            </div>
            {section.blurb && (
              <p className="mt-1 max-w-2xl text-xs text-ink-500">{section.blurb}</p>
            )}

            {/* Desktop table */}
            <div className="mt-3 hidden overflow-hidden rounded-md border border-ink-200 bg-white md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Bore</th>
                    <th className="px-3 py-2 font-medium">Length</th>
                    <th className="px-3 py-2 font-medium">Wrapping</th>
                    <th className="px-3 py-2 text-right font-medium">Case</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Unit rate
                      <span className="block font-normal normal-case tracking-normal text-ink-300">
                        {rateMode === "ddp" ? "DDP India" : "EXW India"}
                      </span>
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Case rate</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((r) => (
                    <Row key={r.sku} r={r} currency={currency} usdPerInr={usdPerInr} rateMode={rateMode} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mt-3 space-y-2 md:hidden">
              {section.rows.map((r) => (
                <MobileCard key={r.sku} r={r} currency={currency} usdPerInr={usdPerInr} rateMode={rateMode} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function Row({ r, currency, usdPerInr, rateMode }) {
  const entry = r.plain?.entry;
  const inr = pickInr(entry, rateMode);
  const rate = fmtUnit(currency, inr, usdPerInr);
  const caseRate = fmtCase(currency, inr, r.casePack, usdPerInr);

  return (
    <tr className="border-b border-ink-100 last:border-0">
      <td className="px-3 py-2 font-mono text-xs text-ink-600">{r.sku}</td>
      <td className="px-3 py-2 text-ink-600">{boreLabel(r.bore)}</td>
      <td className="px-3 py-2 text-ink-600">{r.length ?? "—"}</td>
      <td className="px-3 py-2 text-ink-600">
        {r.wrapped ? (
          <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">
            Wrapped
          </span>
        ) : (
          <span className="text-ink-400">Bulk</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-ink-600">
        {r.casePack ? r.casePack.toLocaleString("en-IN") : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        {rate ? (
          <div className="leading-tight">
            <span className="font-medium text-ink-900">{rate}</span>
            <span className="block text-[11px] text-ink-400">min {fmtQty(entry.minQty)} pcs</span>
          </div>
        ) : (
          <span className="text-ink-400">On request</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-ink-600">{caseRate ?? "—"}</td>
    </tr>
  );
}

function MobileCard({ r, currency, usdPerInr, rateMode }) {
  const entry = r.plain?.entry;
  const inr = pickInr(entry, rateMode);
  const rate = fmtUnit(currency, inr, usdPerInr);
  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-400">{r.sku}</p>
          <p className="mt-0.5 font-medium text-ink-900">
            {boreLabel(r.bore)} × {r.length ?? "—"}
            {r.wrapped ? " · wrapped" : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {rate ? (
            <>
              <p className="font-semibold text-ink-900">{rate}</p>
              <p className="text-xs text-ink-400">min {fmtQty(entry.minQty)} pcs</p>
            </>
          ) : (
            <p className="text-sm text-ink-400">On request</p>
          )}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-600">
        <Spec label="Material">{r.material ?? "—"}</Spec>
        <Spec label="Wrapping">{r.wrapped ? "Individually wrapped" : "Bulk"}</Spec>
        <Spec label="Case pack">{r.casePack ? `${r.casePack.toLocaleString("en-IN")} pcs` : "—"}</Spec>
        <Spec label="Case rate">{fmtCase(currency, inr, r.casePack, usdPerInr) ?? "—"}</Spec>
      </dl>
    </div>
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
