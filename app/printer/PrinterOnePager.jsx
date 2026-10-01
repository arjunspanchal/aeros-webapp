"use client";
import { useState } from "react";

const today = () => new Date().toISOString().slice(0, 10);
function fmt(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function PrinterOnePager({ mode, vendors = [], vendorName = "", pending = [], recent = [] }) {
  if (mode === "login") return <Login vendors={vendors} />;
  return <Jobs vendorName={vendorName} pending={pending} recent={recent} />;
}

function Login({ vendors }) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id || "");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/printer/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendorId, password }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not log in"); return; }
    window.location.reload();
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div>
          <div className="text-lg font-bold tracking-widest">AEROS</div>
          <div className="text-sm text-gray-500">Printer jobs</div>
        </div>
        {vendors.length === 0 ? (
          <p className="text-sm text-gray-600">No printer has been given access yet. Ask Aeros for a password.</p>
        ) : (
          <>
            <label className="block text-sm">
              <span className="text-gray-600">Your company</span>
              <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Password</span>
              <input type="password" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button disabled={busy} className="w-full rounded-lg bg-black px-4 py-2.5 text-base font-medium text-white disabled:opacity-50">
              {busy ? "Logging in…" : "Open my jobs"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}

function Jobs({ vendorName, pending: initialPending, recent }) {
  const [pending, setPending] = useState(initialPending);
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");

  const UNDO_MS = 30 * 60 * 1000;
  const canUndo = (j) => j.vendorStatus && j.vendorStatusUpdatedAt && Date.now() - new Date(j.vendorStatusUpdatedAt).getTime() <= UNDO_MS;

  async function mark(job, status, { undo = false } = {}) {
    const ask = status === "dispatched" ? `Mark J# ${job.jNumber} as SENT TO AEROS? Only tap this when the stock has actually left.`
      : status === "printing_completed" ? `Mark J# ${job.jNumber} as PRINTED?` : null;
    if (!undo && ask && !window.confirm(ask)) return;
    setBusyId(job.id); setErr("");
    const body = { status, undo };
    if (status === "dispatched") body.dispatchDate = today();
    const res = await fetch(`/api/factoryos/jobs/${job.id}/vendor-status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setBusyId("");
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not update"); return; }
    const data = await res.json();
    const vs = data.job?.vendorStatus || status;
    const at = data.job?.vendorStatusUpdatedAt || new Date().toISOString();
    setPending((list) => list.map((j) => (j.id === job.id ? { ...j, vendorStatus: vs, vendorStatusUpdatedAt: at } : j)));
  }

  async function logout() {
    await fetch("/api/printer/logout", { method: "POST" });
    window.location.reload();
  }

  const t = today();
  const Row = ({ j, done }) => {
    const late = !done && j.printingDueDate && j.printingDueDate.slice(0, 10) < t && !["printing_completed", "dispatched"].includes(j.vendorStatus || "");
    const printed = ["printing_completed", "dispatched"].includes(j.vendorStatus || "");
    const sent = j.vendorStatus === "dispatched";
    const undoTo = j.vendorStatus === "dispatched" ? "printing_completed" : j.vendorStatus === "printing_completed" ? "accepted" : null;
    return (
      <tr className={late ? "bg-red-50" : ""}>
        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{j.jNumber}</td>
        <td className="px-3 py-2">
          <div className="font-medium">{j.item}</div>
          <div className="text-xs text-gray-500">{[j.brand, j.printingType].filter(Boolean).join(" · ")}</div>
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">{j.qty != null ? j.qty.toLocaleString("en-IN") : "—"}</td>
        <td className={`px-3 py-2 whitespace-nowrap ${late ? "text-red-700 font-semibold" : ""}`}>{fmt(j.printingDueDate)}{late && " · late"}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          {j.jobOrderRev ? (
            <a href={`/print/job-order/${j.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Job order (rev {j.jobOrderRev})</a>
          ) : <span className="text-gray-400">—</span>}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-right">
          {done ? (
            <span className="text-xs text-gray-500">{sent ? "Sent to Aeros" : j.stage}</span>
          ) : sent ? (
            <span className="text-xs text-gray-600">✓ Sent to Aeros</span>
          ) : printed ? (
            <button disabled={busyId === j.id} onClick={() => mark(j, "dispatched")} className="rounded-lg bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">Sent to Aeros</button>
          ) : (
            <button disabled={busyId === j.id} onClick={() => mark(j, "printing_completed")} className="rounded-lg border border-black px-3 py-1.5 text-sm disabled:opacity-50">Printed</button>
          )}
          {!done && undoTo && canUndo(j) && (
            <button disabled={busyId === j.id} onClick={() => mark(j, undoTo, { undo: true })} className="ml-2 text-xs text-gray-500 underline" title="You can undo your last tap for 30 minutes">Undo</button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <div className="text-xs tracking-widest text-gray-500">AEROS · PRINTER JOBS</div>
            <h1 className="text-2xl font-bold">{vendorName}</h1>
          </div>
          <button onClick={logout} className="text-sm text-gray-500 underline">Log out</button>
        </div>
        {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold">With you now · {pending.length}</h2>
            <span className="text-xs text-gray-500">Tap <b>Printed</b> when done, then <b>Sent to Aeros</b> when it leaves. Mis-tap? <b>Undo</b> works for 30 minutes.</span>
          </div>
          {pending.length === 0 ? (
            <p className="px-4 py-8 text-center text-gray-500">Nothing pending. 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="text-left px-3 py-2">J#</th><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Qty</th><th className="text-left px-3 py-2">Due</th><th className="text-left px-3 py-2">Spec</th><th /></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">{pending.map((j) => <Row key={j.id} j={j} />)}</tbody>
              </table>
            </div>
          )}
        </section>

        {recent.length > 0 && (
          <section className="mt-6 bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100"><h2 className="font-semibold text-gray-700">Recently completed</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-600">
                <tbody className="divide-y divide-gray-100">{recent.map((j) => <Row key={j.id} j={j} done />)}</tbody>
              </table>
            </div>
          </section>
        )}
        <p className="mt-6 text-xs text-gray-400">Questions about a job? Call Aeros. This page only shows jobs assigned to {vendorName}.</p>
      </div>
    </main>
  );
}
