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

// SLA: a pending dispatch is "aged" if it's been waiting >24h.
const AGED_HOURS = 24;

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

function hoursSince(iso) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return (Date.now() - t) / 36e5;
}

function fmtAge(hours) {
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.floor(hours)}h`;
  const d = Math.floor(hours / 24);
  return `${d}d`;
}

function isAgedPending(d) {
  return d.status === "pending" && hoursSince(d.created_at) > AGED_HOURS;
}

export default function QueueClient({ initialDispatches }) {
  const [tab, setTab] = useState("pending");
  const [q, setQ] = useState("");

  // Counts per status are computed over the full list so each tab label
  // reflects total workload, not what's left after the search box.
  const counts = useMemo(() => {
    const c = { pending: 0, dispatched: 0, cancelled: 0, aged: 0, all: 0 };
    for (const d of initialDispatches || []) {
      c.all++;
      if (d.status === "pending")    c.pending++;
      if (d.status === "dispatched") c.dispatched++;
      if (d.status === "cancelled")  c.cancelled++;
      if (isAgedPending(d))          c.aged++;
    }
    return c;
  }, [initialDispatches]);

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
    // When viewing Pending, push aged ones to the top so SLA-breaching
    // dispatches don't get buried under brand-new ones.
    if (tab === "pending") {
      filtered.sort((a, b) => {
        const aa = isAgedPending(a) ? 1 : 0;
        const bb = isAgedPending(b) ? 1 : 0;
        if (aa !== bb) return bb - aa;
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });
    }
    return filtered;
  }, [initialDispatches, tab, q]);

  return (
    <div className="space-y-4">
      {counts.aged > 0 && (
        <button
          type="button"
          onClick={() => setTab("pending")}
          className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-900/20 dark:hover:bg-amber-900/30"
        >
          <span className="text-amber-900 dark:text-amber-200">
            <strong>{counts.aged}</strong> pending dispatch{counts.aged === 1 ? "" : "es"} sitting longer than {AGED_HOURS}h.
          </span>
          <span className="text-xs font-medium text-amber-900 underline dark:text-amber-200">View →</span>
        </button>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
          {STATUS_TABS.map((t) => {
            const tabCount =
              t.value === ""           ? counts.all :
              t.value === "pending"    ? counts.pending :
              t.value === "dispatched" ? counts.dispatched :
              t.value === "cancelled"  ? counts.cancelled : 0;
            return (
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
                <span className={`ml-1.5 text-[11px] tabular-nums ${
                  tab === t.value ? "opacity-80" : "opacity-60"
                }`}>
                  {tabCount}
                </span>
              </button>
            );
          })}
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
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">AWB</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">No dispatches in this view.</td></tr>
            ) : rows.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                  <div className="flex items-center gap-1.5">
                    {d.dispatch_no}
                    {isAgedPending(d) && (
                      <span
                        title={`Pending for ${fmtAge(hoursSince(d.created_at))} — SLA breach`}
                        className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40"
                      >
                        {fmtAge(hoursSince(d.created_at))}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmtDate(d.dispatch_date)}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{d.customer_name}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.managed_by || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{(d.items || []).length}</td>
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
