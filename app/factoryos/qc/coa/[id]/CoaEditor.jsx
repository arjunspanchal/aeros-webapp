"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const input = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white disabled:bg-gray-50 disabled:text-gray-500";

// One editor for every COA. `createUrl` = where the first save POSTs (a
// job's COA endpoint, or the no-job endpoint); after that the sheet has its
// own id and saves PUT to /api/factoryos/coa/[coaId].
export default function CoaEditor({ createUrl = null, coaId: initialCoaId = null, standalone = false, fromPrevious = false, initial, isNew, canEdit, fields }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [coaId, setCoaId] = useState(initialCoaId);
  const [saved, setSaved] = useState(!isNew);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); setMsg(""); };

  const printUrl = coaId ? `/print/coa/s/${coaId}` : null;

  async function save(thenPrint = false) {
    setBusy(true); setMsg("");
    const creating = !coaId;
    const res = await fetch(creating ? createUrl : `/api/factoryos/coa/${coaId}`, {
      method: creating ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(data.error || "Could not save"); return; }
    const id = data.coa?.id || coaId;
    setSaved(true); setDirty(false); setMsg("Saved");
    if (creating) setCoaId(id);
    if (thenPrint) window.open(`/print/coa/s/${id}`, "_blank", "noopener");
    // First save: move to the sheet's own address so a refresh re-opens this
    // COA instead of a blank one.
    if (creating) router.replace(`/factoryos/qc/coa/s/${id}`);
  }

  return (
    <div className="mt-5 bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      {standalone && canEdit && !saved && (
        <ProductPicker onPick={(d) => { setForm((f) => ({ ...d, date: f.date || d.date })); setDirty(true); setMsg(""); }} />
      )}
      {isNew && !saved && !standalone && (
        <p className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:border-amber-900 dark:text-amber-200">
          {fromPrevious
            ? "Copied from this job's last COA. Enter this lot's dispatch quantity and invoice / challan number, re-check weight and colours, then save."
            : "Filled in from the job and the product master. Check every line against the actual goods — especially weight and colours — then save."}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3 items-center">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
        <div className="sm:col-span-2">
          <input type="date" className={input} disabled={!canEdit} value={form.date || ""} onChange={(e) => set("date", e.target.value)} />
        </div>
        {fields.map((f) => (
          <FieldRow key={f.key} label={f.label} hint={f.optional ? "Prints only when filled" : null}>
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
        {saved && !dirty && printUrl && (
          <a href={printUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200">PDF</a>
        )}
        {msg && <span className={`text-sm ${msg === "Saved" ? "text-green-700" : "text-red-600"}`}>{msg}</span>}
      </div>
    </div>
  );
}

// Optional: search the catalogue and fill the sheet from that product.
function ProductPicker({ onPick }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || term === picked) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/factoryos/coa?q=${encodeURIComponent(term)}`);
      if (res.ok) setResults((await res.json()).products || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  async function pick(p) {
    setPicked(p.sku); setQ(p.sku); setResults([]);
    const res = await fetch(`/api/factoryos/coa?sku=${encodeURIComponent(p.sku)}`);
    if (res.ok) onPick((await res.json()).defaults);
  }

  return (
    <div className="mb-5 pb-5 border-b border-gray-200 dark:border-gray-800">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fill from a product <span className="font-normal text-gray-400">(optional)</span></label>
      <input className={`${input} mt-1`} placeholder="Search product name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="mt-1 max-h-64 overflow-auto rounded-lg border border-gray-200 divide-y divide-gray-100 dark:border-gray-700 dark:divide-gray-800">
          {results.map((p) => (
            <li key={p.sku}>
              <button type="button" onClick={() => pick(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                <span className="text-gray-900 dark:text-white">{p.name}</span>
                <span className="block text-xs text-gray-500">{[p.sku, p.size].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Filled from {picked}. Check every line against the actual goods before saving.</p>}
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
