"use client";
import { useMemo, useState } from "react";
import { formatDate } from "@/app/factoryos/_components/ui";

export default function FactoryFgList({ rows: initial }) {
  const [rows, setRows] = useState(initial);
  const [view, setView] = useState("awaiting");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      const awaiting = !["Dispatched", "Delivered"].includes(r.stage);
      if (view === "awaiting" && !awaiting) return false;
      if (!term) return true;
      return `${r.jNumber} ${r.item} ${r.brand} ${r.customer} ${r.masterSku}`.toLowerCase().includes(term);
    });
  }, [rows, view, q]);

  const awaitingCount = rows.filter((r) => !["Dispatched", "Delivered"].includes(r.stage)).length;

  async function markDispatched(r) {
    if (!confirm(`Mark J# ${r.jNumber} as dispatched?`)) return;
    setBusy(r.id); setErr("");
    const res = await fetch(`/api/factoryos/jobs/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "Dispatched", note: "Dispatched by warehouse" }),
    });
    setBusy("");
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not update"); return; }
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, stage: "Dispatched" } : x)));
  }

  function downloadCsv() {
    const head = ["J#", "Customer", "Brand", "Item", "SKU", "Ordered pcs", "FG pcs", "Cartons", "Closed on", "Closed by", "Stage", "Note"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [head.join(","), ...shown.map((r) => [r.jNumber, r.customer, r.brand, r.item, r.masterSku, r.orderedQty, r.fgQty, r.fgCartons, r.closedAt?.slice(0, 10), r.closedBy, r.stage, r.note].map(esc).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `factory-fg-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[["awaiting", `Awaiting dispatch (${awaitingCount})`], ["all", `All (${rows.length})`]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setView(k)}
            className={`px-3 py-1.5 rounded-full text-sm border ${view === k ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900" : "bg-white text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700"}`}>
            {label}
          </button>
        ))}
        <input className="flex-1 min-w-[12rem] border border-gray-200 rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700" placeholder="Search J#, item, customer, SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={downloadCsv} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm dark:border-gray-700">Download CSV</button>
      </div>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto dark:bg-gray-900 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 uppercase dark:text-gray-400">
            <tr>
              <th className="text-left px-4 py-2">J#</th><th className="text-left px-4 py-2">Customer / Brand</th><th className="text-left px-4 py-2">Item</th>
              <th className="text-right px-4 py-2">FG pcs</th><th className="text-right px-4 py-2">Cartons</th><th className="text-left px-4 py-2">Closed</th><th className="text-left px-4 py-2">Note</th><th className="text-left px-4 py-2">Status</th><th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {shown.map((r) => {
              const awaiting = !["Dispatched", "Delivered"].includes(r.stage);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-mono text-xs">{r.jNumber}</td>
                  <td className="px-4 py-2"><div className="text-gray-900 dark:text-white">{r.customer || "—"}</div>{r.brand && <div className="text-xs text-gray-500">{r.brand}</div>}</td>
                  <td className="px-4 py-2"><div>{r.item}</div>{r.masterSku && <div className="text-xs font-mono text-gray-500">{r.masterSku}</div>}</td>
                  <td className="px-4 py-2 text-right">{r.fgQty != null ? r.fgQty.toLocaleString("en-IN") : "—"}{r.orderedQty != null && r.fgQty != null && r.fgQty !== r.orderedQty && <div className="text-[11px] text-amber-700">ordered {r.orderedQty.toLocaleString("en-IN")}</div>}</td>
                  <td className="px-4 py-2 text-right">{r.fgCartons ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{formatDate(r.closedAt)}<div className="text-gray-400">{r.closedBy}</div></td>
                  <td className="px-4 py-2 text-xs text-gray-500 max-w-xs truncate">{r.note}</td>
                  <td className="px-4 py-2 text-xs">{awaiting ? <span className="text-amber-700 dark:text-amber-400">Awaiting dispatch</span> : r.stage}</td>
                  <td className="px-4 py-2 text-right">
                    {awaiting && <button type="button" disabled={busy === r.id} onClick={() => markDispatched(r)} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">Dispatched</button>}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
