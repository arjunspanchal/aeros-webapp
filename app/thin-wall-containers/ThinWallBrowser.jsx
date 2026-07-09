"use client";

// Client-side browser for the public PP Thin-Wall Containers rate sheet.
// Receives already-merged + grouped `sections` from the server page (one row
// per size, each carrying a single-MOQ plain rate and its colour availability)
// and owns all filter state. The whole range is plain (injection-moulded PP
// takes no print); the masthead colour toggle narrows to Clear / Black bases.
// Currency / unit come from context.

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

// 25000 → "25K", 100000 → "1L", 1500 → "1.5K"
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

// ── Sizes ──────────────────────────────────────────────────────────────────
// Dims are stored as "L × W × H" (or "Ø D") mm; many items are dims-pending
// (null). Render honouring mm/in.
function sizeLabel(size, unit) {
  if (!size) return null;
  const round = size.match(/Ø\s*([\d./]+)\s*mm/i);
  if (round) {
    if (unit === "in") {
      const conv = round[1]
        .split("/")
        .map((n) => (Number(n) / 25.4).toFixed(1))
        .join("/");
      return `Ø ${conv} in`;
    }
    return `Ø ${round[1]} mm`;
  }
  const nums = (size.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
  if (nums.length === 0) return null;
  if (unit === "in") return `${nums.map((n) => (n / 25.4).toFixed(1)).join(" × ")} in`;
  return `${nums.join(" × ")} mm`;
}

// Colour availability → small swatch chips.
function ColourDots({ colours }) {
  if (!colours || colours.length === 0) return <span className="text-ink-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {colours.map((c) => (
        <span
          key={c}
          title={`${c} base · clear lid`}
          className={
            "inline-block h-3 w-3 rounded-full border " +
            (c === "Black" ? "border-ink-400 bg-ink-800" : "border-ink-300 bg-white")
          }
        />
      ))}
      <span className="ml-0.5 text-[11px] text-ink-500">{colours.join(" · ")}</span>
    </span>
  );
}

export default function ThinWallBrowser({ sections, priced, total, usdPerInr = 95 }) {
  const { currency, unit, colour } = useDisplay();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // "all" | section.key
  const [availability, setAvailability] = useState("all"); // "all" | "priced" | "request"

  const typeOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...sections.map((s) => ({ value: s.key, label: s.code, title: s.label })),
    ],
    [sections],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .filter((s) => type === "all" || s.key === type)
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => {
          if (q && !`${r.sku} ${r.name} ${r.volume ?? ""} ${r.size ?? ""}`.toLowerCase().includes(q))
            return false;
          if (colour !== "all" && !(r.colours || []).includes(colour)) return false;
          const hasPrice = r.plain?.entry != null;
          if (availability === "priced" && !hasPrice) return false;
          if (availability === "request" && hasPrice) return false;
          return true;
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [sections, query, type, colour, availability]);

  const shown = filtered.reduce((n, s) => n + s.rows.length, 0);
  const isFiltered =
    query.trim() !== "" || type !== "all" || colour !== "all" || availability !== "all";

  const reset = () => {
    setQuery("");
    setType("all");
    setAvailability("all");
  };

  return (
    <section id="rates" className="mt-12">
      <div className="flex items-baseline justify-between border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Full rate sheet</h2>
        <span className="font-mono text-xs text-ink-400">
          {priced} of {total} priced
        </span>
      </div>

      {/* Filter bar */}
      <div className="mt-4 rounded-md border border-ink-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label htmlFor="twc-search" className="block text-xs uppercase tracking-wide text-ink-400">
              Search
            </label>
            <input
              id="twc-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Code, capacity or name — e.g. 500ml, thali, lockable"
              className="mt-1.5 h-10 w-full rounded border border-ink-200 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-1 focus:ring-ink-900"
            />
          </div>

          <div>
            <span className="block text-xs uppercase tracking-wide text-ink-400">Type</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {typeOptions.map((opt) => (
                <Chip key={opt.value} active={type === opt.value} onClick={() => setType(opt.value)} title={opt.title}>
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {/* Availability */}
        <div className="mt-4">
          <span className="block text-xs uppercase tracking-wide text-ink-400">Availability</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[
              { value: "all", label: "All" },
              { value: "priced", label: "Priced" },
              { value: "request", label: "On request" },
            ].map((opt) => (
              <Chip key={opt.value} active={availability === opt.value} onClick={() => setAvailability(opt.value)}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
          <span className="text-xs text-ink-500">
            Showing <strong className="text-ink-900">{shown}</strong> of {total} items · prices in{" "}
            <strong className="text-ink-900">{currency}</strong> · base{" "}
            <strong className="text-ink-900">{colour === "all" ? "Clear + Black" : colour}</strong>
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
          <p className="font-semibold text-ink-900">No items match these filters.</p>
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
        filtered.map((section) => (
          <div key={section.key} className="mt-8">
            <div className="flex items-baseline justify-between">
              <h3 className="text-base font-bold text-ink-900">{section.label}</h3>
              <span className="font-mono text-xs text-ink-400">
                {section.rows.length} {section.isLid ? "lids" : "sizes"}
              </span>
            </div>
            {section.blurb && <p className="mt-1 max-w-2xl text-xs text-ink-500">{section.blurb}</p>}

            {/* Desktop table */}
            <div className="mt-3 hidden overflow-hidden rounded-md border border-ink-200 bg-white md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Capacity</th>
                    <th className="px-3 py-2 font-medium">Size (L×W×H)</th>
                    <th className="px-3 py-2 font-medium">Base colour</th>
                    <th className="px-3 py-2 text-right font-medium">Case</th>
                    <th className="px-3 py-2 text-right font-medium">Unit rate</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((r) => (
                    <Row key={r.sku} r={r} unit={unit} currency={currency} usdPerInr={usdPerInr} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mt-3 space-y-2 md:hidden">
              {section.rows.map((r) => (
                <MobileCard key={r.sku} r={r} unit={unit} currency={currency} usdPerInr={usdPerInr} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function Row({ r, unit, currency, usdPerInr }) {
  const entry = r.plain.entry;
  const rate = fmtUnit(currency, entry?.priceInr, usdPerInr);
  return (
    <tr className="border-b border-ink-100 last:border-0">
      <td className="px-3 py-2 font-mono text-xs text-ink-600">
        {r.sku}
        {r.name ? <span className="ml-1.5 font-sans text-ink-400">{r.name}</span> : null}
      </td>
      <td className="px-3 py-2 text-ink-900">{r.volume ?? "—"}</td>
      <td className="px-3 py-2 text-ink-600">{sizeLabel(r.size, unit) ?? "—"}</td>
      <td className="px-3 py-2"><ColourDots colours={r.colours} /></td>
      <td className="px-3 py-2 text-right text-ink-600">
        {r.casePack ? r.casePack.toLocaleString("en-IN") : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        {entry ? (
          <div className="leading-tight">
            <span className="font-medium text-ink-900">{rate}</span>
            <span className="block text-[11px] text-ink-400">min {fmtQty(entry.minQty)} pcs</span>
          </div>
        ) : (
          <span className="text-ink-400">On request</span>
        )}
      </td>
    </tr>
  );
}

function MobileCard({ r, unit, currency, usdPerInr }) {
  const entry = r.plain.entry;
  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-400">{r.sku}</p>
          <p className="mt-0.5 font-medium text-ink-900">
            {r.volume ?? "—"}
            {r.name ? ` · ${r.name}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {entry ? (
            <>
              <p className="font-semibold text-ink-900">{fmtUnit(currency, entry.priceInr, usdPerInr)}</p>
              <p className="text-xs text-ink-400">min {fmtQty(entry.minQty)} pcs</p>
            </>
          ) : (
            <p className="text-sm text-ink-400">On request</p>
          )}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-600">
        <Spec label="Size">{sizeLabel(r.size, unit) ?? "—"}</Spec>
        <Spec label="Base colour"><ColourDots colours={r.colours} /></Spec>
        <Spec label="Case pack">{r.casePack ? `${r.casePack.toLocaleString("en-IN")} pcs` : "—"}</Spec>
        <Spec label="Case rate">{fmtCase(currency, entry?.priceInr, r.casePack, usdPerInr) ?? "—"}</Spec>
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
