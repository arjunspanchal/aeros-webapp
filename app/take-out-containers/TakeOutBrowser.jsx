"use client";

// Client-side browser for the public Take Out Containers rate sheet. Receives
// already-merged + grouped `sections` from the server page (each row carries a
// plain + printed ladder) and owns all filter state. The Plain/Customised
// toggle (from CurrencyProvider) picks which ladder shows; rows with no
// customised rate show "On request". Currency / unit also come from context.

import { useMemo, useState } from "react";
import { useDisplay, OfferingToggle } from "./Currency";

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
// Containers put capacity first then dims after "|"; lids are their own size
// ("Ø 98 mm" or "125 x 125 mm"). Render the dim tail, honouring mm/in.
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
  const tail = size.includes("|") ? size.split("|").slice(1).join("|") : size;
  const nums = (tail.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
  if (nums.length === 0) return null;
  if (unit === "in") {
    return `${nums.map((n) => (n / 25.4).toFixed(1)).join(" × ")} in`;
  }
  return `${nums.join(" × ")} mm`;
}

export default function TakeOutBrowser({ sections, plainPriced, printedPriced, total, usdPerInr = 90 }) {
  const { currency, unit, offering } = useDisplay();
  const priced = offering === "printed" ? printedPriced : plainPriced;
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // "all" | section.key
  const [diameter, setDiameter] = useState("all"); // "all" | Ø number (mm)
  const [material, setMaterial] = useState("all"); // "all" | material string
  const [availability, setAvailability] = useState("all"); // "all" | "priced" | "request"
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (sku) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });

  const typeOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...sections.map((s) => ({ value: s.key, label: s.code, title: s.label })),
    ],
    [sections],
  );

  const materialOptions = useMemo(() => {
    const set = new Set();
    for (const s of sections) for (const r of s.rows) if (r.material) set.add(r.material);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sections]);

  // Distinct round top diameters (mm) across containers AND lids — drives the Ø
  // filter that cross-filters a tub together with its matching lid.
  const diameterOptions = useMemo(() => {
    const set = new Set();
    for (const s of sections) for (const r of s.rows) if (r.diameter != null) set.add(r.diameter);
    return [...set].sort((a, b) => a - b);
  }, [sections]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .filter((s) => type === "all" || s.key === type)
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => {
          if (q && !`${r.sku} ${r.name} ${r.volume ?? ""} ${r.size ?? ""} ${r.material ?? ""}`.toLowerCase().includes(q))
            return false;
          if (diameter !== "all" && r.diameter !== diameter) return false;
          if (material !== "all" && r.material !== material) return false;
          const hasPrice = r[offering]?.entry != null;
          if (availability === "priced" && !hasPrice) return false;
          if (availability === "request" && hasPrice) return false;
          return true;
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [sections, query, type, diameter, material, availability, offering]);

  const shown = filtered.reduce((n, s) => n + s.rows.length, 0);
  const firstLidKey = filtered.find((s) => s.isLid)?.key ?? null;
  const isFiltered =
    query.trim() !== "" ||
    type !== "all" ||
    diameter !== "all" ||
    material !== "all" ||
    availability !== "all";

  const reset = () => {
    setQuery("");
    setType("all");
    setDiameter("all");
    setMaterial("all");
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

      {/* Offering switch — flips the whole sheet between plain and customised. */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-ink-200 bg-white px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Showing rates for</span>
        <OfferingToggle />
        <span className="text-xs text-ink-500">
          {offering === "printed"
            ? "Custom-printed items · quantity ladder · plate billed separately · items without a printed rate show on request"
            : "Plain, unprinted stock"}
        </span>
      </div>

      {/* Filter bar */}
      <div className="mt-4 rounded-md border border-ink-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label htmlFor="toc-search" className="block text-xs uppercase tracking-wide text-ink-400">
              Search
            </label>
            <input
              id="toc-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Code, size or name — e.g. 750ml, 148mm, kraft, B2"
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

        {/* Top diameter — cross-filters round tubs and the lids that fit them. */}
        {diameterOptions.length > 1 && (
          <div className="mt-4">
            <span className="block text-xs uppercase tracking-wide text-ink-400">
              Top diameter (Ø) — matches tubs &amp; their lids
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip active={diameter === "all"} onClick={() => setDiameter("all")}>
                All
              </Chip>
              {diameterOptions.map((d) => (
                <Chip key={d} active={diameter === d} onClick={() => setDiameter(d)}>
                  Ø{d}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Material */}
        {materialOptions.length > 1 && (
          <div className="mt-4">
            <span className="block text-xs uppercase tracking-wide text-ink-400">Material</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip active={material === "all"} onClick={() => setMaterial("all")}>
                All
              </Chip>
              {materialOptions.map((m) => (
                <Chip key={m} active={material === m} onClick={() => setMaterial(m)}>
                  {m}
                </Chip>
              ))}
            </div>
          </div>
        )}

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
          <div key={section.key}>
            {/* Divider before the first lid section. */}
            {section.isLid && section.key === firstLidKey && (
              <div className="mt-12 border-t-2 border-ink-300 pt-6">
                <h2 className="text-lg font-bold text-ink-900">Lids</h2>
                <p className="mt-1 max-w-2xl text-sm text-ink-500">
                  Flat &amp; dome lids that fit the tubs and bowls above — matched by diameter (round)
                  or footprint (square / rectangular). Sipper cold-cup lids are not listed.
                </p>
              </div>
            )}

            <div className="mt-8">
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
                      {section.isLid && <th className="px-3 py-2 font-medium">Type</th>}
                      <th className="px-3 py-2 font-medium">{section.isLid ? "Fits" : "Capacity"}</th>
                      <th className="px-3 py-2 font-medium">{section.isLid ? "Lid size" : "Size (TD×BD×H)"}</th>
                      <th className="px-3 py-2 font-medium">Material</th>
                      <th className="px-3 py-2 text-right font-medium">Case</th>
                      <th className="px-3 py-2 text-right font-medium">Unit rate</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((r) => {
                      const off = r[offering];
                      const hasLadder = off.slabs.length > 1;
                      const isOpen = expanded.has(r.sku);
                      return (
                        <FragmentRows
                          key={r.sku}
                          r={r}
                          off={off}
                          isLid={section.isLid}
                          unit={unit}
                          currency={currency}
                          usdPerInr={usdPerInr}
                          hasLadder={hasLadder}
                          isOpen={isOpen}
                          onToggle={() => toggle(r.sku)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="mt-3 space-y-2 md:hidden">
                {section.rows.map((r) => (
                  <MobileCard
                    key={r.sku}
                    r={r}
                    off={r[offering]}
                    isLid={section.isLid}
                    unit={unit}
                    currency={currency}
                    usdPerInr={usdPerInr}
                  />
                ))}
              </div>
            </div>
          </div>
        ))
      )}
    </section>
  );
}

// One item = a summary row plus an expandable ladder detail row.
function FragmentRows({ r, off, isLid, unit, currency, usdPerInr, hasLadder, isOpen, onToggle }) {
  const entry = off.entry; // lowest qty (highest price)
  const best = off.best; // highest qty (lowest price)
  const entryRate = fmtUnit(currency, entry?.priceInr, usdPerInr);
  const bestRate = fmtUnit(currency, best?.priceInr, usdPerInr);

  let rateCell;
  if (!entry) {
    rateCell = <span className="text-ink-400">On request</span>;
  } else if (hasLadder) {
    rateCell = (
      <div className="leading-tight">
        <span className="font-medium text-ink-900">
          {bestRate}–{entryRate}
        </span>
        <span className="block text-[11px] text-ink-400">
          {fmtQty(best.minQty)}↓ · {fmtQty(entry.minQty)}↑
        </span>
      </div>
    );
  } else {
    rateCell = (
      <div className="leading-tight">
        <span className="font-medium text-ink-900">{entryRate}</span>
        <span className="block text-[11px] text-ink-400">min {fmtQty(entry.minQty)} pcs</span>
      </div>
    );
  }

  return (
    <>
      <tr
        className={
          "border-b border-ink-100 last:border-0 " + (hasLadder ? "cursor-pointer hover:bg-ink-50" : "")
        }
        onClick={hasLadder ? onToggle : undefined}
      >
        <td className="px-3 py-2 font-mono text-xs text-ink-600">{r.sku}</td>
        {isLid && <td className="px-3 py-2 text-ink-900">{r.name || "—"}</td>}
        <td className="px-3 py-2 text-ink-600">{(isLid ? r.fits : r.volume) ?? "—"}</td>
        <td className="px-3 py-2 text-ink-600">{sizeLabel(r.size, unit) ?? "—"}</td>
        <td className="px-3 py-2 text-ink-600">{r.material ?? "—"}</td>
        <td className="px-3 py-2 text-right text-ink-600">
          {r.casePack ? r.casePack.toLocaleString("en-IN") : "—"}
        </td>
        <td className="px-3 py-2 text-right">{rateCell}</td>
        <td className="px-3 py-2 text-right">
          {hasLadder ? (
            <span
              className={"inline-block text-ink-400 transition-transform " + (isOpen ? "rotate-180" : "")}
              aria-hidden="true"
            >
              ▾
            </span>
          ) : null}
        </td>
      </tr>
      {hasLadder && isOpen && (
        <tr className="border-b border-ink-100 bg-ink-50/60">
          <td colSpan={isLid ? 8 : 7} className="px-3 py-3">
            <LadderTable r={r} off={off} currency={currency} usdPerInr={usdPerInr} />
          </td>
        </tr>
      )}
    </>
  );
}

function LadderTable({ r, off, currency, usdPerInr }) {
  return (
    <div className="rounded border border-ink-200 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-ink-100 text-left uppercase tracking-wide text-ink-400">
            <th className="px-3 py-1.5 font-medium">Order qty (pcs)</th>
            <th className="px-3 py-1.5 text-right font-medium">Unit rate</th>
            <th className="px-3 py-1.5 text-right font-medium">Case rate</th>
          </tr>
        </thead>
        <tbody>
          {off.slabs.map((s) => (
            <tr key={s.minQty} className="border-b border-ink-50 last:border-0">
              <td className="px-3 py-1.5 text-ink-700">{s.minQty.toLocaleString("en-IN")}+</td>
              <td className="px-3 py-1.5 text-right font-medium text-ink-900">
                {fmtUnit(currency, s.priceInr, usdPerInr)}
              </td>
              <td className="px-3 py-1.5 text-right text-ink-600">
                {fmtCase(currency, s.priceInr, r.casePack, usdPerInr) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCard({ r, off, isLid, unit, currency, usdPerInr }) {
  const entry = off.entry;
  const best = off.best;
  const hasLadder = off.slabs.length > 1;
  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-400">{r.sku}</p>
          <p className="mt-0.5 font-medium text-ink-900">
            {(isLid ? sizeLabel(r.size, unit) : r.volume ?? sizeLabel(r.size, unit)) ?? "—"}
            {r.name ? ` · ${r.name}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {entry ? (
            <>
              <p className="font-semibold text-ink-900">
                {hasLadder
                  ? `${fmtUnit(currency, best.priceInr, usdPerInr)}–${fmtUnit(currency, entry.priceInr, usdPerInr)}`
                  : fmtUnit(currency, entry.priceInr, usdPerInr)}
              </p>
              <p className="text-xs text-ink-400">
                {hasLadder ? `${fmtQty(best.minQty)}–${fmtQty(entry.minQty)} pcs` : `min ${fmtQty(entry.minQty)} pcs`}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-400">On request</p>
          )}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-600">
        <Spec label="Size">{sizeLabel(r.size, unit) ?? "—"}</Spec>
        {isLid && <Spec label="Fits">{r.fits ?? "—"}</Spec>}
        <Spec label="Material">{r.material ?? "—"}</Spec>
        <Spec label="Case pack">{r.casePack ? `${r.casePack.toLocaleString("en-IN")} pcs` : "—"}</Spec>
      </dl>
      {hasLadder && (
        <div className="mt-2 border-t border-ink-100 pt-2">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-400">Quantity breaks</p>
          <LadderTable r={r} off={off} currency={currency} usdPerInr={usdPerInr} />
        </div>
      )}
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
