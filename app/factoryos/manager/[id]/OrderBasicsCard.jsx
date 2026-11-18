"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";
import { JOB_FEATURES } from "@/lib/factoryos/jobOptions";
import ZohoSoField from "@/app/factoryos/_components/ZohoSoField";

// Quantity / brand / item / PO / city were fixed at creation; factory managers
// correct them here (Arjun, 05-Nov-2026 — "can Sachin edit a job once it's
// created?"). Same PATCH route the assistant's confirm card uses.
// Sales manager added 17-Nov-2026: every job needs one, so a job without one
// shows a red prompt and the field can be changed but not cleared.
export default function OrderBasicsCard({ job, canEdit, onSaved, salesManagers = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    qty: job.qty ?? "", brand: job.brand || "", item: job.item || "", poNumber: job.poNumber || "", city: job.city || "",
    customerManagerId: job.customerManagerId || "",
    zohoSoNo: job.zohoSoNo || "",
    itemSize: job.itemSize || "",
    extraFeatures: (job.extraFeatures || []).filter((x) => JOB_FEATURES.includes(x)),
    otherFeature: (job.extraFeatures || []).filter((x) => !JOB_FEATURES.includes(x)).join(", "),
  });
  // A job on a catalogue item keeps the catalogue (listing) name; only a
  // custom item has a typed name and size.
  const nameLocked = !!job.masterSku && !job.customItem;
  const [soOk, setSoOk] = useState(!!job.zohoSoNo);
  const [soLine, setSoLine] = useState(job.zohoSoLineId || "");
  const [soLines, setSoLines] = useState(0);
  if (!canEdit || job.closedAt) return null;
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErr(""); };
  const manager = salesManagers.find((m) => m.id === job.customerManagerId);

  async function save() {
    const patch = {};
    const qty = Number(String(form.qty).replace(/,/g, ""));
    if (!Number.isFinite(qty) || qty <= 0) { setErr("Quantity must be a number above 0"); return; }
    if (qty !== Number(job.qty)) patch.qty = qty;
    for (const k of ["brand", "item", "poNumber", "city"]) if ((form[k] || "") !== (job[k] || "")) patch[k] = form[k].trim();
    if (!patch.item && form.item.trim() === "") { setErr("Item name can't be blank"); return; }
    if (!form.customerManagerId) { setErr("Pick the sales manager for this job"); return; }
    if (form.customerManagerId !== (job.customerManagerId || "")) patch.customerManagerId = form.customerManagerId;
    if (form.zohoSoNo.trim() !== (job.zohoSoNo || "")) {
      if (form.zohoSoNo.trim() && !soOk) { setErr("That Zoho SO number didn't check out"); return; }
      patch.zohoSoNo = form.zohoSoNo.trim();
    }
    // Which item of the SO this job is for (one job per SO item).
    if (form.zohoSoNo.trim() && soLine !== (job.zohoSoLineId || "")) {
      if (soLine) patch.zohoSoLineId = soLine;
      else if (soLines > 1) { setErr("This SO has several items. Pick which item this job is for."); return; }
    }
    if (nameLocked) delete patch.item;
    if (job.customItem && (form.itemSize || "") !== (job.itemSize || "")) patch.itemSize = form.itemSize.trim();
    const feats = [...form.extraFeatures, ...String(form.otherFeature || "").split(",")].map((x) => x.trim()).filter(Boolean);
    if (JSON.stringify(feats) !== JSON.stringify(job.extraFeatures || [])) patch.extraFeatures = feats;
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
      <div className="mt-3 space-y-1">
        {job.zohoSoNo ? (
          <div className="text-xs text-gray-600 dark:text-gray-300">
            Zoho SO: <span className="font-mono font-medium text-gray-900 dark:text-white">{job.zohoSoNo}</span>
            {job.zohoSoLineName && <span className="ml-1 text-gray-500 dark:text-gray-400">· {job.zohoSoLineName}</span>}
            {job.zohoSoUnverified && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">not checked in Zoho yet</span>}
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="block rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300">
            No Zoho SO linked — add it
          </button>
        )}
        {job.customerManagerId ? (
          <div className="text-xs text-gray-600 dark:text-gray-300">
            Sales manager: <span className="font-medium text-gray-900 dark:text-white">{manager?.name || "—"}</span>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="block rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300">
            No sales manager on this job — set one
          </button>
        )}
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-blue-700 hover:underline dark:text-blue-400">
          Edit order basics (quantity, brand, item, features, PO, Zoho SO, city, sales manager)
        </button>
      </div>
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
          <label className={labelCls}>Item name {nameLocked && <span className="font-normal normal-case text-gray-400">(catalogue name, fixed. Change the catalogue item to change it)</span>}</label>
          <input className={inputCls} value={form.item} onChange={(e) => set("item", e.target.value)} disabled={nameLocked} />
        </div>
        {job.customItem && (
          <div className="sm:col-span-2">
            <label className={labelCls}>Item size (real size of this custom item)</label>
            <input className={inputCls} value={form.itemSize} onChange={(e) => set("itemSize", e.target.value)} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={labelCls}>Additional features</label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-800 dark:text-gray-200">
            {JOB_FEATURES.map((ft) => (
              <label key={ft} className="flex items-center gap-1.5">
                <input type="checkbox" checked={form.extraFeatures.includes(ft)} onChange={(e) => set("extraFeatures", e.target.checked ? [...form.extraFeatures, ft] : form.extraFeatures.filter((x) => x !== ft))} />
                {ft}
              </label>
            ))}
            <input className={`${inputCls} max-w-xs`} placeholder="Other feature (type it)" value={form.otherFeature} onChange={(e) => set("otherFeature", e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>PO number</label>
          <input className={inputCls} value={form.poNumber} onChange={(e) => set("poNumber", e.target.value)} />
        </div>
        <ZohoSoField
          value={form.zohoSoNo}
          onChange={(v) => { set("zohoSoNo", v); setSoOk(false); }}
          onResolved={(so) => { setSoOk(!!so); setSoLines(((so && so.lines) || []).filter((l) => l.id).length); }}
          lineId={soLine}
          onLineChange={(id) => setSoLine(id)}
          currentJobId={job.id}
        />
        <div>
          <label className={labelCls}>City</label>
          <input className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Sales manager <span className="text-red-500">*</span></label>
          <select className={inputCls} value={form.customerManagerId} onChange={(e) => set("customerManagerId", e.target.value)}>
            <option value="">— Pick —</option>
            {salesManagers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
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
