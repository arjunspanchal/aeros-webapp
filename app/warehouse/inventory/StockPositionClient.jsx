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

export default function StockPositionClient({ initialStock, locations }) {
  const [stock] = useState(initialStock);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [hideZero, setHideZero] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stock.filter((row) => {
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
  }, [stock, search, source, hideZero]);

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
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <Th>SKU</Th>
              <Th>Name</Th>
              <Th>Source</Th>
              <Th>Customer</Th>
              <Th right>On-hand</Th>
              <Th right>Avg cost</Th>
              <Th right>Value</Th>
              <Th>Locations</Th>
              <Th>Last movement</Th>
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
          The inventory is empty. Phase 2 adds Inward / Outward and FactoryOS push, which is how stock gets here.
          For now, define your plain SKUs from the Items master.
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

function Th({ children, right }) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
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
