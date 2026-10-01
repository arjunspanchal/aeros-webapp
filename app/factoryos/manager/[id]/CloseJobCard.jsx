"use client";
import { useState } from "react";
import { inputCls, labelCls, formatDate } from "@/app/factoryos/_components/ui";

// Factory closes the job: finished pcs (and cartons) handed to the warehouse.
// After this the warehouse team owns it — they see it on
// /warehouse/factory-fg and mark it dispatched.
export default function CloseJobCard({ job, onChanged }) {
  const [fgQty, setFgQty] = useState(job.qty != null ? String(job.qty) : "");
  const [fgCartons, setFgCartons] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function close() {
    if (!confirm(`Close J# ${job.jNumber} and hand ${Number(fgQty || 0).toLocaleString("en-IN")} pcs to the warehouse?`)) return;
    setBusy(true); setErr("");
    const res = await fetch(`/api/factoryos/jobs/${job.id}/close`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fgQty, fgCartons: fgCartons || null, note }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not close"); return; }
    onChanged?.();
  }
  async function reopen() {
    if (!confirm("Reopen this job? It will disappear from the warehouse's handover list.")) return;
    setBusy(true);
    await fetch(`/api/factoryos/jobs/${job.id}/close`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reopen" }) });
    setBusy(false);
    onChanged?.();
  }

  if (job.closedAt) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 dark:bg-green-900/20 dark:border-green-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-green-900 dark:text-green-200">Closed — with warehouse</h2>
            <p className="text-xs text-green-800 dark:text-green-300 mt-0.5">
              {job.fgQty != null ? `${job.fgQty.toLocaleString("en-IN")} pcs` : ""}{job.fgCartons ? ` in ${job.fgCartons} cartons` : ""} handed over {formatDate(job.closedAt)}{job.closeNote ? ` · ${job.closeNote}` : ""}
              {job.qty != null && job.fgQty != null && job.fgQty !== job.qty && <> · ordered {job.qty.toLocaleString("en-IN")}</>}
            </p>
          </div>
          <button type="button" onClick={reopen} disabled={busy} className="text-xs text-green-900 underline dark:text-green-200">Reopen</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Close job → warehouse</h2>
      <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">When the finished goods are packed, enter what's going to the warehouse. The warehouse team dispatches from their list.</p>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <div><label className={labelCls}>Finished pcs</label><input type="number" min="1" className={inputCls} value={fgQty} onChange={(e) => setFgQty(e.target.value)} /></div>
        <div><label className={labelCls}>Cartons (optional)</label><input type="number" min="0" className={inputCls} value={fgCartons} onChange={(e) => setFgCartons(e.target.value)} /></div>
        <div className="col-span-2"><label className={labelCls}>Note (optional)</label><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 200 pcs rejected at QC" /></div>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <button type="button" onClick={close} disabled={busy || !(Number(fgQty) > 0)} className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">
        {busy ? "Closing…" : "Close job & hand to warehouse"}
      </button>
    </div>
  );
}
