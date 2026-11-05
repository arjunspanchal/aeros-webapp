"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";

// Quantity / brand / item / PO / city were fixed at creation; factory managers
// correct them here (Arjun, 05-Nov-2026 — "can Sachin edit a job once it's
// created?"). Same PATCH route the assistant's confirm card uses.
export default function OrderBasicsCard({ job, canEdit, onSaved }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    qty: job.qty ?? "", brand: job.brand || "", item: job.item || "", poNumber: job.poNumber || "", city: job.city || "",
  });
  if (!canEdit || job.closedAt) return null;
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErr(""); };

  async function save() {
    const patch = {};
    const qty = Number(String(form.qty).replace(/,/g, ""));
    if (!Number.isFinite(qty) || qty <= 0) { setErr("Quantity must be a number above 0"); return; }
    if (qty !== Number(job.qty)) patch.qty = qty;
    for (const k of ["brand", "item", "poNumber", "city"]) if ((form[k] || "") !== (job[k] || "")) patch[k] = form[k].trim();
    if (!patch.item && form.item.trim() === "") { setErr("Item name can't be blank"); return; }
    if (!Object.keys(patch).length) { setOpen(false); return; }
    setBusy(true); setErr("");
    const res = await fetch(`/api/factoryos/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not save"); return; }
    setOpen(false);
    // The editor keeps the job in local state — hand it the saved row.
    if (data.job && onSaved) onSaved(data.job);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-xs text-blue-700 hover:underline dark:text-blue-400">
        Edit order basics (quantity, brand, item, PO, city)
      </button>
    );
  }
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:bg-amber-900/20 dark:border-amber-800">
      <div className="text-sm font-semibold text-gray-900 dark:text-white">Edit order basics</div>
      <p className="text-xs text-gray-600 mt-0.5 dark:text-gray-300">Changes the order as recorded — the customer sees item and quantity on their view.</p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Quantity (pcs)</label>
          <input className={inputCls} inputMode="numeric" value={form.qty} onChange={(e) => set("qty", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Brand</label>
          <input className={inputCls} value={form.brand} onChange={(e) => set("brand", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Item name</label>
          <input className={inputCls} value={form.item} onChange={(e) => set("item", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>PO number</label>
          <input className={inputCls} value={form.poNumber} onChange={(e) => set("poNumber", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>City</label>
          <input className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} />
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => { setOpen(false); setErr(""); }} disabled={busy} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200">Cancel</button>
      </div>
    </div>
  );
}
