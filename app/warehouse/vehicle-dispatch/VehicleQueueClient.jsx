"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function fmtINR(n, dp = 2) {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

function fmtNum(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN");
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function lane(d) {
  const from = d.from_city || "—";
  const to = d.to_city || "—";
  return `${from} → ${to}`;
}

const STATUS_BADGE = {
  pending:    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40",
  dispatched: "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-700/40",
  delivered:  "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700/40",
  cancelled:  "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
};

const STATUS_TABS = [
  { value: "",           label: "All" },
  { value: "pending",    label: "Pending" },
  { value: "dispatched", label: "Dispatched" },
  { value: "delivered",  label: "Delivered" },
  { value: "cancelled",  label: "Cancelled" },
];

export default function VehicleQueueClient({ initialDispatches }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("");

  // Status counts over the full list so tab labels reflect total workload.
  const counts = useMemo(() => {
    const c = { "": (initialDispatches || []).length, pending: 0, dispatched: 0, delivered: 0, cancelled: 0 };
    for (const d of initialDispatches || []) {
      if (d.status in c) c[d.status]++;
    }
    return c;
  }, [initialDispatches]);

  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    return (initialDispatches || []).filter((d) => {
      if (tab && d.status !== tab) return false;
      if (!q) return true;
      const hay = [
        d.dispatch_no, d.customer_name, d.account_manager_name,
        ...(d.invoices || []).flatMap((i) => [i.invoice_no, i.eway_bill_no, i.customer_name]),
        d.transporter_name, d.vehicle_size, d.vehicle_number,
        d.driver_name, d.from_city, d.to_city,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [initialDispatches, q, tab]);

  // Footer roll-up over the filtered view — quick read on total freight and
  // boxes moved for whatever the search is currently showing.
  const totals = useMemo(() => {
    let freight = 0, boxes = 0, kg = 0;
    for (const d of rows) {
      freight += Number(d.freight_lumpsum_inr) || 0;
      boxes += Number(d.box_count) || 0;
      kg += Number(d.total_weight_kg) || 0;
    }
    return { freight, boxes, kg };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value || "all"}
              onClick={() => setTab(t.value)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                tab === t.value
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-[11px] tabular-nums ${tab === t.value ? "opacity-80" : "opacity-60"}`}>
                {counts[t.value] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice, e-way bill, customer, transporter, driver, city…"
          className="flex-1 min-w-[240px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">{rows.length} {rows.length === 1 ? "dispatch" : "dispatches"}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900/60">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">AM</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Transporter</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3 text-right">Kms</th>
              <th className="px-4 py-3 text-right">Boxes</th>
              <th className="px-4 py-3 text-right">Kg</th>
              <th className="px-4 py-3 text-right">Freight</th>
              <th className="px-4 py-3 text-right">₹/box</th>
              <th className="px-4 py-3 text-right">₹/kg</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {rows.length === 0 ? (
              <tr><td colSpan={15} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">No dispatches in this view.</td></tr>
            ) : rows.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300">{fmtDate(d.dispatch_date)}</td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                  {(d.invoices || []).length ? d.invoices[0].invoice_no : d.dispatch_no}
                  {(d.invoices || []).length > 1 && (
                    <span className="ml-1 text-[11px] font-normal text-gray-400">
                      +{d.invoices.length - 1}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{d.customer_name}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.account_manager_name || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_BADGE[d.status] || ""}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.transporter_name || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300">{d.vehicle_size || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300">{lane(d)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{fmtNum(d.approx_kms)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtNum(d.box_count)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{fmtNum(d.total_weight_kg)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{fmtINR(d.freight_lumpsum_inr, 0)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtINR(d.inr_per_box)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtINR(d.inr_per_kg)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/warehouse/vehicle-dispatch/${d.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t border-gray-200 bg-gray-50 text-sm font-medium dark:border-gray-800 dark:bg-gray-900/60">
              <tr className="text-gray-700 dark:text-gray-200">
                <td className="px-4 py-3" colSpan={9}>Totals ({rows.length})</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(totals.boxes)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(totals.kg)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtINR(totals.freight, 0)}</td>
                <td className="px-4 py-3" colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
