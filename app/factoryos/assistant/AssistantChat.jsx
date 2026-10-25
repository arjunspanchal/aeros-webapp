"use client";

import { useEffect, useRef, useState } from "react";

const SUGGESTIONS = [
  "What's under printing for bags?",
  "Which jobs are late?",
  "Mark J# 2610006 ready for dispatch",
  "Create a job: 15,000 8oz DW printed cups for Froth, Blue Line offset",
];

const FIELD_LABEL = {
  clientName: "Customer", brand: "Brand", item: "Product", masterSku: "SKU", qty: "Quantity", printingVendor: "Printer",
  printingType: "Printing", stage: "Stage", productionDueDate: "Production due", expectedDispatchDate: "Expected dispatch",
  poNumber: "PO number", notes: "Notes", urgent: "Urgent", rmType: "RM type", paperType: "Paper", gsm: "GSM",
  rmQtySheets: "RM sheets", rmQtyKgs: "RM kg", printingDueDate: "Printing due", estimatedDeliveryDate: "Est. delivery",
  city: "City", internalStatus: "Internal status", actionPoints: "Action points", rmSupplier: "RM supplier", rmMill: "Mill",
  rmSizeMm: "RM size (mm)", rmDeliveryDate: "RM delivery", conversionAt: "Conversion at", packingAt: "Packing at",
  itemSize: "Item size", masterProductName: "Product name",
};
const HIDE = new Set(["clientId", "jobId", "jNumber", "id", "kind", "reason", "note", "changes", "status", "result"]);
const fmt = (v) => (typeof v === "number" ? v.toLocaleString("en-IN") : v === true ? "Yes" : v === false ? "No" : String(v ?? ""));

export default function AssistantChat({ userName }) {
  // `api` = the message blocks sent to Claude; `view` = what we render.
  const [api, setApi] = useState([]);
  const [view, setView] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [view, busy]);

  async function send(text) {
    const t = (text || input).trim();
    if (!t || busy) return;
    setInput("");
    const nextApi = [...api, { role: "user", content: t }];
    setApi(nextApi);
    setView((v) => [...v, { role: "user", text: t }]);
    setBusy(true);
    const res = await fetch("/api/factoryos/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: nextApi }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setView((v) => [...v, { role: "assistant", text: data.error || "Something went wrong — try again.", error: true }]); return; }
    setApi(data.messages);
    setView((v) => [...v, { role: "assistant", text: data.reply, proposals: (data.proposals || []).map((p) => ({ ...p, status: "pending" })) }]);
  }

  // Confirm = call the same REST routes the forms use. Then tell the
  // assistant what happened so the next turn knows.
  async function apply(msgIdx, proposal) {
    setBusy(true);
    let res, body;
    try {
      if (proposal.kind === "create_job") {
        const { kind, id, clientName, ...fields } = proposal;
        res = await fetch("/api/factoryos/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, sourcing: "in_house" }) });
      } else if (proposal.kind === "update_job") {
        res = await fetch(`/api/factoryos/jobs/${proposal.jobId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...proposal.changes, ...(proposal.note ? { note: proposal.note } : {}) }) });
      } else {
        res = await fetch(`/api/factoryos/jobs/${proposal.jobId}`, { method: "DELETE" });
      }
      body = await res.json().catch(() => ({}));
    } catch (e) {
      res = { ok: false }; body = { error: e?.message || "Network error" };
    }
    const ok = res.ok;
    const summary = ok
      ? proposal.kind === "create_job" ? `Created J# ${body.job?.jNumber}` : proposal.kind === "update_job" ? `Updated J# ${proposal.jNumber || proposal.jobId}` : `Deleted J# ${proposal.jNumber || proposal.jobId}`
      : `Failed: ${body.error || res.status}`;
    setView((v) => v.map((m, i) => i !== msgIdx ? m : { ...m, proposals: m.proposals.map((p) => p.id === proposal.id ? { ...p, status: ok ? "applied" : "failed", result: summary } : p) }));
    // Record the outcome in the conversation (as a user-side system note).
    setApi((a) => [...a, { role: "user", content: `[System] Proposal ${proposal.id}: ${summary}${ok && body.job?.id ? ` (job id ${body.job.id})` : ""}. No reply needed.` }, { role: "assistant", content: "Noted." }]);
    setBusy(false);
  }

  function cancel(msgIdx, proposal) {
    setView((v) => v.map((m, i) => i !== msgIdx ? m : { ...m, proposals: m.proposals.map((p) => p.id === proposal.id ? { ...p, status: "cancelled" } : p) }));
    setApi((a) => [...a, { role: "user", content: `[System] Proposal ${proposal.id} was cancelled by the user. No reply needed.` }, { role: "assistant", content: "Noted." }]);
  }

  function reset() { setApi([]); setView([]); setInput(""); }

  return (
    <div className="mt-4 flex flex-col bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800" style={{ minHeight: "70vh" }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!view.length && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <p>Hi{userName ? ` ${userName.split(" ")[0]}` : ""} — try one of these, or type your own:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">{s}</button>
              ))}
            </div>
          </div>
        )}
        {view.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : m.error ? "bg-red-50 text-red-800 border border-red-200" : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"}`}>
              {m.text}
              {m.proposals?.map((p) => <ProposalCard key={p.id} p={p} busy={busy} onApply={() => apply(i, p)} onCancel={() => cancel(i, p)} />)}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-gray-400 px-1">Thinking…</div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-gray-200 p-3 flex gap-2 dark:border-gray-800">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Move J# 2610006 to Packing"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">Send</button>
        {view.length > 0 && <button type="button" onClick={reset} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">New</button>}
      </form>
    </div>
  );
}

function ProposalCard({ p, busy, onApply, onCancel }) {
  const title = p.kind === "create_job" ? "Create job" : p.kind === "update_job" ? `Update J# ${p.jNumber || ""}` : `Delete J# ${p.jNumber || ""}`;
  const rows = p.kind === "update_job"
    ? Object.entries(p.changes || {})
    : p.kind === "create_job" ? Object.entries(p).filter(([k, v]) => !HIDE.has(k) && v !== "" && v != null) : [];
  const tone = p.kind === "delete_job" ? "border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800" : "border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800";
  return (
    <div className={`mt-2 rounded-lg border p-3 text-gray-900 dark:text-gray-100 ${tone}`}>
      <div className="font-semibold">{title}</div>
      {p.kind === "delete_job" && <div className="text-xs mt-1">{p.reason || "This removes the job, its messages, files and inward records."}</div>}
      {rows.length > 0 && (
        <table className="mt-1.5 text-xs">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}><td className="pr-3 py-0.5 text-gray-500 align-top">{FIELD_LABEL[k] || k}</td><td className="py-0.5 font-medium">{fmt(v)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {p.note && <div className="text-xs mt-1 text-gray-600 dark:text-gray-300">Note: {p.note}</div>}
      <div className="mt-2 flex items-center gap-2">
        {p.status === "pending" ? (
          <>
            <button type="button" disabled={busy} onClick={onApply} className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${p.kind === "delete_job" ? "bg-red-600" : "bg-gray-900 dark:bg-white dark:text-gray-900"}`}>
              {p.kind === "delete_job" ? "Confirm delete" : "Confirm"}
            </button>
            <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200">Cancel</button>
          </>
        ) : (
          <span className={`text-xs font-medium ${p.status === "applied" ? "text-green-700 dark:text-green-400" : p.status === "failed" ? "text-red-600" : "text-gray-500"}`}>
            {p.status === "cancelled" ? "Cancelled" : p.result}
          </span>
        )}
      </div>
    </div>
  );
}
