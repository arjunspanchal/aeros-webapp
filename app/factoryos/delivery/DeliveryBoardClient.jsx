"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/app/factoryos/_components/ui";

const STATUS_OPTIONS = [
  { value: "unscheduled", label: "Unscheduled" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "dispatched", label: "Dispatched" },
  { value: "cancelled", label: "Cancelled" },
];

const num = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : "—");
const inr = (n) => (typeof n === "number" ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—");

const STATUS_STYLES = {
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  dispatched: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  unscheduled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

function AgeingCard({ b }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{b.label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{b.lines} lines</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{num(b.balanceQty)} units · {inr(b.openValue)}</div>
    </div>
  );
}

export default function DeliveryBoardClient({ lines, ageing, matrix }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(null); // jobId
  const [clientFilter, setClientFilter] = useState("all");

  const clientNames = useMemo(
    () => Array.from(new Set(lines.map((l) => l.clientName).filter(Boolean))).sort(),
    [lines],
  );

  const visible = useMemo(() => {
    const filtered = clientFilter === "all" ? lines : lines.filter((l) => l.clientName === clientFilter);
    // Open first (by ageing desc), then cancelled/done.
    return [...filtered].sort((a, b) => {
      const ao = a.balance > 0 && a.deliveryStatus !== "cancelled" ? 0 : 1;
      const bo = b.balance > 0 && b.deliveryStatus !== "cancelled" ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (b.daysPending || 0) - (a.daysPending || 0);
    });
  }, [lines, clientFilter]);

  async function call(url, method, body) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed");
      router.refresh();
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const addSchedule = (jobId, dispatchDate, qty) =>
    call("/api/factoryos/delivery/schedule", "POST", { jobId, dispatchDate, qty });
  const delSchedule = (id, jobId) =>
    call(`/api/factoryos/delivery/schedule?id=${id}&jobId=${jobId}`, "DELETE");
  const saveLine = (jobId, patch) => call(`/api/factoryos/jobs/${jobId}`, "PATCH", patch);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Delivery Plan</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Open PO lines, ageing, and committed dispatch dates. {visible.filter((l) => l.balance > 0 && l.deliveryStatus !== "cancelled").length} open.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            <option value="all">All customers</option>
            {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <Link href="/factoryos/delivery/import" className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            Import open POs
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ageing.map((b) => <AgeingCard key={b.key} b={b} />)}
      </div>

      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

      {/* Lines */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-left text-xs text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2">PO # / SKU</th>
                <th className="px-3 py-2">PO date</th>
                <th className="px-3 py-2 text-right">Days</th>
                <th className="px-3 py-2 text-right">Ordered</th>
                <th className="px-3 py-2 text-right">Recv</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Committed dispatch</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400 text-sm">No PO lines. Use “Import open POs”.</td></tr>
              )}
              {visible.map((l) => {
                const cancelled = l.deliveryStatus === "cancelled";
                const scheduledQty = l.scheduledQty || 0;
                const overScheduled = scheduledQty > l.balance;
                return (
                  <RowGroup
                    key={l.jobId}
                    line={l}
                    cancelled={cancelled}
                    overScheduled={overScheduled}
                    expanded={expanded === l.jobId}
                    onToggle={() => setExpanded(expanded === l.jobId ? null : l.jobId)}
                    busy={busy}
                    onAdd={addSchedule}
                    onDel={delSchedule}
                    onSave={saveLine}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SKU x date matrix */}
      {matrix.rows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 dark:bg-gray-900 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Daily dispatch schedule — committed qty by SKU</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="text-left text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-2 py-1">SKU</th>
                  {matrix.dates.map((d) => <th key={d} className="px-2 py-1 text-right">{formatDate(d)}</th>)}
                  <th className="px-2 py-1 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => (
                  <tr key={r.sku} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-2 py-1 font-medium text-gray-800 dark:text-gray-200">{r.sku}</td>
                    {matrix.dates.map((d) => <td key={d} className="px-2 py-1 text-right">{r.byDate[d] ? num(r.byDate[d]) : ""}</td>)}
                    <td className="px-2 py-1 text-right font-semibold">{num(r.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200 dark:border-gray-700 font-semibold">
                  <td className="px-2 py-1">Daily total</td>
                  {matrix.dates.map((d) => <td key={d} className="px-2 py-1 text-right">{num(matrix.dailyTotals[d])}</td>)}
                  <td className="px-2 py-1 text-right">{num(matrix.grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RowGroup({ line: l, cancelled, overScheduled, expanded, onToggle, busy, onAdd, onDel, onSave }) {
  const [newDate, setNewDate] = useState("");
  const [newQty, setNewQty] = useState("");
  const [received, setReceived] = useState(String(l.received ?? 0));
  const [status, setStatus] = useState(l.deliveryStatus || "unscheduled");
  const [remarks, setRemarks] = useState(l.deliveryRemarks || "");

  async function add() {
    if (!newDate || !newQty) return;
    const ok = await onAdd(l.jobId, newDate, Number(newQty));
    if (ok) { setNewDate(""); setNewQty(""); }
  }

  return (
    <>
      <tr className={`border-t border-gray-100 dark:border-gray-800 ${cancelled ? "opacity-60" : ""}`}>
        <td className="px-3 py-2">
          <div className={`font-medium text-gray-900 dark:text-white ${cancelled ? "line-through" : ""}`}>{l.poNumber || "—"}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{l.sku} · J#{l.jNumber}{l.clientName ? ` · ${l.clientName}` : ""}</div>
        </td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{l.poDate ? formatDate(l.poDate) : "—"}</td>
        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{l.daysPending ?? "—"}</td>
        <td className="px-3 py-2 text-right">{num(l.ordered)}</td>
        <td className="px-3 py-2 text-right">{num(l.received)}</td>
        <td className={`px-3 py-2 text-right font-semibold ${l.balance > 0 ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>{num(l.balance)}</td>
        <td className="px-3 py-2">
          {(l.schedule || []).length === 0 ? (
            <span className="text-xs text-gray-400">none</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {l.schedule.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1 text-[11px] bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5">
                  {formatDate(s.dispatchDate)} · {num(s.qty)}
                </span>
              ))}
            </div>
          )}
          {overScheduled && <div className="text-[11px] text-red-500 mt-0.5">scheduled &gt; balance</div>}
        </td>
        <td className="px-3 py-2">
          <span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_STYLES[l.deliveryStatus] || STATUS_STYLES.unscheduled}`}>
            {(STATUS_OPTIONS.find((o) => o.value === l.deliveryStatus)?.label) || "Unscheduled"}
          </span>
          {l.deliveryRemarks && <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 max-w-[14rem] truncate">{l.deliveryRemarks}</div>}
        </td>
        <td className="px-3 py-2 text-right">
          <button onClick={onToggle} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{expanded ? "Close" : "Edit"}</button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-800/40">
          <td colSpan={9} className="px-3 py-3">
            <div className="grid md:grid-cols-3 gap-4">
              {/* Schedule editor */}
              <div>
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Committed dispatch dates</div>
                <div className="space-y-1 mb-2">
                  {(l.schedule || []).map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1">
                      <span>{formatDate(s.dispatchDate)} · {num(s.qty)}</span>
                      <button onClick={() => onDel(s.id, l.jobId)} disabled={busy} className="text-red-500 hover:underline">remove</button>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-1">
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900" />
                  <input type="number" placeholder="qty" value={newQty} onChange={(e) => setNewQty(e.target.value)} className="w-20 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900" />
                  <button onClick={add} disabled={busy || !newDate || !newQty} className="px-2 py-1 rounded bg-blue-600 text-white text-xs disabled:opacity-50">Add</button>
                </div>
                <div className="text-[11px] text-gray-400 mt-1">Balance {num(l.balance)} · scheduled {num(l.scheduledQty)}</div>
              </div>

              {/* Received / status / remarks */}
              <div>
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Received (GRN)</div>
                <input type="number" value={received} onChange={(e) => setReceived(e.target.value)} className="w-28 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900" />
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mt-2 mb-1">Status</div>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900">
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Remarks (shown to customer)</div>
                <textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900" placeholder="e.g. Split delivery / 94% delivered / re-quote note" />
                <button
                  onClick={() => onSave(l.jobId, { receivedQty: Number(received), deliveryStatus: status, deliveryRemarks: remarks })}
                  disabled={busy}
                  className="mt-2 px-3 py-1.5 rounded bg-gray-900 text-white text-xs font-medium hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900"
                >
                  Save line
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
