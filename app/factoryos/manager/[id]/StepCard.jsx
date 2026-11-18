"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";
import { ROLES, STAGES } from "@/lib/factoryos/constants";
import { PAPER_TYPES, normPrintingType } from "@/lib/factoryos/jobOptions";
import { nextStage, requirementsFor, canMoveTo, OWNER_LABEL } from "@/lib/factoryos/steps";
import { isHandPasted } from "@/lib/factoryos/routes";
import DispatchForm from "@/app/factoryos/_components/DispatchForm";

// The one place a job moves forward (rebuild step 1). Shows the current step,
// exactly what must be filled before the next one, and a single button that
// stays locked until it is. The server enforces the same list.
const today = () => new Date().toISOString().slice(0, 10);
const d10 = (v) => (v ? String(v).slice(0, 10) : "");

export default function StepCard({ job, role, ctx, outsourcers = [], printingVendors = [] }) {
  const c = ctx || { inwardCount: 0, coaCount: 0, lots: [], dispatchedQty: 0 };
  const [f, setF] = useState({
    coatingRequired: !!job.coatingRequired,
    printingType: normPrintingType(job.printingType),
    productionDueDate: d10(job.productionDueDate),
    paperType: job.paperType || "",
    rmQtySheets: job.rmQtySheets ?? "",
    rmQtyKgs: job.rmQtyKgs ?? "",
    coatingVendorId: job.coatingVendorId || "",
    coatingSentOn: d10(job.coatingSentOn),
    coatingDueDate: d10(job.coatingDueDate),
    coatingReceivedOn: d10(job.coatingReceivedOn),
    printingVendor: job.printingVendor || "",
    printingDueDate: d10(job.printingDueDate),
    producedQty: job.producedQty ?? "",
    fgQty: job.fgQty ?? "",
    fgCartons: job.fgCartons ?? "",
    closeNote: "",
    deliveredOn: d10(job.deliveredOn) || today(),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [ovOpen, setOvOpen] = useState(false);
  const [ovStage, setOvStage] = useState("");
  const [ovReason, setOvReason] = useState("");
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErr(""); };

  // The job as it would be once this card is saved: drives the live checklist.
  const draft = useMemo(() => ({ ...job, ...f }), [job, f]);
  const to = nextStage(draft);
  const reqs = to ? requirementsFor(draft, to, c) : [];
  const missing = reqs.filter((r) => !r.ok);
  const mine = to ? canMoveTo(role, to) : false;
  const isAdmin = role === ROLES.ADMIN;
  const routeStep = job.stage === "RM Pending" || job.stage === "Coating";

  // What was already saved on the job when the page loaded. A field that is
  // already filled shows its value here, not a second input box: it is edited
  // in the detail cards below. Only what is missing gets an input on this card.
  const savedTo = nextStage(job);
  const savedOk = new Set((savedTo ? requirementsFor(job, savedTo, c) : []).filter((r) => r.ok).map((r) => r.key));
  const savedValue = (r) => {
    const fmt = (v) => (v ? d10(v).split("-").reverse().join("-") : "");
    switch (r.field) {
      case "productionDueDate": case "coatingSentOn": case "coatingDueDate": case "coatingReceivedOn": case "printingDueDate": case "deliveredOn": return fmt(job[r.field]);
      case "paperType": return job.paperType;
      case "rmQty": return [job.rmQtySheets ? `${Number(job.rmQtySheets).toLocaleString("en-IN")} sheets` : "", job.rmQtyKgs ? `${Number(job.rmQtyKgs).toLocaleString("en-IN")} kg` : ""].filter(Boolean).join(" / ");
      case "coatingVendorId": return outsourcers.find((v) => v.id === job.coatingVendorId)?.name || "";
      case "printingType": return normPrintingType(job.printingType);
      case "printingVendor": return job.printingVendor;
      case "producedQty": case "fgQty": case "fgCartons": return job[r.field] != null ? Number(job[r.field]).toLocaleString("en-IN") : "";
      default: return "";
    }
  };

  const coaters = outsourcers.filter((v) => (v.capabilities || []).includes("pe_coating"));
  const wantCap = f.printingType === "Flexo" ? "flexo" : f.printingType === "Offset" ? "offset" : null;
  const capable = wantCap ? outsourcers.filter((v) => (v.capabilities || []).includes(wantCap)).map((v) => v.name) : [];
  const printerOptions = Array.from(new Set([...(capable.length ? capable : printingVendors), f.printingVendor].filter(Boolean)));

  function stepFields() {
    const out = {};
    if (routeStep) { out.coatingRequired = f.coatingRequired; out.printingType = f.printingType || null; }
    for (const r of reqs) {
      if (!r.field || savedOk.has(r.key)) continue; // already saved: not re-sent from here
      if (r.field === "rmQty") { out.rmQtySheets = f.rmQtySheets; out.rmQtyKgs = f.rmQtyKgs; }
      else out[r.field] = f[r.field];
    }
    if (to === "Ready for Dispatch" && f.closeNote) out.closeNote = f.closeNote;
    return out;
  }

  async function send(body) {
    setBusy(true); setErr("");
    const res = await fetch(`/api/factoryos/jobs/${job.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not save"); return false; }
    // Full reload so every card on the page shows the saved values.
    window.location.reload();
    return true;
  }
  const move = () => send({ stage: to, stepFields: stepFields(), note: note.trim() || undefined });
  const saveOnly = () => send({ stepFields: stepFields() });
  const override = () => send({ stage: ovStage, override: true, reason: ovReason });

  function fieldInput(r) {
    switch (r.field) {
      case "productionDueDate": case "coatingSentOn": case "coatingDueDate": case "coatingReceivedOn": case "printingDueDate": case "deliveredOn":
        return <input type="date" className={inputCls} value={f[r.field]} onChange={(e) => set(r.field, e.target.value)} />;
      case "paperType":
        return (
          <select className={inputCls} value={f.paperType} onChange={(e) => set("paperType", e.target.value)}>
            <option value="">— Pick —</option>
            {Array.from(new Set([...PAPER_TYPES, f.paperType].filter(Boolean))).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        );
      case "rmQty":
        return (
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} inputMode="numeric" placeholder="Sheets" value={f.rmQtySheets} onChange={(e) => set("rmQtySheets", e.target.value)} />
            <input className={inputCls} inputMode="decimal" placeholder="Kg" value={f.rmQtyKgs} onChange={(e) => set("rmQtyKgs", e.target.value)} />
          </div>
        );
      case "coatingVendorId":
        return (
          <select className={inputCls} value={f.coatingVendorId} onChange={(e) => set("coatingVendorId", e.target.value)}>
            <option value="">— Pick the coater —</option>
            {coaters.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        );
      case "printingType":
        return <p className="text-xs text-gray-500 dark:text-gray-400">Pick Flexo or Offset under "Route" above.</p>;
      case "printingVendor":
        return (
          <select className={inputCls} value={f.printingVendor} onChange={(e) => set("printingVendor", e.target.value)}>
            <option value="">— Pick the printer —</option>
            {printerOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        );
      case "producedQty": case "fgQty": case "fgCartons":
        return <input className={inputCls} inputMode="numeric" value={f[r.field]} onChange={(e) => set(r.field, e.target.value)} placeholder={r.field === "fgCartons" ? "Cartons" : "Pieces"} />;
      default:
        return null;
    }
  }

  function helpFor(r) {
    if (r.key === "inward") return <span>Record it under <a href="#inward-panel" className="text-blue-600 hover:underline dark:text-blue-400">Inward from printer</a> below, then come back here.</span>;
    if (r.key === "coa") return <Link href={`/factoryos/qc/coa/${job.id}/new`} className="text-blue-600 hover:underline dark:text-blue-400">Make the COA →</Link>;
    return null;
  }

  if (!to) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">This job is delivered{job.deliveredOn ? ` (${d10(job.deliveredOn)})` : ""}.</div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Nothing more to do here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-blue-200 rounded-xl p-5 dark:bg-gray-900 dark:border-blue-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Now: {job.stage} <span className="text-gray-400 font-normal">→ next: {to}</span>
        </h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">Moved by: {OWNER_LABEL[job.stage] || "Team"}</span>
      </div>

      {isHandPasted(draft) && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          Hand-pasted bag: the printed stock comes into the warehouse as sheets and is pasted by hand. Record the inward in sheets; "In Conversion" here means hand pasting.
        </p>
      )}

      {routeStep && mine && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
          <div className={labelCls}>Route</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-800 dark:text-gray-200">
            {job.stage === "RM Pending" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={f.coatingRequired} onChange={(e) => set("coatingRequired", e.target.checked)} />
                Paper goes for PE coating first
              </label>
            )}
            <span className="flex items-center gap-2">
              Printing:
              {[["Flexo", "Flexo"], ["Offset", "Offset"], ["Plain", "Plain, no printing"]].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1">
                  <input type="radio" name="step-print" checked={f.printingType === v} onChange={() => set("printingType", v)} />
                  {l}
                </label>
              ))}
            </span>
          </div>
        </div>
      )}

      {to === "Dispatched" ? (
        <div className="mt-4">
          <DispatchForm job={job} lots={c.lots} canDispatch={mine} onDone={() => window.location.reload()} />
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {reqs.map((r) => (
              <li key={r.key} className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-3 items-center">
                <div className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${r.ok ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                    {r.ok ? "✓" : "!"}
                  </span>
                  <span className="text-gray-800 dark:text-gray-200">{r.label}</span>
                </div>
                <div className="text-sm">
                  {savedOk.has(r.key)
                    ? <span className="text-gray-600 dark:text-gray-300">{savedValue(r)}</span>
                    : mine ? (fieldInput(r) || (!r.ok && helpFor(r))) : (!r.ok && helpFor(r))}
                </div>
              </li>
            ))}
            {reqs.length === 0 && <li className="text-sm text-gray-500 dark:text-gray-400">Nothing more is needed for this step.</li>}
          </ul>

          {mine ? (
            <div className="mt-4 space-y-2">
              {to === "Ready for Dispatch" && (
                <input className={inputCls} placeholder="Note for the warehouse (optional)" value={f.closeNote} onChange={(e) => set("closeNote", e.target.value)} />
              )}
              <input className={inputCls} placeholder="Note for the timeline (optional, the team sees it)" value={note} onChange={(e) => setNote(e.target.value)} />
              {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={move} disabled={busy || missing.length > 0} className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700">
                  {busy ? "Saving…" : missing.length ? `Locked: ${missing.length} thing${missing.length === 1 ? "" : "s"} missing` : `Done. Move to ${to}`}
                </button>
                {missing.length > 0 && (
                  <button type="button" onClick={saveOnly} disabled={busy} className="text-sm text-blue-700 hover:underline dark:text-blue-400">Save what I have filled</button>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              {missing.length ? `Waiting on ${missing.length} item${missing.length === 1 ? "" : "s"} from the ${(OWNER_LABEL[job.stage] || "team").toLowerCase()}.` : `Ready to move. Waiting for the ${(OWNER_LABEL[job.stage] || "team").toLowerCase()}.`}
            </p>
          )}
        </>
      )}

      {isAdmin && (
        <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
          {!ovOpen ? (
            <button type="button" onClick={() => setOvOpen(true)} className="text-xs text-gray-500 hover:underline dark:text-gray-400">Admin override (move without the checks, or move back)</button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <div>
                <label className={labelCls}>Move to</label>
                <select className={inputCls} value={ovStage} onChange={(e) => setOvStage(e.target.value)}>
                  <option value="">— Stage —</option>
                  {STAGES.filter((s) => s !== job.stage).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Reason (logged)</label>
                <input className={inputCls} value={ovReason} onChange={(e) => setOvReason(e.target.value)} />
              </div>
              <button type="button" onClick={override} disabled={busy || !ovStage || !ovReason.trim()} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300">Override</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
