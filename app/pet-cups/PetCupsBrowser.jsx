"use client";

// Client-side browser for the public PET cup & lid rate sheet. Receives the
// already-fetched + grouped `sections` from the server page and owns all filter
// state (search, type, volume, availability). Custom-branded cup pricing is a
// quantity ladder, so a row summarises its price span and expands to reveal the
// full break table; plain items and lids carry a single MOQ price. Displayed
// currency/unit/offering come from the shared CurrencyProvider — no data
// fetching here.

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

// Pick the active-basis unit price from a slab: FCL (priceInr / EXW) or India
// DDP (ddpInr). DDP is null when the SKU has no delivered rate costed yet → the
// row falls through to "On request" under the DDP basis.
function pickInr(slab, rateMode) {
  if (!slab) return null;
  return rateMode === "ddp" ? slab.ddpInr ?? null : slab.priceInr;
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
// Cups put volume first then dims after "|":
//   "300ml / 10oz | 80 x 45 x 112 mm (TD x BD x H)"
// Round lids: "Ø 90 mm" or twin "Ø 73/75 mm". Square lids: "125 x 125 mm".
// Render a size label honouring the mm/in unit toggle.
function sizeLabel(size, unit) {
  if (!size) return null;
  // Round lid: keep the Ø marker, convert the number(s) when in inches.
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
  // Otherwise pull the dimension numbers (after "|" for cups, whole string for
  // square lids).
  const tail = size.includes("|") ? size.split("|").slice(1).join("|") : size;
  const nums = (tail.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
  if (nums.length === 0) return null;
  if (unit === "in") {
    return `${nums.map((n) => (n / 25.4).toFixed(1)).join(" × ")} in`;
  }
  return `${nums.join(" × ")} mm`;
}

// Carton dimensions are stored in mm ("L × W × H"). Cartons read naturally in
// cm (metric) or inches, so convert off the mm/in toggle: mm → cm (÷10), in →
// inches (÷25.4). Returns null when not costed/measured yet.
function cartonLabel(carton, unit) {
  if (!carton) return null;
  const nums = (String(carton).match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
  if (nums.length === 0) return null;
  const trim = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (unit === "in") {
    return `${nums.map((n) => trim(n / 25.4)).join(" × ")} in`;
  }
  return `${nums.map((n) => trim(n / 10)).join(" × ")} cm`;
}

export default function PetCupsBrowser({
  sections,
  plainPriced,
  printedPriced,
  total,
  usdPerInr = 90,
}) {
  const { currency, unit, offering, rateMode } = useDisplay();
  const basisLabel = rateMode === "ddp" ? "DDP India · incl. freight + GST" : "EXW India · FCL";
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // "all" | section.key
  const [volume, setVolume] = useState("all"); // "all" | oz number
  const [diameter, setDiameter] = useState("all"); // "all" | dia (mm)
  const [origin, setOrigin] = useState("all"); // "all" | country (e.g. "India")
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

  // Distinct oz sizes present in the cup data, ascending — drives the volume filter.
  const volumeOptions = useMemo(() => {
    const set = new Set();
    for (const s of sections) for (const r of s.rows) if (r.oz != null) set.add(r.oz);
    return [...set].sort((a, b) => a - b);
  }, [sections]);

  // Distinct rim diameters (mm) across cups (TD) and lids (Ø), ascending —
  // drives the cross-cutting diameter filter so a cup and its lid match up.
  const diameterOptions = useMemo(() => {
    const set = new Set();
    for (const s of sections) for (const r of s.rows) if (r.dia != null) set.add(r.dia);
    return [...set].sort((a, b) => a - b);
  }, [sections]);

  // Distinct countries of origin present, sorted — drives the origin filter.
  // Renders only once there are 2+ (e.g. when China cups join the India range).
  const originOptions = useMemo(() => {
    const set = new Set();
    for (const s of sections) for (const r of s.rows) if (r.origin) set.add(r.origin);
    return [...set].sort((a, b) => a.localeCompare(b));
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
            !`${r.sku} ${r.name} ${r.volume ?? ""} ${r.size ?? ""} ${r.origin ?? ""}`
              .toLowerCase()
              .includes(q)
          )
            return false;
          if (volume !== "all" && r.oz !== volume) return false;
          if (diameter !== "all" && r.dia !== diameter) return false;
          if (origin !== "all" && r.origin !== origin) return false;
          // "Priced" follows the active basis: a row counts as priced only if its
          // entry slab has a live rate in the current FCL/DDP mode.
          const hasPrice = pickInr(r[offering]?.entry, rateMode) != null;
          if (availability === "priced" && !hasPrice) return false;
          if (availability === "request" && hasPrice) return false;
          return true;
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [sections, query, type, volume, diameter, origin, availability, offering, rateMode]);

  // Items with a live rate in the current offering + basis (drives the header
  // "n of N priced" tally so it stays honest when toggling FCL ↔ DDP).
  const pricedCount = useMemo(() => {
    let n = 0;
    for (const s of sections)
      for (const r of s.rows) if (pickInr(r[offering]?.entry, rateMode) != null) n += 1;
    return n;
  }, [sections, offering, rateMode]);

  const shown = filtered.reduce((n, s) => n + s.rows.length, 0);
  // Surface each item's origin only when the range spans more than one country —
  // no point tagging every row "India" when that's the whole catalogue.
  const showOrigin = originOptions.length > 1;
  const isFiltered =
    query.trim() !== "" ||
    type !== "all" ||
    volume !== "all" ||
    diameter !== "all" ||
    origin !== "all" ||
    availability !== "all";

  const reset = () => {
    setQuery("");
    setType("all");
    setVolume("all");
    setDiameter("all");
    setOrigin("all");
    setAvailability("all");
  };

  return (
    <section id="rates" className="mt-12">
      <div className="flex items-baseline justify-between border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Full rate sheet</h2>
        <span className="font-mono text-xs text-ink-400">
          {pricedCount} of {total} priced
        </span>
      </div>

      {/* Offering switch — flips the whole sheet between plain and customised rates. */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-ink-200 bg-white px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Showing rates for</span>
        <OfferingToggle />
        <span className="text-xs text-ink-500">
          {offering === "printed"
            ? "Custom-branded cups · quantity ladder from 1,000 pcs · lids are supplied plain"
            : "Plain, unprinted cups & lids"}
        </span>
        <span className="ml-auto rounded-full bg-ink-100 px-2.5 py-1 font-mono text-[11px] text-ink-600">
          {basisLabel}
        </span>
      </div>

      {/* Filter bar */}
      <div className="mt-4 rounded-md border border-ink-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          {/* Search */}
          <div>
            <label htmlFor="pet-search" className="block text-xs uppercase tracking-wide text-ink-400">
              Search
            </label>
            <input
              id="pet-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Code, size or name — e.g. 16oz, 98mm, dome, sipper"
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

        {/* Volume (cups only) */}
        {volumeOptions.length > 0 && (
          <div className="mt-4">
            <span className="block text-xs uppercase tracking-wide text-ink-400">Cup volume</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip active={volume === "all"} onClick={() => setVolume("all")}>
                All
              </Chip>
              {volumeOptions.map((oz) => (
                <Chip key={oz} active={volume === oz} onClick={() => setVolume(oz)}>
                  {oz}oz
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Diameter (cup TD / lid Ø) */}
        {diameterOptions.length > 0 && (
          <div className="mt-4">
            <span className="block text-xs uppercase tracking-wide text-ink-400">
              Diameter <span className="normal-case text-ink-300">(cup TD / lid Ø)</span>
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

        {/* Origin (India / China) — appears once the range spans 2+ countries. */}
        {originOptions.length > 1 && (
          <div className="mt-4">
            <span className="block text-xs uppercase tracking-wide text-ink-400">Origin</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip active={origin === "all"} onClick={() => setOrigin("all")}>
                All
              </Chip>
              {originOptions.map((c) => (
                <Chip key={c} active={origin === c} onClick={() => setOrigin(c)}>
                  {c}
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
          <div key={section.key} className="mt-8">
            <div className="flex items-baseline justify-between">
              <h3 className="text-base font-bold text-ink-900">{section.label}</h3>
              <span className="font-mono text-xs text-ink-400">
                {section.rows.length} {section.isLid ? "sizes" : "cups"}
              </span>
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
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">{section.isLid ? "Fits / capacity" : "Capacity"}</th>
                    <th className="px-3 py-2 font-medium">{section.isLid ? "Diameter / size" : "Size (TD×BD×H)"}</th>
                    <th className="px-3 py-2 text-right font-medium">Wt</th>
                    <th className="px-3 py-2 text-right font-medium">Case / carton</th>
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
                        unit={unit}
                        currency={currency}
                        usdPerInr={usdPerInr}
                        rateMode={rateMode}
                        showOrigin={showOrigin}
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
                  unit={unit}
                  currency={currency}
                  usdPerInr={usdPerInr}
                  rateMode={rateMode}
                  showOrigin={showOrigin}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

// One item = a summary row plus an expandable ladder detail row.
function FragmentRows({ r, off, unit, currency, usdPerInr, rateMode, showOrigin, hasLadder, isOpen, onToggle }) {
  const entry = off.entry; // lowest qty (highest price)
  const best = off.best; // highest qty (lowest price)
  const entryInr = pickInr(entry, rateMode);
  const bestInr = pickInr(best, rateMode);
  const entryRate = fmtUnit(currency, entryInr, usdPerInr);
  const bestRate = fmtUnit(currency, bestInr, usdPerInr);

  let rateCell;
  if (entryInr == null) {
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
          "border-b border-ink-100 last:border-0 " +
          (hasLadder ? "cursor-pointer hover:bg-ink-50" : "")
        }
        onClick={hasLadder ? onToggle : undefined}
      >
        <td className="px-3 py-2 font-mono text-xs text-ink-600">{r.sku}</td>
        <td className="px-3 py-2 text-ink-900">
          {r.name || "—"}
          {showOrigin && r.origin ? <OriginTag origin={r.origin} /> : null}
        </td>
        <td className="px-3 py-2 text-ink-600">{r.volume ?? "—"}</td>
        <td className="px-3 py-2 text-ink-600">{sizeLabel(r.size, unit) ?? "—"}</td>
        <td className="px-3 py-2 text-right text-ink-600">
          {r.weightG != null ? `${r.weightG} g` : "—"}
        </td>
        <td className="px-3 py-2 text-right text-ink-600">
          <div className="leading-tight">
            <span>{r.casePack ? r.casePack.toLocaleString("en-IN") : "—"}</span>
            {cartonLabel(r.carton, unit) ? (
              <span className="block text-[11px] text-ink-400">{cartonLabel(r.carton, unit)}</span>
            ) : null}
          </div>
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
          <td colSpan={8} className="px-3 py-3">
            <LadderTable r={r} off={off} currency={currency} usdPerInr={usdPerInr} rateMode={rateMode} />
          </td>
        </tr>
      )}
    </>
  );
}

function LadderTable({ r, off, currency, usdPerInr, rateMode }) {
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
          {off.slabs.map((s) => {
            const inr = pickInr(s, rateMode);
            return (
              <tr key={s.minQty} className="border-b border-ink-50 last:border-0">
                <td className="px-3 py-1.5 text-ink-700">{s.minQty.toLocaleString("en-IN")}+</td>
                <td className="px-3 py-1.5 text-right font-medium text-ink-900">
                  {fmtUnit(currency, inr, usdPerInr) ?? <span className="text-ink-400">On request</span>}
                </td>
                <td className="px-3 py-1.5 text-right text-ink-600">
                  {fmtCase(currency, inr, r.casePack, usdPerInr) ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MobileCard({ r, off, unit, currency, usdPerInr, rateMode, showOrigin }) {
  const entry = off.entry;
  const best = off.best;
  const hasLadder = off.slabs.length > 1;
  const entryInr = pickInr(entry, rateMode);
  const bestInr = pickInr(best, rateMode);
  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-400">{r.sku}</p>
          <p className="mt-0.5 font-medium text-ink-900">
            {r.volume ?? sizeLabel(r.size, unit) ?? "—"} {r.name ? `· ${r.name}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {entryInr != null ? (
            <>
              <p className="font-semibold text-ink-900">
                {hasLadder
                  ? `${fmtUnit(currency, bestInr, usdPerInr)}–${fmtUnit(currency, entryInr, usdPerInr)}`
                  : fmtUnit(currency, entryInr, usdPerInr)}
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
        <Spec label="Weight">{r.weightG != null ? `${r.weightG} g` : "—"}</Spec>
        <Spec label="Case pack">{r.casePack ? `${r.casePack.toLocaleString("en-IN")} pcs` : "—"}</Spec>
        <Spec label="Carton">{cartonLabel(r.carton, unit) ?? "—"}</Spec>
        {showOrigin && r.origin ? <Spec label="Origin">{r.origin}</Spec> : null}
      </dl>
      {hasLadder && (
        <div className="mt-2 border-t border-ink-100 pt-2">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-400">Quantity breaks</p>
          <LadderTable r={r} off={off} currency={currency} usdPerInr={usdPerInr} rateMode={rateMode} />
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

// Small muted "made in" tag shown beside an item name once the range spans more
// than one origin (e.g. India vs China).
function OriginTag({ origin }) {
  return (
    <span className="ml-2 rounded border border-ink-200 px-1.5 py-0.5 align-middle font-mono text-[10px] uppercase tracking-wide text-ink-500">
      {origin}
    </span>
  );
}
