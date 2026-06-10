"use client";

// Client-side browser for the public PP cup & IM lid rate sheet. Receives the
// already-fetched + grouped `sections` from the server page and owns all filter
// state (search, type, volume, availability). Custom-branded cup pricing is a
// quantity ladder, so a row summarises its price span and expands to reveal the
// full break table; plain cups carry a single MOQ price and PP lids carry a
// multi-break IM ladder. Displayed currency/unit/offering come from the shared
// CurrencyProvider — no data fetching here.

import { useMemo, useState } from "react";
import { useDisplay, OfferingToggle, BasisToggle } from "./Currency";

// ── Money ──────────────────────────────────────────────────────────────────
// Pick a slab's price for the active basis: EXW India (export / FCL) is the
// live priceInr; India DDP is the delivered india_landed_inr (may be null →
// "on request").
function priceFor(slab, basis) {
  if (!slab) return null;
  return basis === "ddp" ? slab.ddpInr ?? null : slab.priceInr ?? null;
}

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
// Cups put volume first then dims after "|":
//   "12oz / 350ml | 90 x 57 x 100 mm (TD x BD x H)"
// Round lids: "Ø 90 mm". Rectangular lids: "170 x 120 mm".
// Render a size label honouring the mm/in unit toggle.
function sizeLabel(size, unit) {
  if (!size) return null;
  // Round lid: keep the Ø marker, convert the number(s) when in inches.
  const round = size.match(/[ØO]\s*([\d./]+)\s*mm/i);
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
  // rectangular lids).
  const tail = size.includes("|") ? size.split("|").slice(1).join("|") : size;
  const nums = (tail.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
  if (nums.length === 0) return null;
  if (unit === "in") {
    return `${nums.map((n) => (n / 25.4).toFixed(1)).join(" × ")} in`;
  }
  return `${nums.join(" × ")} mm`;
}

// Carton dimensions are stored in mm ("L × W × H"). Cartons read naturally in
// cm (metric) or inches, so convert off the mm/in toggle. Returns null when not
// measured yet.
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

export default function PpCupsBrowser({
  sections,
  plainPriced,
  printedPriced,
  total,
  usdPerInr = 90,
}) {
  const { currency, unit, offering, basis } = useDisplay();
  const priced = offering === "printed" ? printedPriced : plainPriced;
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // "all" | section.key
  const [volume, setVolume] = useState("all"); // "all" | oz number
  const [finish, setFinish] = useState("all"); // "all" | "Clear" | "Frosted"
  const [origin, setOrigin] = useState("all"); // "all" | country string
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

  // Distinct cup finishes present (Clear / Frosted) — drives the finish filter.
  // Lids carry no finish, so the filter only appears when cups span both.
  const finishOptions = useMemo(() => {
    const set = new Set();
    for (const s of sections) for (const r of s.rows) if (r.finish) set.add(r.finish);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sections]);

  // Distinct countries of origin present, alphabetical — drives the origin filter.
  const originOptions = useMemo(() => {
    const set = new Set();
    for (const s of sections) for (const r of s.rows) if (r.origin) set.add(r.origin);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sections]);

  // Surface each item's origin (filter + inline badge) only when the range
  // spans more than one country — otherwise it's redundant clutter.
  const showOrigin = originOptions.length > 1;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .filter((s) => type === "all" || s.key === type)
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => {
          if (
            q &&
            !`${r.sku} ${r.name} ${r.forming ?? ""} ${r.profile ?? ""} ${r.finish ?? ""} ${r.volume ?? ""} ${r.size ?? ""} ${r.origin ?? ""}`
              .toLowerCase()
              .includes(q)
          )
            return false;
          if (volume !== "all" && r.oz !== volume) return false;
          if (finish !== "all" && r.finish !== finish) return false;
          if (origin !== "all" && r.origin !== origin) return false;
          const hasPrice = r[offering]?.entry != null;
          if (availability === "priced" && !hasPrice) return false;
          if (availability === "request" && hasPrice) return false;
          return true;
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [sections, query, type, volume, finish, origin, availability, offering]);

  const shown = filtered.reduce((n, s) => n + s.rows.length, 0);
  const isFiltered =
    query.trim() !== "" ||
    type !== "all" ||
    volume !== "all" ||
    finish !== "all" ||
    origin !== "all" ||
    availability !== "all";

  const reset = () => {
    setQuery("");
    setType("all");
    setVolume("all");
    setFinish("all");
    setOrigin("all");
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

      {/* Offering switch — flips the whole sheet between plain and customised rates. */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-ink-200 bg-white px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Showing rates for</span>
        <OfferingToggle />
        <span className="text-xs text-ink-500">
          {offering === "printed"
            ? "Custom-branded cups · quantity ladder from 5,000 pcs · lids are supplied plain"
            : "Plain, unprinted cups & lids"}
        </span>
      </div>

      {/* Pricing basis — flips between export EXW (FCL) and India delivered (DDP). */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-ink-200 bg-white px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Pricing basis</span>
        <BasisToggle />
        <span className="text-xs text-ink-500">
          {basis === "ddp"
            ? "India DDP · delivered duty-paid within India, full-container (FCL) loads"
            : "FCL · ex-works at origin (China / India), full-container loads · freight & duties on buyer"}
        </span>
      </div>

      {/* Filter bar */}
      <div className="mt-4 rounded-md border border-ink-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          {/* Search */}
          <div>
            <label htmlFor="pp-search" className="block text-xs uppercase tracking-wide text-ink-400">
              Search
            </label>
            <input
              id="pp-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Code, size or name — e.g. 16oz, frosted, u-bottom, 90mm, string lock"
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

        {/* Cup finish (Clear / Frosted) — appears once cups span both finishes. */}
        {finishOptions.length > 1 && (
          <div className="mt-4">
            <span className="block text-xs uppercase tracking-wide text-ink-400">Cup finish</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip active={finish === "all"} onClick={() => setFinish("all")}>
                All
              </Chip>
              {finishOptions.map((f) => (
                <Chip key={f} active={finish === f} onClick={() => setFinish(f)}>
                  {f}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Origin (China / India) — appears once the range spans 2+ countries. */}
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
                {section.rows.length} {section.countWord || (section.isLid ? "sizes" : "cups")}
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
                        basis={basis}
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
                  basis={basis}
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
function FragmentRows({ r, off, unit, currency, usdPerInr, basis, showOrigin, hasLadder, isOpen, onToggle }) {
  const entry = off.entry; // lowest qty (highest price)
  const best = off.best; // highest qty (lowest price)
  const entryInr = priceFor(entry, basis);
  const bestInr = priceFor(best, basis);
  const entryRate = fmtUnit(currency, entryInr, usdPerInr);
  const bestRate = fmtUnit(currency, bestInr, usdPerInr);

  let rateCell;
  if (!entry || entryInr == null) {
    rateCell = <span className="text-ink-400">On request</span>;
  } else if (hasLadder && bestInr != null) {
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
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {r.name ? <span>{r.name}</span> : null}
            {r.profile && <ProfileTag>{r.profile}</ProfileTag>}
            {r.forming && <FormingTag>{r.forming}</FormingTag>}
            {showOrigin && r.origin ? <OriginTag origin={r.origin} /> : null}
            {!r.name && !r.profile && !r.forming ? <span>—</span> : null}
          </div>
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
            <LadderTable r={r} off={off} currency={currency} usdPerInr={usdPerInr} basis={basis} />
          </td>
        </tr>
      )}
    </>
  );
}

function LadderTable({ r, off, currency, usdPerInr, basis }) {
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
            const inr = priceFor(s, basis);
            return (
              <tr key={s.minQty} className="border-b border-ink-50 last:border-0">
                <td className="px-3 py-1.5 text-ink-700">{s.minQty.toLocaleString("en-IN")}+</td>
                <td className="px-3 py-1.5 text-right font-medium text-ink-900">
                  {fmtUnit(currency, inr, usdPerInr) ?? <span className="font-normal text-ink-400">On request</span>}
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

function MobileCard({ r, off, unit, currency, usdPerInr, basis, showOrigin }) {
  const entry = off.entry;
  const best = off.best;
  const entryInr = priceFor(entry, basis);
  const bestInr = priceFor(best, basis);
  const hasLadder = off.slabs.length > 1;
  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-400">{r.sku}</p>
          <p className="mt-0.5 font-medium text-ink-900">
            {r.volume ?? sizeLabel(r.size, unit) ?? "—"} {r.name ? `· ${r.name}` : ""}
          </p>
          {(r.profile || r.forming) && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {r.profile && <ProfileTag>{r.profile}</ProfileTag>}
              {r.forming && <FormingTag>{r.forming}</FormingTag>}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {entry && entryInr != null ? (
            <>
              <p className="font-semibold text-ink-900">
                {hasLadder && bestInr != null
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
        {r.finish ? <Spec label="Finish">{r.finish}</Spec> : null}
        <Spec label="Weight">{r.weightG != null ? `${r.weightG} g` : "—"}</Spec>
        <Spec label="Case pack">{r.casePack ? `${r.casePack.toLocaleString("en-IN")} pcs` : "—"}</Spec>
        <Spec label="Carton">{cartonLabel(r.carton, unit) ?? "—"}</Spec>
        {showOrigin && r.origin ? <Spec label="Origin">{r.origin}</Spec> : null}
      </dl>
      {hasLadder && (
        <div className="mt-2 border-t border-ink-100 pt-2">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-400">Quantity breaks</p>
          <LadderTable r={r} off={off} currency={currency} usdPerInr={usdPerInr} basis={basis} />
        </div>
      )}
    </div>
  );
}

// Compact mono badges — monochrome to fit the Aeros palette. Spacing comes
// from the flex-gap containers they sit in, not the tags themselves.
const TAG_CLASS =
  "rounded border border-ink-200 px-1.5 py-0.5 align-middle font-mono text-[10px] uppercase tracking-wide text-ink-500";

function OriginTag({ origin }) {
  return <span className={TAG_CLASS}>{origin}</span>;
}

function FormingTag({ children }) {
  return <span className={TAG_CLASS}>{children}</span>;
}

// Cup bottom profile (F-Bottom / U-Bottom) — slightly darker so the profile
// reads as the item's primary tag.
function ProfileTag({ children }) {
  return (
    <span className="rounded border border-ink-300 bg-ink-50 px-1.5 py-0.5 align-middle font-mono text-[10px] font-medium uppercase tracking-wide text-ink-700">
      {children}
    </span>
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
