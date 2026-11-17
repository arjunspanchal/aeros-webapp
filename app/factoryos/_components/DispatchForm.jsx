"use client";
import { useState } from "react";
import { inputCls, labelCls, formatDate } from "@/app/factoryos/_components/ui";
import { TRANSPORT_MODES } from "@/lib/factoryos/steps";

const today = () => new Date().toISOString().slice(0, 10);
const num = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : "—");

// Record what left the building for one job. Used on the job page and in the
// warehouse dispatch queue. Part lots are fine: the job moves to Dispatched
// when the lots cover the order, or when "this completes the order" is ticked.
export default function DispatchForm({ job, lots = [], canDispatch = false, onDone }) {
  const target = Number(job.fgQty) > 0 ? Number(job.fgQty) : Number(job.qty) || 0;
  const sent = lots.reduce((t, l) => t + (l.qty || 0), 0);
  const balance = Math.max(0, target - sent);
  const [f, setF] = useState({
    dispatchedOn: today(), qty: balance || "", cartons: "", transportMode: "", lrOrVehicleNumber: "",
    driverContact: "", zohoInvoiceNo: "", ewayBillNo: "", note: "", complete: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErr(""); };

  async function submit() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/factoryos/jobs/${job.id}/dispatches`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not record the dispatch"); return; }
    if (onDone) onDone(data);
  }

  return (
    <div className="space-y-3">
      {lots.length > 0 && (
        <div className="text-xs text-gray-600 dark:text-gray-300">
          <div className="font-medium text-gray-900 dark:text-white mb-1">Already dispatched: {num(sent)} of {num(target)} pcs</div>
          <ul className="space-y-0.5">
            {lots.map((l) => (
              <li key={l.id}>
                {formatDate(l.dispatchedOn)} · {num(l.qty)} pcs{l.cartons ? ` · ${l.cartons} cartons` : ""} · {l.transportMode} · {l.lrOrVehicleNumber} · invoice {l.zohoInvoiceNo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!canDispatch ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Dispatch is recorded by the warehouse team.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Dispatch date *</label>
              <input type="date" className={inputCls} value={f.dispatchedOn} onChange={(e) => set("dispatchedOn", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Quantity (pcs) *</label>
              <input className={inputCls} inputMode="numeric" value={f.qty} onChange={(e) => set("qty", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Cartons</label>
              <input className={inputCls} inputMode="numeric" value={f.cartons} onChange={(e) => set("cartons", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Transport *</label>
              <select className={inputCls} value={f.transportMode} onChange={(e) => set("transportMode", e.target.value)}>
                <option value="">— Pick —</option>
                {TRANSPORT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>LR or vehicle number *</label>
              <input className={inputCls} value={f.lrOrVehicleNumber} onChange={(e) => set("lrOrVehicleNumber", e.target.value)} placeholder="LR number or MH-04-AB-1234" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Zoho invoice number *</label>
              <input className={inputCls} value={f.zohoInvoiceNo} onChange={(e) => set("zohoInvoiceNo", e.target.value)} placeholder="As on the Zoho invoice" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>E-way bill number</label>
              <input className={inputCls} value={f.ewayBillNo} onChange={(e) => set("ewayBillNo", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Driver contact</label>
              <input className={inputCls} value={f.driverContact} onChange={(e) => set("driverContact", e.target.value)} placeholder="Name and phone" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={f.complete} onChange={(e) => set("complete", e.target.checked)} />
            This completes the order (mark the job Dispatched even if the quantity is short)
          </label>
          {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          <button type="button" onClick={submit} disabled={busy} className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {busy ? "Saving…" : "Record dispatch"}
          </button>
        </>
      )}
    </div>
  );
}
