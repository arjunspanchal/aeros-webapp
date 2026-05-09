"use client";
import { useMemo, useState } from "react";
import { inputCls, formatDateTime } from "@/app/factoryos/_components/ui";

function monthKey(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 7); // YYYY-MM
}

function monthLabel(key) {
  if (!key) return "—";
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

export default function ManagerPOsView({ pos, clientMap }) {
  const [q, setQ] = useState("");
  const [clientId, setClientId] = useState("all");
  const [month, setMonth] = useState("all");

  // Build client + month dropdown options from the data we already have.
  const clientOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const p of pos) for (const cid of p.clientIds) {
      if (!seen.has(cid) && clientMap[cid]) { seen.add(cid); out.push(clientMap[cid]); }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [pos, clientMap]);

  const monthOptions = useMemo(() => {
    const set = new Set(pos.map((p) => monthKey(p.createdAt)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [pos]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return pos.filter((p) => {
      if (clientId !== "all" && !p.clientIds.includes(clientId)) return false;
      if (month !== "all" && monthKey(p.createdAt) !== month) return false;
      if (!term) return true;
      const clientName = p.clientIds.map((c) => clientMap[c]?.name || "").join(" ");
      const hay = `${p.poNumber} ${p.fileName || ""} ${clientName} ${p.uploadedByEmail}`.toLowerCase();
      return hay.includes(term);
    });
  }, [pos, q, clientId, month, clientMap]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className={`${inputCls} flex-1`}
          placeholder="Search by PO number, filename, uploader…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={`${inputCls} sm:w-56`} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="all">All customers</option>
          {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={`${inputCls} sm:w-44`} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All months</option>
          {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Showing {filtered.length} of {pos.length}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
            <tr>
              <th className="text-left px-4 py-2 font-medium">PO number</th>
              <th className="text-left px-4 py-2 font-medium">Customer</th>
              <th className="text-left px-4 py-2 font-medium">Uploaded</th>
              <th className="text-left px-4 py-2 font-medium">File</th>
              <th className="text-right px-4 py-2 font-medium">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 text-gray-900 font-medium dark:text-white">{p.poNumber}</td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                  {p.clientIds.map((c) => clientMap[c]?.name).filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                  <div>{formatDateTime(p.createdAt)}</div>
                  {p.uploadedByEmail && <div className="text-gray-400 dark:text-gray-500">{p.uploadedByEmail}</div>}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{p.fileName || "—"}</td>
                <td className="px-4 py-2 text-right">
                  {p.fileUrl ? (
                    <a
                      href={p.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Download ↗
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">{pos.length === 0 ? "No POs uploaded yet." : "Nothing matches."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
