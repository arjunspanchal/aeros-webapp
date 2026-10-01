"use client";
import { useState } from "react";

const today = () => new Date().toISOString().slice(0, 10);
function fmt(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function PrinterOnePager({ mode, vendors = [], vendorName = "", pending = [], recent = [], statuses = [] }) {
  if (mode === "login") return <Login vendors={vendors} />;
  return <Jobs vendorName={vendorName} pending={pending} recent={recent} statuses={statuses} />;
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

function Jobs({ vendorName, pending: initialPending, recent, statuses }) {
  const order = Object.fromEntries(statuses.map((x, i) => [x.value, i]));
  const [pending, setPending] = useState(initialPending);
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");

  const UNDO_MS = 30 * 60 * 1000;
  const canGoBack = (j) => j.vendorStatus && j.vendorStatusUpdatedAt && Date.now() - new Date(j.vendorStatusUpdatedAt).getTime() <= UNDO_MS;

  async function setStatus(job, status) {
    if (!status || status === (job.vendorStatus || "")) return;
    const backwards = (order[status] ?? -1) < (order[job.vendorStatus] ?? -1);
    if (backwards && !canGoBack(job)) { setErr("More than 30 minutes have passed — call Aeros to change this job."); return; }
    if (status === "dispatched" && !window.confirm(`Mark J# ${job.jNumber} as SENT TO AEROS? Only choose this when the stock has actually left.`)) return;
    setBusyId(job.id); setErr("");
    const body = { status, undo: backwards };
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
    const sent = j.vendorStatus === "dispatched";
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
          ) : (
            <select
              disabled={busyId === j.id}
              value={j.vendorStatus || ""}
              onChange={(e) => setStatus(j, e.target.value)}
              className={`rounded-lg border px-3 py-2 text-base sm:text-sm ${sent ? "border-green-600 bg-green-50 text-green-900" : j.vendorStatus === "paper_awaited" ? "border-amber-500 bg-amber-50 text-amber-900" : "border-gray-300 bg-white"} disabled:opacity-50`}
            >
              <option value="">— Update status —</option>
              {statuses.filter((x) => !x.legacy || j.vendorStatus === x.value).map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
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
            <span className="text-xs text-gray-500">Update the status as the job moves. Pick <b>Paper awaited</b> if you don\u2019t have our paper yet. Wrong pick? You can move it back for 30 minutes.</span>
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
