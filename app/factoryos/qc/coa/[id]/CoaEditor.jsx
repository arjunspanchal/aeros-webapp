"use client";

import { useState } from "react";

const input = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white disabled:bg-gray-50 disabled:text-gray-500";

export default function CoaEditor({ jobId, initial, isNew, canEdit, fields }) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(!isNew);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); setMsg(""); };

  async function save(thenPrint = false) {
    setBusy(true); setMsg("");
    const res = await fetch(`/api/factoryos/jobs/${jobId}/coa`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error || "Could not save"); return; }
    setSaved(true); setDirty(false); setMsg("Saved");
    if (thenPrint) window.open(`/print/coa/${jobId}`, "_blank", "noopener");
  }

  return (
    <div className="mt-5 bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      {isNew && !saved && (
        <p className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:border-amber-900 dark:text-amber-200">
          Filled in from the job and the product master. Check every line against the actual goods — especially weight and colours — then save.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3 items-center">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
        <div className="sm:col-span-2">
          <input type="date" className={input} disabled={!canEdit} value={form.date || ""} onChange={(e) => set("date", e.target.value)} />
        </div>
        {fields.map((f) => (
          <FieldRow key={f.key} label={f.label}>
            <input className={input} disabled={!canEdit} value={form[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} />
          </FieldRow>
        ))}
        <FieldRow label="Inspection result" hint="Leave blank to sign by hand">
          <input className={input} disabled={!canEdit} placeholder="e.g. Passed" value={form.inspectionResult || ""} onChange={(e) => set("inspectionResult", e.target.value)} />
        </FieldRow>
        <FieldRow label="Approved by" hint="Leave blank to sign by hand">
          <input className={input} disabled={!canEdit} value={form.approvedBy || ""} onChange={(e) => set("approvedBy", e.target.value)} />
        </FieldRow>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {canEdit && (
          <>
            <button type="button" disabled={busy} onClick={() => save(true)} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">
              {busy ? "Saving…" : "Save & print"}
            </button>
            <button type="button" disabled={busy || (!dirty && saved)} onClick={() => save(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200">
              Save
            </button>
          </>
        )}
        {saved && !dirty && (
          <a href={`/print/coa/${jobId}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200">PDF</a>
        )}
        {msg && <span className={`text-sm ${msg === "Saved" ? "text-green-700" : "text-red-600"}`}>{msg}</span>}
      </div>
    </div>
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {hint && <span className="block text-xs font-normal text-gray-400">{hint}</span>}
      </label>
      <div className="sm:col-span-2">{children}</div>
    </>
  );
}
