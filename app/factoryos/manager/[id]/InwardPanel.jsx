"use client";
import { useEffect, useState } from "react";
import { inputCls, labelCls, formatDate } from "@/app/factoryos/_components/ui";
import { inwardTotals, INWARD_UNITS } from "@/lib/factoryos/inwards";

// What came back from the printer, delivery by delivery, against what was
// ordered. Lives on the job so a short or damaged delivery is recorded
// where the job is, not in a spreadsheet.
export default function InwardPanel({ jobId, orderedQty, vendor, canEdit }) {
  const [inwards, setInwards] = useState(null);
  const [form, setForm] = useState({ receivedOn: new Date().toISOString().slice(0, 10), qty: "", unit: "pcs", damagedQty: "", challanNo: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`/api/factoryos/jobs/${jobId}/inwards`).then((r) => r.json()).then((d) => setInwards(d.inwards || [])).catch(() => setInwards([]));
  }, [jobId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const t = inwardTotals(inwards || [], orderedQty);

  async function add(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/factoryos/jobs/${jobId}/inwards`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not record inward");
      setInwards(d.inwards);
      setForm((f) => ({ ...f, qty: "", damagedQty: "", challanNo: "", notes: "" }));
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  async function remove(id) {
    if (!confirm("Remove this inward entry?")) return;
    const res = await fetch(`/api/factoryos/jobs/${jobId}/inwards?id=${id}`, { method: "DELETE" });
    const d = await res.json();
    if (res.ok) setInwards(d.inwards);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Inward from printer{vendor ? ` · ${vendor}` : ""}</h2>
        {inwards && inwards.length > 0 && (
          <span className={`text-xs ${t.short ? "text-amber-700 dark:text-amber-400" : "text-gray-600 dark:text-gray-300"}`}>
            Received {t.received.toLocaleString("en-IN")} {t.unit}
            {t.damaged > 0 && <> · damaged {t.damaged.toLocaleString("en-IN")}</>}
            {t.ordered != null && t.unit === "pcs" && <> · ordered {t.ordered.toLocaleString("en-IN")}</>}
            {t.short > 0 && <> · <span className="font-semibold">short {t.short.toLocaleString("en-IN")}</span></>}
            {t.mixedUnits && <> · mixed units</>}
          </span>
        )}
      </div>

      {inwards === null ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : inwards.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Nothing received yet.</p>
      ) : (
        <table className="w-full text-xs mb-3">
          <thead className="text-gray-500 dark:text-gray-400">
            <tr><th className="text-left py-1">Date</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Damaged</th><th className="text-left py-1 pl-3">Challan</th><th className="text-left py-1 pl-3">Notes</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {inwards.map((i) => (
              <tr key={i.id}>
                <td className="py-1">{formatDate(i.receivedOn)}</td>
                <td className="py-1 text-right">{i.qty.toLocaleString("en-IN")} {i.unit}</td>
                <td className="py-1 text-right">{i.damagedQty ? i.damagedQty.toLocaleString("en-IN") : "—"}</td>
                <td className="py-1 pl-3">{i.challanNo || "—"}</td>
                <td className="py-1 pl-3 text-gray-500 dark:text-gray-400">{i.notes || ""}</td>
                <td className="py-1 text-right">
                  {canEdit && <button type="button" onClick={() => remove(i.id)} className="text-red-600 hover:underline dark:text-red-400">remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && (
        <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <div><label className={labelCls}>Received on</label><input type="date" className={inputCls} value={form.receivedOn} onChange={(e) => set("receivedOn", e.target.value)} /></div>
          <div><label className={labelCls}>Qty received</label><input type="number" min="0" className={inputCls} value={form.qty} onChange={(e) => set("qty", e.target.value)} required /></div>
          <div><label className={labelCls}>Unit</label>
            <select className={inputCls} value={form.unit} onChange={(e) => set("unit", e.target.value)}>{INWARD_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
          <div><label className={labelCls}>Damaged</label><input type="number" min="0" className={inputCls} value={form.damagedQty} onChange={(e) => set("damagedQty", e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Challan no.</label><input className={inputCls} value={form.challanNo} onChange={(e) => set("challanNo", e.target.value)} /></div>
          <div><button type="submit" disabled={busy} className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">{busy ? "Saving…" : "Record inward"}</button></div>
          <div className="col-span-2 sm:col-span-6"><input className={inputCls} placeholder="Notes — e.g. 2 bundles wet, colour off on 500 pcs" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          {err && <p className="col-span-2 sm:col-span-6 text-xs text-red-600 dark:text-red-400">{err}</p>}
        </form>
      )}
    </div>
  );
}
