"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { inputCls, formatDate } from "@/app/factoryos/_components/ui";
import DispatchForm from "@/app/factoryos/_components/DispatchForm";

const num = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : "—");
const today = () => new Date().toISOString().slice(0, 10);

function JobLine({ j }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold text-gray-900 dark:text-white">
        {j.urgent && <span className="text-red-600 dark:text-red-400">! </span>}
        <Link href={`/factoryos/manager/${j.id}`} className="hover:underline">{j.jNumber}</Link>
        {j.zohoSoNo && <span className="ml-1 font-mono text-xs font-normal text-gray-500 dark:text-gray-400">{j.zohoSoNo}</span>}
        <span className="font-normal text-gray-600 dark:text-gray-300"> · {j.brand || j.clientName}{j.city ? ` · ${j.city}` : ""}</span>
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-300 truncate">{j.item}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {num(j.fgQty ?? j.qty)} pcs{j.fgCartons ? ` · ${j.fgCartons} cartons` : ""}
        {j.dispatchedQty > 0 ? ` · ${num(j.dispatchedQty)} already sent` : ""}
        {j.closeNote ? ` · Note: ${j.closeNote}` : ""}
      </div>
    </div>
  );
}

function ReadyCard({ j, canDispatch }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-start justify-between gap-3">
        <JobLine j={j} />
        <div className="shrink-0 text-right">
          <div className={`text-xs font-medium ${j.waitingDays > 7 ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
            waiting {j.waitingDays ?? "—"} day{j.waitingDays === 1 ? "" : "s"}
          </div>
          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            {open ? "Close" : canDispatch ? "Dispatch" : "Details"}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
          <DispatchForm job={j} lots={j.lots} canDispatch={canDispatch} onDone={() => window.location.reload()} />
        </div>
      )}
    </div>
  );
}

function TransitCard({ j, canDeliver }) {
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function deliver() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/factoryos/jobs/${j.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "Delivered", stepFields: { deliveredOn: date } }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not mark delivered"); return; }
    window.location.reload();
  }
  const last = j.lots[j.lots.length - 1];
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <JobLine j={j} />
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {last
              ? `Left ${formatDate(last.dispatchedOn)} · ${last.transportMode} · ${last.lrOrVehicleNumber} · invoice ${last.zohoInvoiceNo}`
              : "No dispatch details were recorded for this job."}
            {" · "}<span className={j.waitingDays > 10 ? "text-red-600 dark:text-red-400" : ""}>{j.waitingDays ?? "—"} days since dispatch</span>
          </div>
        </div>
        {canDeliver && (
          <div className="flex items-end gap-2">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Delivery date" />
            <button type="button" onClick={deliver} disabled={busy || !date} className="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">
              {busy ? "Saving…" : "Delivered"}
            </button>
          </div>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
    </div>
  );
}

export default function DispatchQueueClient({ ready, inTransit, canDispatch, canDeliver }) {
  const [q, setQ] = useState("");
  const match = (j) => !q.trim() || `${j.jNumber} ${j.zohoSoNo || ""} ${j.brand} ${j.clientName} ${j.item} ${j.city}`.toLowerCase().includes(q.trim().toLowerCase());
  const r = useMemo(() => ready.filter(match), [ready, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = useMemo(() => inTransit.filter(match), [inTransit, q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dispatch</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {ready.length} ready to go · {inTransit.length} dispatched, not yet confirmed delivered
          </p>
        </div>
        <input className={`${inputCls} max-w-xs`} placeholder="Search job, customer, city…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Ready to go ({r.length})</h2>
        <div className="space-y-2">
          {r.length ? r.map((j) => <ReadyCard key={j.id} j={j} canDispatch={canDispatch} />)
            : <p className="text-sm text-gray-500 dark:text-gray-400">Nothing is waiting to be dispatched.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Dispatched, awaiting delivery ({t.length})</h2>
        <div className="space-y-2">
          {t.length ? t.map((j) => <TransitCard key={j.id} j={j} canDeliver={canDeliver} />)
            : <p className="text-sm text-gray-500 dark:text-gray-400">Nothing is in transit.</p>}
        </div>
      </section>
    </div>
  );
}
