"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function fmt(n, dp = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtInt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN");
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_BADGE = {
  pending:    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40",
  dispatched: "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-700/40",
  delivered:  "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700/40",
  cancelled:  "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
};

export default function ManifestHistoryClient({ manifests = [] }) {
  const [q, setQ] = useState("");
  const [am, setAm] = useState("");

  // AM filter options come from what's actually on the manifests, so the
  // dropdown can never offer a name with zero rows behind it.
  const ams = useMemo(() => {
    const s = new Set();
    for (const m of manifests) if (m.account_manager_name) s.add(m.account_manager_name);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [manifests]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return manifests.filter((m) => {
      if (am && m.account_manager_name !== am) return false;
      if (!needle) return true;
      const hay = [
        m.dispatch_no, m.invoice_no, m.customer_name, m.account_manager_name,
        m.vehicle_size, m.vehicle_number, m.transporter_name, m.from_city, m.to_city,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [manifests, q, am]);

  const totals = useMemo(() => {
    let boxes = 0, kg = 0, cbm = 0;
    for (const m of rows) {
      boxes += m.total_boxes || 0;
      kg += m.total_kg || 0;
      cbm += m.total_cbm || 0;
    }
    return { boxes, kg: +kg.toFixed(2), cbm: +cbm.toFixed(3) };
  }, [rows]);

  const inputCls =
    "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search manifest, invoice, customer, vehicle, transporter, city…"
          className={`${inputCls} min-w-[280px] flex-1`}
        />
        <select value={am} onChange={(e) => setAm(e.target.value)} className={inputCls}>
          <option value="">All account managers</option>
          {ams.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {rows.length} {rows.length === 1 ? "manifest" : "manifests"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900/60">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Manifest</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">AM</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3 text-right">Types</th>
              <th className="px-4 py-3 text-right">Boxes</th>
              <th className="px-4 py-3 text-right">Pcs</th>
              <th className="px-4 py-3 text-right">Kg</th>
              <th className="px-4 py-3 text-right">CBM</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                  No manifests yet — build one from a dispatch and it shows up here.
                </td>
              </tr>
            ) : rows.map((m) => (
              <tr key={m.dispatch_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">{fmtDate(m.dispatch_date)}</td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                  {m.dispatch_no}
                  {m.invoice_no && <div className="text-[11px] font-normal text-gray-400">{m.invoice_no}</div>}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{m.customer_name}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{m.account_manager_name || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_BADGE[m.status] || ""}`}>
                    {m.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">
                  {m.vehicle_size || "—"}
                  {m.vehicle_number && <div className="text-[11px] text-gray-400">{m.vehicle_number}</div>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{fmtInt(m.line_count)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{fmtInt(m.total_boxes)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{m.total_pcs ? fmtInt(m.total_pcs) : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                  {fmt(m.total_kg)}
                  {m.missing_kg > 0 && <div className="text-[11px] font-normal text-amber-600">+{m.missing_kg} unpriced</div>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                  {fmt(m.total_cbm, 3)}
                  {m.missing_cbm > 0 && <div className="text-[11px] font-normal text-amber-600">+{m.missing_cbm} no size</div>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Link href={`/warehouse/vehicle-dispatch/${m.dispatch_id}`} className="text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-400">
                    Open
                  </Link>
                  <a
                    href={`/print/vehicle-dispatch/${m.dispatch_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-3 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-300"
                  >
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t border-gray-200 bg-gray-50 text-sm font-medium dark:border-gray-800 dark:bg-gray-900/60">
              <tr className="text-gray-700 dark:text-gray-200">
                <td className="px-4 py-3" colSpan={7}>Totals ({rows.length})</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtInt(totals.boxes)}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.kg)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.cbm, 3)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
