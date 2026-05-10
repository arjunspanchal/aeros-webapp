"use client";

import Link from "next/link";
import { useState } from "react";

const STATUS_BADGE = {
  pending:    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40",
  dispatched: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700/40",
  cancelled:  "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
};

function fmtINR(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function DetailClient({ initial }) {
  const [d, setD] = useState(initial);
  const [courier, setCourier] = useState(d.courier || "");
  const [awb, setAwb] = useState(d.awb || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function patch(body) {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/warehouse/sample-dispatches/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed");
      setD(data.dispatch);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function markDispatched() { patch({ status: "dispatched", courier, awb }); }
  function markPending()    { patch({ status: "pending", courier: "", awb: "" }); }
  function cancel()         { if (confirm("Cancel this dispatch?")) patch({ status: "cancelled" }); }
  function saveCourier()    { patch({ courier, awb }); }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/warehouse/sample-dispatch" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">← Back to queue</Link>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{d.dispatch_no}</h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${STATUS_BADGE[d.status]}`}>{d.status}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {fmtDate(d.dispatch_date)} · Managed by {d.managed_by || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/warehouse/sample-dispatch/${d.id}/print`}
            target="_blank"
            rel="noopener"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Print / Save PDF
          </a>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Customer</h2>
          <p className="text-base font-medium text-gray-900 dark:text-gray-100">{d.customer_name}</p>
          {d.customer_contact && <p className="text-sm text-gray-600 dark:text-gray-300">{d.customer_contact}</p>}
          {d.customer_gstin && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">GSTIN: {d.customer_gstin}</p>}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 grid grid-cols-2 gap-4">
          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Billing</h3>
            <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">{d.customer_billing_address || "—"}</p>
          </div>
          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Delivery</h3>
            <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">{d.customer_delivery_address || "—"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">Items</div>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900/60">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-4 py-2">Sr.</th>
              <th className="px-4 py-2">Order ID</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-right">Excl. GST</th>
              <th className="px-4 py-2 text-right">GST</th>
              <th className="px-4 py-2 text-right">Incl. GST</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {(d.items || []).map((ln) => (
              <tr key={ln.id}>
                <td className="px-4 py-2 text-gray-500">{ln.sr_no}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700 dark:text-gray-200">{ln.order_id}</td>
                <td className="px-4 py-2 text-gray-800 dark:text-gray-100">{ln.description}</td>
                <td className="px-4 py-2 text-right tabular-nums">{ln.quantity}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtINR(ln.price)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtINR(ln.total_excl_gst)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{ln.gst_pct}%</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtINR(ln.total_incl_gst)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-900/60">
            <tr>
              <td colSpan={5} />
              <td className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-500">Subtotal</td>
              <td />
              <td className="px-4 py-2 text-right tabular-nums">{fmtINR(d.total_excl_gst)}</td>
            </tr>
            <tr>
              <td colSpan={5} />
              <td className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-500">GST</td>
              <td />
              <td className="px-4 py-2 text-right tabular-nums">{fmtINR(d.total_gst)}</td>
            </tr>
            <tr>
              <td colSpan={5} />
              <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">Total</td>
              <td />
              <td className="px-4 py-2 text-right tabular-nums text-base font-semibold text-gray-900 dark:text-gray-100">{fmtINR(d.total_incl_gst)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Dispatch info</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Courier</label>
            <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="e.g. DTDC, Bluedart" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-400 focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">AWB / tracking</label>
            <input value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="Tracking number" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-400 focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100" />
          </div>
        </div>
        {d.status === "dispatched" && d.dispatched_at && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Marked dispatched on {fmtDateTime(d.dispatched_at)}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {d.status === "pending" && (
            <button disabled={busy} onClick={markDispatched} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
              {busy ? "Saving…" : "Mark dispatched"}
            </button>
          )}
          {d.status === "pending" && (
            <button disabled={busy} onClick={saveCourier} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
              Save courier / AWB
            </button>
          )}
          {d.status === "dispatched" && (
            <>
              <button disabled={busy} onClick={saveCourier} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                Update courier / AWB
              </button>
              <button disabled={busy} onClick={markPending} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100">
                Reopen as pending
              </button>
            </>
          )}
          {d.status !== "cancelled" && (
            <button disabled={busy} onClick={cancel} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-red-900/20">
              Cancel dispatch
            </button>
          )}
        </div>
      </section>

      {d.notes && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Notes</h2>
          <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">{d.notes}</p>
        </section>
      )}
    </div>
  );
}
