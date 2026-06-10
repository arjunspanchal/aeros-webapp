"use client";

import Link from "next/link";

const TYPE_TONE = {
  inward:     "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  outward:    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  transfer:   "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  adjustment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

function fmtINR(n) {
  if (n == null || !Number.isFinite(Number(n)) || Number(n) === 0) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(Number(n));
}

export default function RecentMovementsTable({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900">
        No movements yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-gray-800/50">
          <tr>
            <Th>Date</Th>
            <Th>No</Th>
            <Th>Type</Th>
            <Th>Reason</Th>
            <Th>Reference</Th>
            <Th right>Lines</Th>
            <Th right>Total qty</Th>
            <Th right>Total ₹</Th>
            <Th>Posted by</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
          {rows.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <Td>{m.movement_date}</Td>
              <Td mono>
                <div className="flex items-center gap-1.5">
                  <Link href={`/warehouse/inventory/movements/${m.id}`} className="text-blue-700 hover:underline dark:text-blue-400">
                    {m.movement_no}
                  </Link>
                  {m.posted === false && (
                    <span
                      title="Unposted draft — stock position does not include this movement yet."
                      className="inline-flex items-center rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40"
                    >
                      Draft
                    </span>
                  )}
                </div>
              </Td>
              <Td><span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${TYPE_TONE[m.type] || ""}`}>{m.type}</span></Td>
              <Td>{m.reference_type || "—"}</Td>
              <Td>{m.reference || "—"}</Td>
              <Td right>{m.line_count}</Td>
              <Td right>{Number(m.total_qty || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Td>
              <Td right>{fmtINR(m.total_value)}</Td>
              <Td>{m.created_by || "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, right, mono }) {
  return (
    <td className={`px-3 py-2 text-sm ${right ? "text-right" : ""} ${mono ? "font-mono text-xs text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-gray-100"}`}>
      {children}
    </td>
  );
}
