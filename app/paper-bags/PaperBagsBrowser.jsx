"use client";

// Client-side browser for the public paper-bag rate sheet. Receives the
// already-fetched + grouped `sections` from the server page and owns all
// filter state (search, type, material, availability). No data fetching here
// — keeps the Supabase service-role read server-only.

import { useMemo, useState } from "react";

const fmtInr = (v) =>
  v == null ? null : `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtUsd = (v) =>
  v == null ? null : `$${v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

// "102 x 32 x 254 mm (W x G x H)" → "102 × 32 × 254"
function stripUnit(size) {
  if (!size) return null;
  return size
    .replace(/\s*mm\b.*$/i, "")
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/\s*x\s*/gi, " × ")
    .trim();
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

export default function PaperBagsBrowser({ sections, priced, total }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // "all" | section.key
  const [material, setMaterial] = useState("all"); // "all" | "brown" | "white"
  const [availability, setAvailability] = useState("all"); // "all" | "priced" | "request"

  const typeOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...sections.map((s) => ({ value: s.key, label: shortCode(s.key), title: s.label })),
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
          if (q && !`${r.sku} ${r.name}`.toLowerCase().includes(q)) return false;
          if (material !== "all") {
            const label = materialLabel(r).toLowerCase();
            if (material === "white" && !label.includes("white")) return false;
            if (material === "brown" && !label.includes("brown")) return false;
          }
          if (availability === "priced" && r.priceInr == null) return false;
          if (availability === "request" && r.priceInr != null) return false;
          return true;
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [sections, query, type, material, availability]);

  const shown = filtered.reduce((n, s) => n + s.rows.length, 0);
  const isFiltered =
    query.trim() !== "" || type !== "all" || material !== "all" || availability !== "all";

  const reset = () => {
    setQuery("");
    setType("all");
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

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
            Showing <strong className="text-ink-900">{shown}</strong> of {total} bags
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
        filtered.map((section) => (
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
                    <th className="px-3 py-2 font-medium">Size (W×G×H mm)</th>
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="px-3 py-2 text-right font-medium">GSM</th>
                    <th className="px-3 py-2 text-right font-medium">Case</th>
                    <th className="px-3 py-2 text-right font-medium">Rate (EXW)</th>
                    <th className="px-3 py-2 text-right font-medium">USD*</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((r) => (
                    <tr key={r.sku} className="border-b border-ink-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-ink-600">{r.sku}</td>
                      <td className="px-3 py-2 text-ink-900">{r.name}</td>
                      <td className="px-3 py-2 text-ink-600">{stripUnit(r.size)}</td>
                      <td className="px-3 py-2 text-ink-600">{materialLabel(r)}</td>
                      <td className="px-3 py-2 text-right text-ink-600">{r.gsm ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-ink-600">
                        {r.casePack ? r.casePack.toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.priceInr != null ? (
                          <span className="font-medium text-ink-900">{fmtInr(r.priceInr)}</span>
                        ) : (
                          <span className="text-ink-400">On request</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-ink-400">
                        {r.priceUsd != null ? fmtUsd(r.priceUsd) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mt-3 space-y-2 md:hidden">
              {section.rows.map((r) => (
                <div key={r.sku} className="rounded-md border border-ink-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-ink-400">{r.sku}</p>
                      <p className="mt-0.5 font-medium text-ink-900">{r.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {r.priceInr != null ? (
                        <>
                          <p className="font-semibold text-ink-900">{fmtInr(r.priceInr)}</p>
                          <p className="text-xs text-ink-400">{fmtUsd(r.priceUsd)}</p>
                        </>
                      ) : (
                        <p className="text-sm text-ink-400">On request</p>
                      )}
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-600">
                    <Spec label="Size">{stripUnit(r.size) || "—"}</Spec>
                    <Spec label="Material">{materialLabel(r)}</Spec>
                    <Spec label="GSM">{r.gsm ?? "—"}</Spec>
                    <Spec label="Case pack">
                      {r.casePack ? `${r.casePack.toLocaleString("en-IN")} pcs` : "—"}
                    </Spec>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
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
