"use client";

// Client-side browser for the public paper-cup rate sheet. Receives the
// already-fetched + grouped `sections` from the server page and owns all
// filter state (search, wall type, finish, lining, availability). Cup pricing
// is a quantity ladder, so each row summarises its price span and expands to
// reveal the full break table. Displayed currency/unit come from the shared
// CurrencyProvider — no data fetching here.

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

// 25000 → "25K", 100000 → "1L", 500000 → "5L", 1500 → "1.5K"
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
// Cup size strings put the volume first, then dims after a "|":
// "10oz | 90 x 60 x 96 mm (TD x BD x H)". Parse the three numbers AFTER "|".
function parseDims(size) {
  if (!size) return null;
  const tail = size.includes("|") ? size.split("|").slice(1).join("|") : size;
  const nums = (tail.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
  return nums.length === 3 ? nums : null;
}

// Double-wall and ripple cups are built from two boards — show inner / outer
// GSM when both are present; single-wall cups show their one board weight.
function GsmValue({ r }) {
  if (r.innerGsm != null && r.outerGsm != null) {
    return (
      <span title="Inner wall / outer wall GSM" className="whitespace-nowrap">
        {r.innerGsm}
        <span className="text-ink-400"> / </span>
        {r.outerGsm}
      </span>
    );
  }
  return <>{r.gsm ?? "—"}</>;
}

function sizeLabel(size, unit) {
  const d = parseDims(size);
  if (!d) return null;
  if (unit === "in") {
    return `${d.map((n) => (n / 25.4).toFixed(1)).join(" × ")} in`;
  }
  return `${d.join(" × ")} mm`;
}

export default function PaperCupsBrowser({
  sections,
  plainPriced,
  printedPriced,
  total,
  usdPerInr = 90,
}) {
  const { currency, unit, offering } = useDisplay();
  const priced = offering === "printed" ? printedPriced : plainPriced;
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // "all" | section.key
  const [volume, setVolume] = useState("all"); // "all" | oz number
  const [finish, setFinish] = useState("all"); // "all" | "white" | "brown"
  const [lining, setLining] = useState("all"); // "all" | "PE" | "Aqueous" | "PLA"
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

  // Distinct oz sizes present in the data, ascending — drives the volume filter.
  const volumeOptions = useMemo(() => {
    const set = new Set();
    for (const s of sections) for (const r of s.rows) if (r.oz != null) set.add(r.oz);
    return [...set].sort((a, b) => a - b);
  }, [sections]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .filter((s) => type === "all" || s.key === type)
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => {
          if (q && !`${r.sku} ${r.name} ${r.volume}`.toLowerCase().includes(q)) return false;
          if (volume !== "all" && r.oz !== volume) return false;
          if (finish === "white" && r.finish !== "White") return false;
          if (finish === "brown" && r.finish !== "Brown kraft") return false;
          if (lining !== "all" && r.lining !== lining) return false;
          const hasPrice = r[offering]?.entry != null;
          if (availability === "priced" && !hasPrice) return false;
          if (availability === "request" && hasPrice) return false;
          return true;
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [sections, query, type, volume, finish, lining, availability, offering]);

  const shown = filtered.reduce((n, s) => n + s.rows.length, 0);
  const isFiltered =
    query.trim() !== "" ||
    type !== "all" ||
    volume !== "all" ||
    finish !== "all" ||
    lining !== "all" ||
    availability !== "all";

  const reset = () => {
    setQuery("");
    setType("all");
    setVolume("all");
    setFinish("all");
    setLining("all");
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
            ? "Custom print up to 4 colours · quantity ladder from 5,000 pcs"
            : "Plain, unprinted cups"}
        </span>
      </div>

      {/* Filter bar */}
      <div className="mt-4 rounded-md border border-ink-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          {/* Search */}
          <div>
            <label htmlFor="cup-search" className="block text-xs uppercase tracking-wide text-ink-400">
              Search
            </label>
            <input
              id="cup-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Code, size or name — e.g. 8oz, ripple, kraft"
              className="mt-1.5 h-10 w-full rounded border border-ink-200 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-1 focus:ring-ink-900"
            />
          </div>

          {/* Wall type segmented control */}
          <div>
            <span className="block text-xs uppercase tracking-wide text-ink-400">Wall</span>
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

        {/* Volume */}
        {volumeOptions.length > 0 && (
          <div className="mt-4">
            <span className="block text-xs uppercase tracking-wide text-ink-400">Volume</span>
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

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {/* Finish */}
          <div>
            <span className="block text-xs uppercase tracking-wide text-ink-400">Finish</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { value: "all", label: "All" },
                { value: "white", label: "White" },
                { value: "brown", label: "Brown kraft" },
              ].map((opt) => (
                <Chip key={opt.value} active={finish === opt.value} onClick={() => setFinish(opt.value)}>
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Lining */}
          <div>
            <span className="block text-xs uppercase tracking-wide text-ink-400">Lining</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { value: "all", label: "All" },
                { value: "PE", label: "PE" },
                { value: "Aqueous", label: "Aqueous" },
                { value: "PLA", label: "PLA" },
              ].map((opt) => (
                <Chip key={opt.value} active={lining === opt.value} onClick={() => setLining(opt.value)}>
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
            Showing <strong className="text-ink-900">{shown}</strong> of {total} cups · prices in{" "}
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
          <p className="font-semibold text-ink-900">No cups match these filters.</p>
          <p className="mt-1 text-sm text-ink-500">Try clearing the search or widening the wall type.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex rounded border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-100"
          >
            Clear filters
          </button>
        </div>
      ) : (
        filtered.map((section) => {
          const twoWall = section.rows.some((r) => r.innerGsm != null && r.outerGsm != null);
          return (
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
                    <th className="px-3 py-2 font-medium">Cup</th>
                    <th className="px-3 py-2 font-medium">Volume</th>
                    <th className="px-3 py-2 font-medium">Size (TD×BD×H)</th>
                    <th className="px-3 py-2 font-medium">Lining</th>
                    <th className="px-3 py-2 text-right font-medium" title={twoWall ? "Inner wall / outer wall GSM" : undefined}>
                      {twoWall ? "GSM (in/out)" : "GSM"}
                    </th>
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
                  unit={unit}
                  currency={currency}
                  usdPerInr={usdPerInr}
                />
              ))}
            </div>
          </div>
          );
        })
      )}
    </section>
  );
}

// One product = a summary row plus an expandable ladder detail row.
function FragmentRows({ r, off, unit, currency, usdPerInr, hasLadder, isOpen, onToggle }) {
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
          "border-b border-ink-100 last:border-0 " +
          (hasLadder ? "cursor-pointer hover:bg-ink-50" : "")
        }
        onClick={hasLadder ? onToggle : undefined}
      >
        <td className="px-3 py-2 font-mono text-xs text-ink-600">{r.sku}</td>
        <td className="px-3 py-2 text-ink-900">{r.name}</td>
        <td className="px-3 py-2 text-ink-600">{r.volume ?? "—"}</td>
        <td className="px-3 py-2 text-ink-600">{sizeLabel(r.size, unit) ?? "—"}</td>
        <td className="px-3 py-2 text-ink-600">{r.lining}</td>
        <td className="px-3 py-2 text-right text-ink-600">
          <GsmValue r={r} />
        </td>
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
          <td colSpan={9} className="px-3 py-3">
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

function MobileCard({ r, off, unit, currency, usdPerInr }) {
  const entry = off.entry;
  const best = off.best;
  const hasLadder = off.slabs.length > 1;
  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-400">{r.sku}</p>
          <p className="mt-0.5 font-medium text-ink-900">
            {r.volume} {r.name && r.name !== "Standard" ? `· ${r.name}` : ""}
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
        <Spec label="Lining">{r.lining}</Spec>
        <Spec label="Finish">{r.finish}</Spec>
        <Spec label={r.innerGsm != null && r.outerGsm != null ? "GSM (in/out)" : "GSM"}>
          <GsmValue r={r} />
        </Spec>
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
