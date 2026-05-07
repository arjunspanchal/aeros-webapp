"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const STATUS_TONE = {
  counting:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  review:    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  posted:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const STATUS_TABS = [
  { key: "",          label: "All" },
  { key: "counting",  label: "Counting" },
  { key: "review",    label: "Review" },
  { key: "posted",    label: "Posted" },
  { key: "cancelled", label: "Cancelled" },
];

export default function AuditsListClient({ initialAudits }) {
  const [audits] = useState(initialAudits);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return audits.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (a.audit_no || "").toLowerCase().includes(q) ||
        (a.audit_manager_email || "").toLowerCase().includes(q) ||
        (a.notes || "").toLowerCase().includes(q) ||
        JSON.stringify(a.scope_filter || {}).toLowerCase().includes(q)
      );
    });
  }, [audits, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { "": audits.length, counting: 0, review: 0, posted: 0, cancelled: 0 };
    for (const a of audits) c[a.status] = (c[a.status] || 0) + 1;
    return c;
  }, [audits]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-gray-200 dark:border-gray-800">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              statusFilter === t.key
                ? "border-blue-600 text-blue-700 dark:text-blue-400"
                : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {t.label} ({counts[t.key] ?? 0})
          </button>
        ))}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search audit no, manager, scope, notes…"
        className="mb-4 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 sm:max-w-md"
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <Th>Audit no</Th>
              <Th>Status</Th>
              <Th>Scope</Th>
              <Th>Scheduled</Th>
              <Th>Manager</Th>
              <Th right>Lines</Th>
              <Th right>Counted</Th>
              <Th right>Variance lines</Th>
              <Th right>Σ |variance|</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">
                  {audits.length === 0 ? "No audits yet. Click “+ New audit” to create your first." : "No matches."}
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <Td mono>
                    <Link href={`/warehouse/inventory/audits/${a.id}`} className="text-blue-700 hover:underline dark:text-blue-400">
                      {a.audit_no}
                    </Link>
                  </Td>
                  <Td>
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[a.status] || ""}`}>
                      {a.status}
                    </span>
                  </Td>
                  <Td>{describeScope(a)}</Td>
                  <Td>{a.scheduled_date}</Td>
                  <Td>{a.audit_manager_email || "—"}</Td>
                  <Td right>{a.total_lines}</Td>
                  <Td right>{a.counted_lines} / {a.total_lines}</Td>
                  <Td right>{a.variance_lines}</Td>
                  <Td right>{Number(a.abs_variance || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function describeScope(a) {
  const f = a.scope_filter || {};
  switch (a.scope) {
    case "full":      return "Full warehouse";
    case "category":  return `Category · ${f.category || "?"}`;
    case "location":  return `Location · ${f.location_code || f.location_id || "?"}`;
    case "item-list": return `Items · ${(f.item_ids || []).length} SKUs`;
    default:          return a.scope;
  }
}

function Th({ children, right }) {
  return <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, mono }) {
  return <td className={`px-3 py-2 text-sm ${right ? "text-right" : ""} ${mono ? "font-mono text-xs text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-gray-100"}`}>{children}</td>;
}
