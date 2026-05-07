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

export default function MovementsClient({ initialMovements }) {
  const [movements] = useState(initialMovements);
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (type && m.type !== type) return false;
      if (from && m.movement_date < from) return false;
      if (to && m.movement_date > to) return false;
      if (q) {
        const blob = `${m.movement_no} ${m.reference || ""} ${m.reference_type || ""} ${m.notes || ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [movements, type, from, to, search]);

  const totalQty = filtered.reduce((s, r) => s + Number(r.total_qty || 0), 0);
  const totalValue = filtered.reduce((s, r) => s + Number(r.total_value || 0), 0);

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
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
        <span>Σ qty: <strong className="text-gray-900 dark:text-gray-100">{totalQty.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></span>
        <span>Σ value: <strong className="text-gray-900 dark:text-gray-100">₹{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong></span>
      </div>

      <RecentMovementsTable rows={filtered} />
    </div>
  );
}
