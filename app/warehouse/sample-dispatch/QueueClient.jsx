"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const STATUS_TABS = [
  { value: "pending",     label: "Pending" },
  { value: "dispatched",  label: "Dispatched" },
  { value: "cancelled",   label: "Cancelled" },
  { value: "",            label: "All" },
];

const STATUS_BADGE = {
  pending:    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40",
  dispatched: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700/40",
  cancelled:  "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
};

function fmtINR(n) {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function QueueClient({ initialDispatches }) {
  const [tab, setTab] = useState("pending");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const filtered = (initialDispatches || []).filter((d) => {
      if (tab && d.status !== tab) return false;
      if (q) {
        const hay = [
          d.dispatch_no, d.customer_name, d.managed_by,
          d.awb, d.courier, ...(d.items || []).map((ln) => ln.order_id),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    return filtered;
  }, [initialDispatches, tab, q]);

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
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search dispatch #, customer, AWB, order ID…"
          className="flex-1 min-w-[240px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">{rows.length} {rows.length === 1 ? "dispatch" : "dispatches"}</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900/60">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3">Dispatch #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Managed by</th>
              <th className="px-4 py-3 text-right">Items</th>
              <th className="px-4 py-3 text-right">Total (incl. GST)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">AWB</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">No dispatches in this view.</td></tr>
            ) : rows.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{d.dispatch_no}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmtDate(d.dispatch_date)}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{d.customer_name}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.managed_by || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{(d.items || []).length}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtINR(d.total_incl_gst)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${STATUS_BADGE[d.status] || ""}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.awb || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/warehouse/sample-dispatch/${d.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
