"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");

export default function QcCoaList({ rows = [], standalone = [], canEdit = false }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("all");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (only === "made" && !r.coaDate) return false;
      if (only === "pending" && r.coaDate) return false;
      return !needle || `${r.jNumber} ${r.brand} ${r.item}`.toLowerCase().includes(needle);
    });
  }, [rows, q, only]);
  const made = rows.filter((r) => r.coaDate).length;

  const pill = (v, label) => (
    <button
      type="button"
      onClick={() => setOnly(v)}
      className={`rounded-full px-3 py-1 text-xs font-medium border ${only === v ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900" : "bg-white text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700"}`}
    >{label}</button>
  );

  return (
    <div className="mt-5">
      {(canEdit || standalone.length > 0) && (
        <div className="mb-5 bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">COA without a job</h2>
              <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">For samples, stock items, or an order that isn&apos;t in FactoryOS.</p>
            </div>
            {canEdit && (
              <Link href="/factoryos/qc/coa/new" className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-gray-900">+ New COA</Link>
            )}
          </div>
          {standalone.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
              {standalone.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="text-gray-900 dark:text-white">{c.productName || "Untitled"}</span>
                    <span className="ml-2 text-xs text-gray-500">{fmt(c.date)}</span>
                  </span>
                  <span className="whitespace-nowrap">
                    <a href={`/print/coa/s/${c.id}`} target="_blank" rel="noopener noreferrer" className="mr-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200">PDF</a>
                    <Link href={`/factoryos/qc/coa/s/${c.id}`} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200">Open</Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">COA for a job</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search J#, brand or item"
          className="flex-1 min-w-[220px] rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
        />
        {pill("all", `All (${rows.length})`)}
        {pill("made", `COA made (${made})`)}
        {pill("pending", `No COA yet (${rows.length - made})`)}
      </div>

      <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-x-auto dark:bg-gray-900 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 dark:border-gray-800">
            <tr>
              <th className="px-3 py-2">J#</th>
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">COA</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900 dark:text-white">{r.jNumber}</td>
                <td className="px-3 py-2">
                  <div className="text-gray-900 dark:text-white">{r.item}</div>
                  <div className="text-xs text-gray-500">{r.brand}</div>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{r.qty ? Number(r.qty).toLocaleString("en-IN") : "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{r.stage}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.coaDate
                    ? <span className="text-green-700 dark:text-green-400">Made · {fmt(r.coaDate)}</span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  {r.coaDate && (
                    <a href={`/print/coa/${r.id}`} target="_blank" rel="noopener noreferrer" className="mr-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200">PDF</a>
                  )}
                  {(canEdit || r.coaDate) && (
                    <Link href={`/factoryos/qc/coa/${r.id}`} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-gray-900">
                      {r.coaDate ? "Open" : "Make COA"}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">No jobs match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
