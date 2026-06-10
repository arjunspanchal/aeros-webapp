"use client";

import { useMemo, useState } from "react";

const SOURCE_OPTIONS = ["", "FG", "RM", "Clearance", "Other"];

function formatINR(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n));
}

function formatQty(n, uom) {
  if (n == null) return "—";
  const v = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(Number(n));
  return `${v} ${uom || ""}`.trim();
}

// Sortable column keys mapped to row accessors. Numeric keys get numeric
// compare; strings get locale compare. `last_movement_at` is an ISO string
// — lexicographic compare on ISO is correct chronological order.
const SORT_ACCESSORS = {
  sku:               (r) => (r.sku || "").toLowerCase(),
  name:              (r) => (r.name || "").toLowerCase(),
  source:            (r) => (r.source || "").toLowerCase(),
  customer:          (r) => (r.brand_customer || "").toLowerCase(),
  total_qty:         (r) => Number(r.total_qty || 0),
  avg_cost:          (r) => Number(r.avg_cost || 0),
  total_value:       (r) => Number(r.total_value || 0),
  last_movement_at:  (r) => r.last_movement_at || "",
};

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportStockCSV(rows) {
  const header = [
    "SKU", "Name", "Brand", "Source", "Customer",
    "On-hand", "UoM", "Avg cost (INR)", "Value (INR)",
    "Locations", "Needs review", "Last movement",
  ];
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    const locs = r.by_location
      ? Object.entries(r.by_location).map(([c, q]) => `${c}:${q}`).join(" | ")
      : "";
    lines.push([
      r.sku, r.name, r.brand || "", r.source || "", r.brand_customer || "",
      Number(r.total_qty || 0), r.uom || "",
      Number(r.avg_cost || 0).toFixed(2), Number(r.total_value || 0).toFixed(2),
      locs, r.needs_review ? "yes" : "",
      r.last_movement_at ? new Date(r.last_movement_at).toISOString().slice(0, 10) : "",
    ].map(csvEscape).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `stock-position-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export default function StockPositionClient({ initialStock, locations }) {
  const [stock] = useState(initialStock);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [hideZero, setHideZero] = useState(true);
  // sortKey null → original order. Click cycles: null → asc → desc → null.
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  function toggleSort(key) {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortKey(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = stock.filter((row) => {
      if (source && row.source !== source) return false;
      if (hideZero && Number(row.total_qty) === 0) return false;
      if (!q) return true;
      return (
        (row.sku || "").toLowerCase().includes(q) ||
        (row.name || "").toLowerCase().includes(q) ||
        (row.brand || "").toLowerCase().includes(q) ||
        (row.brand_customer || "").toLowerCase().includes(q)
      );
    });
    if (!sortKey) return base;
    const acc = SORT_ACCESSORS[sortKey];
    if (!acc) return base;
    const sign = sortDir === "asc" ? 1 : -1;
    return base.slice().sort((a, b) => {
      const av = acc(a), bv = acc(b);
      if (av === bv) return 0;
      if (typeof av === "number") return (av - bv) * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }, [stock, search, source, hideZero, sortKey, sortDir]);

  const totalSkus = filtered.length;
  const totalValue = filtered.reduce((s, r) => s + Number(r.total_value || 0), 0);
  const needsReviewCount = filtered.filter((r) => r.needs_review).length;

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Active SKUs" value={totalSkus.toLocaleString("en-IN")} />
        <Kpi label="Total value" value={formatINR(totalValue)} />
        <Kpi label="Locations" value={locations.length} />
        <Kpi
          label="Needs review"
          value={needsReviewCount.toLocaleString("en-IN")}
          tone={needsReviewCount > 0 ? "warn" : "default"}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU, name, brand, or customer…"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || "All sources"}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Hide zero-qty rows
        </label>
        <button
          type="button"
          onClick={() => exportStockCSV(filtered)}
          disabled={filtered.length === 0}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          title="Download the current view as CSV"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <Th sortKey="sku"              activeKey={sortKey} dir={sortDir} onSort={toggleSort}>SKU</Th>
              <Th sortKey="name"             activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Name</Th>
              <Th sortKey="source"           activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Source</Th>
              <Th sortKey="customer"         activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Customer</Th>
              <Th sortKey="total_qty"        activeKey={sortKey} dir={sortDir} onSort={toggleSort} right>On-hand</Th>
              <Th sortKey="avg_cost"         activeKey={sortKey} dir={sortDir} onSort={toggleSort} right>Avg cost</Th>
              <Th sortKey="total_value"      activeKey={sortKey} dir={sortDir} onSort={toggleSort} right>Value</Th>
              <Th>Locations</Th>
              <Th sortKey="last_movement_at" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Last movement</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">
                  No items match. {stock.length === 0 && "Create your first SKU from the Items master."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.item_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <Td mono>{row.sku}</Td>
                  <Td>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{row.name}</div>
                    {row.brand && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{row.brand}</div>
                    )}
                    {row.needs_review && (
                      <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        Needs review
                      </span>
                    )}
                  </Td>
                  <Td>
                    <SourceBadge source={row.source} />
                  </Td>
                  <Td>{row.brand_customer || "—"}</Td>
                  <Td right>{formatQty(row.total_qty, row.uom)}</Td>
                  <Td right>{formatINR(row.avg_cost)}</Td>
                  <Td right>{formatINR(row.total_value)}</Td>
                  <Td>
                    {row.by_location && Object.keys(row.by_location).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(row.by_location).map(([code, qty]) => (
                          <span
                            key={code}
                            className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                            title={`${code}: ${qty}`}
                          >
                            {code} · {Number(qty).toLocaleString("en-IN")}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No stock</span>
                    )}
                  </Td>
                  <Td>
                    {row.last_movement_at
                      ? new Date(row.last_movement_at).toLocaleDateString("en-IN", {
                          year: "numeric", month: "short", day: "numeric",
                        })
                      : "—"}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {stock.length === 0 && (
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          The inventory is empty. Stock flows in via the Inward (GRN) page or
          a FactoryOS push from a finished production run; outward dispatches
          and stock audits live in the sub-tabs above.
        </p>
      )}
    </div>
  );
}

function Kpi({ label, value, tone = "default" }) {
  const toneCls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
      : "border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100";
  return (
    <div className={`rounded-lg border px-4 py-3 ${toneCls}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Th({ children, right, sortKey, activeKey, dir, onSort }) {
  const align = right ? "text-right" : "text-left";
  const base  = `px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 ${align}`;
  if (!sortKey || !onSort) return <th className={base}>{children}</th>;
  const isActive = activeKey === sortKey;
  const indicator = !isActive ? "↕" : dir === "asc" ? "↑" : "↓";
  return (
    <th className={base}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-200 ${
          isActive ? "text-gray-900 dark:text-gray-100" : ""
        }`}
      >
        {children}
        <span className={`text-[10px] ${isActive ? "" : "opacity-40"}`}>{indicator}</span>
      </button>
    </th>
  );
}

function Td({ children, right, mono }) {
  return (
    <td
      className={`px-3 py-2 text-sm ${right ? "text-right" : ""} ${
        mono ? "font-mono text-xs text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-gray-100"
      }`}
    >
      {children}
    </td>
  );
}

const SOURCE_TONE = {
  FG:        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  RM:        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Clearance: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Other:     "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};
function SourceBadge({ source }) {
  const cls = SOURCE_TONE[source] || SOURCE_TONE.Other;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {source || "—"}
    </span>
  );
}
