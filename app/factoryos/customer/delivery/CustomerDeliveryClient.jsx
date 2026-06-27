"use client";
import { useMemo } from "react";
import { formatDate } from "@/app/factoryos/_components/ui";

const num = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : "—");

const STATUS_LABEL = {
  unscheduled: "Awaiting schedule",
  scheduled: "Scheduled",
  in_progress: "In progress",
  dispatched: "Dispatched",
  cancelled: "Cancelled",
};
const STATUS_STYLE = {
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  dispatched: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  unscheduled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

export default function CustomerDeliveryClient({ lines }) {
  // Date columns = every committed dispatch date across non-cancelled lines.
  const dates = useMemo(
    () =>
      Array.from(
        new Set(
          lines
            .filter((l) => l.deliveryStatus !== "cancelled")
            .flatMap((l) => (l.schedule || []).map((s) => s.dispatchDate)),
        ),
      ).sort(),
    [lines],
  );

  // Group lines by PO number for the section headers.
  const groups = useMemo(() => {
    const m = new Map();
    for (const l of lines) {
      const key = l.poNumber || "—";
      if (!m.has(key)) m.set(key, { poNumber: key, poDate: l.poDate, lines: [] });
      m.get(key).lines.push(l);
    }
    return Array.from(m.values());
  }, [lines]);

  const qtyOn = (line, date) =>
    (line.schedule || []).filter((s) => s.dispatchDate === date).reduce((t, s) => t + (s.qty || 0), 0);

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Delivery Plan</h2>
      <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
        Committed dispatch schedule for your open POs. Quantities under a date are the units committed for
        dispatch that day.
      </p>

      {groups.length === 0 ? (
        <div className="mt-5 bg-white border border-gray-200 rounded-xl p-8 text-center dark:bg-gray-900 dark:border-gray-800">
          <div className="text-3xl">📦</div>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">No open delivery commitments right now.</p>
          <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">When we schedule dispatches against your POs, they&apos;ll show here.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map((g) => (
            <div key={g.poNumber} className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">PO #{g.poNumber}</h3>
                {g.poDate && <span className="text-xs text-gray-400">{formatDate(g.poDate)}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2 text-right">Ordered</th>
                      <th className="px-3 py-2 text-right">Received</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                      {dates.map((d) => <th key={d} className="px-3 py-2 text-right">{formatDate(d)}</th>)}
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lines.map((l) => {
                      const cancelled = l.deliveryStatus === "cancelled";
                      return (
                        <tr key={l.jobId} className={`border-t border-gray-100 dark:border-gray-800 ${cancelled ? "opacity-60" : ""}`}>
                          <td className={`px-3 py-2 font-medium text-gray-800 dark:text-gray-200 ${cancelled ? "line-through" : ""}`}>
                            {l.sku}
                            {l.deliveryRemarks && <div className="text-[11px] font-normal text-gray-500 dark:text-gray-400">{l.deliveryRemarks}</div>}
                          </td>
                          <td className="px-3 py-2 text-right">{num(l.ordered)}</td>
                          <td className="px-3 py-2 text-right">{num(l.received)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{num(l.balance)}</td>
                          {dates.map((d) => {
                            const q = cancelled ? 0 : qtyOn(l, d);
                            return <td key={d} className="px-3 py-2 text-right">{q ? num(q) : ""}</td>;
                          })}
                          <td className="px-3 py-2">
                            <span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_STYLE[l.deliveryStatus] || STATUS_STYLE.unscheduled}`}>
                              {STATUS_LABEL[l.deliveryStatus] || STATUS_LABEL.unscheduled}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
