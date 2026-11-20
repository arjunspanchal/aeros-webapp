"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const fmt = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const num = (n) => (n == null ? "" : Number(n).toLocaleString("en-IN"));
const monthKey = (d) => (d ? d.slice(0, 7) : "none");
const monthLabel = (k) => (k === "none" ? "No order date" : new Date(`${k}-15T12:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" }));

const inputCls = "rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white";
const CHUNK = 10;

// Send the ticked jobs a few at a time so a long list never times out, and
// the screen can show how far it has got.
async function sendInChunks(ids, body, onProgress) {
  const done = [];
  const failed = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    onProgress(Math.min(i + CHUNK, ids.length), ids.length);
    try {
      const res = await fetch("/api/factoryos/closeout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ids: part }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { done, failed, error: data.error || `Could not save (${res.status})` };
      done.push(...(data.done || []));
      failed.push(...(data.failed || []));
    } catch {
      return { done, failed, error: "Could not reach the server. Reload to see what was saved." };
    }
  }
  return { done, failed, error: "" };
}

function Result({ result, verb }) {
  if (!result) return null;
  return (
    <div className="mt-3 space-y-1 text-sm" role="status">
      {result.done.length > 0 && <p className="text-green-700 dark:text-green-400">{result.done.length} job{result.done.length === 1 ? "" : "s"} {verb}.</p>}
      {result.failed.length > 0 && (
        <div className="text-amber-800 dark:text-amber-300">
          <p>{result.failed.length} not changed:</p>
          <ul className="ml-4 list-disc">
            {result.failed.map((f, i) => <li key={i}>J# {f.jNumber} {f.error}</li>)}
          </ul>
        </div>
      )}
      {result.error && <p className="text-red-600 dark:text-red-400">{result.error}</p>}
    </div>
  );
}

function Filters({ jobs, q, setQ, month, setMonth }) {
  const months = useMemo(() => {
    const m = new Map();
    for (const j of jobs) m.set(monthKey(j.orderedOn), (m.get(monthKey(j.orderedOn)) || 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [jobs]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search job, customer, brand, item" aria-label="Search jobs" className={`${inputCls} w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1`} />
      <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Ordered in" className={`${inputCls} w-full sm:w-auto`}>
        <option value="">Ordered in: any month</option>
        {months.map(([k, n]) => <option key={k} value={k}>{monthLabel(k)} ({n})</option>)}
      </select>
    </div>
  );
}

function useFiltered(jobs) {
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return jobs.filter((j) => (!month || monthKey(j.orderedOn) === month)
      && (!s || [j.jNumber, j.customer, j.brand, j.item, j.soNo, j.invoiceNo].some((v) => String(v || "").toLowerCase().includes(s))));
  }, [jobs, q, month]);
  return { q, setQ, month, setMonth, shown };
}

function JobList({ jobs, picked, toggle, canPick, pill, extra }) {
  if (!jobs.length) return <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nothing here.</p>;
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {jobs.map((j) => {
        const on = picked.has(j.id);
        const body = (
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/factoryos/manager/${j.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300">J# {j.jNumber}</Link>
              {pill(j)}
            </div>
            <div className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
              {[j.customer, j.brand && j.brand !== j.customer ? j.brand : "", j.item].filter(Boolean).join(" · ") || "—"}
              {j.qty ? <span className="text-gray-500 dark:text-gray-400"> · {num(j.qty)} pcs</span> : null}
            </div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {[j.orderedOn ? `Ordered ${fmt(j.orderedOn)}` : "", j.soNo, extra(j)].filter(Boolean).join(" · ")}
            </div>
          </div>
        );
        if (!canPick) return <li key={j.id} className="flex gap-3 px-4 py-3">{body}</li>;
        return (
          <li key={j.id}>
            <label className={`flex cursor-pointer gap-3 px-4 py-3 ${on ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(j.id)} aria-label={`Job ${j.jNumber}`} className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300" />
              {body}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function usePicked(shown) {
  const [picked, setPicked] = useState(() => new Set());
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = shown.length > 0 && shown.every((j) => picked.has(j.id));
  const toggleAll = () => setPicked((p) => {
    const n = new Set(p);
    if (allShown) shown.forEach((j) => n.delete(j.id)); else shown.forEach((j) => n.add(j.id));
    return n;
  });
  return { picked, setPicked, toggle, allShown, toggleAll };
}

function SelectAll({ shown, allShown, toggleAll, count }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs dark:border-gray-800 dark:bg-gray-800/50">
      <label className="flex cursor-pointer items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={allShown} onChange={toggleAll} className="h-5 w-5 rounded border-gray-300" />
        Tick all {shown.length} shown
      </label>
      <span className="text-gray-600 dark:text-gray-400">{count} ticked</span>
    </div>
  );
}

function DispatchedSection({ jobs, today, canDeliver, onChanged }) {
  const f = useFiltered(jobs);
  const p = usePicked(f.shown);
  const [date, setDate] = useState(today);
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const ids = jobs.filter((j) => p.picked.has(j.id)).map((j) => j.id);

  async function run() {
    setConfirm(false); setResult(null);
    const res = await sendInChunks(ids, { action: "deliver", deliveredOn: date }, (a, b) => setProgress(`Saving ${a} of ${b}…`));
    setProgress("");
    setResult(res);
    p.setPicked(new Set());
    onChanged();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <header className="space-y-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Dispatched, not yet marked delivered ({jobs.length})</h2>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            {canDeliver ? "Tick the jobs that have reached the customer, pick the date, and mark them delivered together." : "The warehouse, sales or an admin marks these delivered."}
          </p>
        </div>
        <Filters jobs={jobs} q={f.q} setQ={f.setQ} month={f.month} setMonth={f.setMonth} />
        {canDeliver && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-gray-600 dark:text-gray-400">
              <span className="mb-1 block">Delivered on</span>
              <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
            {!confirm ? (
              <button type="button" disabled={!ids.length || !date || !!progress} onClick={() => setConfirm(true)} className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
                {progress || (ids.length ? `Mark ${ids.length} delivered` : "Mark delivered")}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm dark:border-green-800 dark:bg-green-900/20">
                <span className="text-gray-900 dark:text-gray-100">Mark {ids.length} job{ids.length === 1 ? "" : "s"} delivered on {fmt(date)}?</span>
                <button type="button" onClick={run} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">Yes, mark delivered</button>
                <button type="button" onClick={() => setConfirm(false)} className="rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
              </div>
            )}
          </div>
        )}
        <Result result={result} verb="marked delivered" />
      </header>
      {canDeliver && f.shown.length > 0 && <SelectAll shown={f.shown} allShown={p.allShown} toggleAll={p.toggleAll} count={ids.length} />}
      <JobList
        jobs={f.shown}
        picked={p.picked}
        toggle={p.toggle}
        canPick={canDeliver}
        pill={(j) => j.leftOn
          ? <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${j.daysOut > 7 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>Left {fmt(j.leftOn)} · {j.daysOut} day{j.daysOut === 1 ? "" : "s"} out</span>
          : <span className="rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-500 dark:border-gray-600 dark:text-gray-400">No dispatch date on record</span>}
        extra={(j) => [j.invoiceNo ? `invoice ${j.invoiceNo}` : "", j.transport].filter(Boolean).join(" · ")}
      />
    </section>
  );
}

function ReadySection({ jobs, today, canCloseOld, onChanged }) {
  const f = useFiltered(jobs);
  const p = usePicked(f.shown);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [leftOn, setLeftOn] = useState("");
  const [reason, setReason] = useState("Left before dispatch was recorded in FactoryOS");
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const ids = jobs.filter((j) => p.picked.has(j.id)).map((j) => j.id);
  const picking = canCloseOld && open;

  async function run() {
    setConfirm(false); setResult(null);
    const res = await sendInChunks(ids, { action: "close_old", deliveredOn: date, leftOn, reason }, (a, b) => setProgress(`Saving ${a} of ${b}…`));
    setProgress("");
    setResult(res);
    p.setPicked(new Set());
    onChanged();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <header className="space-y-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Ready for dispatch, still here ({jobs.length})</h2>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            These leave through <Link href="/factoryos/warehouse/outward" className="underline">Outward</Link> when the Zoho invoice is loaded, or the dispatch form on the job. A job that has been here long needs a look: either it has not left, or it left and nobody recorded it.
          </p>
        </div>
        <Filters jobs={jobs} q={f.q} setQ={f.setQ} month={f.month} setMonth={f.setMonth} />
        {canCloseOld && !open && (
          <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            Close old jobs that already left (admin)
          </button>
        )}
        {picking && (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-xs text-amber-900 dark:text-amber-200">
              For jobs that reached the customer long ago with no dispatch recorded here. Each ticked job goes straight to Delivered and the reason is written on its timeline. Do not use this for goods still in the warehouse.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-700 dark:text-gray-300">
                <span className="mb-1 block">Delivered on</span>
                <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </label>
              <label className="text-xs text-gray-700 dark:text-gray-300">
                <span className="mb-1 block">Left on (if known)</span>
                <input type="date" value={leftOn} max={date || today} onChange={(e) => setLeftOn(e.target.value)} className={inputCls} />
              </label>
              <label className="min-w-0 flex-1 text-xs text-gray-700 dark:text-gray-300">
                <span className="mb-1 block">Reason</span>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} w-full`} />
              </label>
            </div>
            {!confirm ? (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={!ids.length || !date || reason.trim().length < 5 || !!progress} onClick={() => setConfirm(true)} className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {progress || (ids.length ? `Close ${ids.length} as delivered` : "Close as delivered")}
                </button>
                <button type="button" onClick={() => { setOpen(false); p.setPicked(new Set()); }} className="rounded-md px-2 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-900 dark:text-gray-100">Close {ids.length} job{ids.length === 1 ? "" : "s"} as delivered on {fmt(date)}, with no dispatch record?</span>
                <button type="button" onClick={run} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">Yes, close them</button>
                <button type="button" onClick={() => setConfirm(false)} className="rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
              </div>
            )}
          </div>
        )}
        <Result result={result} verb="closed as delivered" />
      </header>
      {picking && f.shown.length > 0 && <SelectAll shown={f.shown} allShown={p.allShown} toggleAll={p.toggleAll} count={ids.length} />}
      <JobList
        jobs={f.shown}
        picked={p.picked}
        toggle={p.toggle}
        canPick={picking}
        pill={(j) => {
          // Ready since the handover; old jobs have no handover date, so go by the order date.
          const age = j.waitingDays ?? j.orderedDays ?? 0;
          const limit = j.handedOverOn ? [14, 5] : [45, 30];
          const tone = age > limit[0] ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : age > limit[1] ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
          const text = j.handedOverOn
            ? `Ready since ${fmt(j.handedOverOn)} · ${j.waitingDays} day${j.waitingDays === 1 ? "" : "s"}`
            : `No handover date${j.orderedDays != null ? ` · ordered ${j.orderedDays} days ago` : ""}`;
          return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{text}</span>;
        }}
        extra={(j) => (j.lots ? `part sent: ${num(j.sentQty)} pcs in ${j.lots} lot${j.lots === 1 ? "" : "s"}` : "nothing dispatched yet")}
      />
    </section>
  );
}

export default function CloseoutClient({ data, canDeliver, canCloseOld }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Mark delivered</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Finish the jobs that have left the building. A job is only closed when it is marked delivered.
      </p>
      <div className="mt-4 space-y-6">
        <DispatchedSection jobs={data.dispatched} today={data.today} canDeliver={canDeliver} onChanged={refresh} />
        <ReadySection jobs={data.ready} today={data.today} canCloseOld={canCloseOld} onChanged={refresh} />
      </div>
    </div>
  );
}
