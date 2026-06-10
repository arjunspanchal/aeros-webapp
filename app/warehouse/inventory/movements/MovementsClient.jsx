"use client";

import { useMemo, useState } from "react";
import RecentMovementsTable from "../RecentMovementsTable";

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "inward", label: "Inward" },
  { value: "outward", label: "Outward" },
  { value: "transfer", label: "Transfer" },
  { value: "adjustment", label: "Adjustment" },
];

const POST_STATUS_OPTIONS = [
  { value: "",       label: "Posted + drafts" },
  { value: "posted", label: "Posted only"     },
  { value: "draft",  label: "Drafts only"     },
];

export default function MovementsClient({ initialMovements }) {
  const [movements] = useState(initialMovements);
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [postStatus, setPostStatus] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (type && m.type !== type) return false;
      if (from && m.movement_date < from) return false;
      if (to && m.movement_date > to) return false;
      if (postStatus === "posted" && m.posted === false) return false;
      if (postStatus === "draft"  && m.posted !== false) return false;
      if (q) {
        const blob = `${m.movement_no} ${m.reference || ""} ${m.reference_type || ""} ${m.notes || ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [movements, type, from, to, search, postStatus]);

  const totalQty   = filtered.reduce((s, r) => s + Number(r.total_qty || 0), 0);
  const totalValue = filtered.reduce((s, r) => s + Number(r.total_value || 0), 0);
  const draftCount = filtered.filter((m) => m.posted === false).length;

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search no, reference, notes…"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm sm:col-span-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={postStatus}
          onChange={(e) => setPostStatus(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          title="Drafts don't affect stock position"
        >
          {POST_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
        <span><strong className="text-gray-900 dark:text-gray-100">{filtered.length}</strong> movement{filtered.length === 1 ? "" : "s"}</span>
        {draftCount > 0 && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40">
            {draftCount} draft{draftCount === 1 ? "" : "s"} in view
          </span>
        )}
        <span>Σ qty: <strong className="text-gray-900 dark:text-gray-100">{totalQty.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></span>
        <span>Σ value: <strong className="text-gray-900 dark:text-gray-100">₹{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong></span>
      </div>

      <RecentMovementsTable rows={filtered} />
    </div>
  );
}
