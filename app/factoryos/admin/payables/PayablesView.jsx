"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/app/factoryos/_components/ui";

const STATUSES = ["submitted", "approved", "paid", "rejected"];
const STATUS_STYLE = {
  submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export default function PayablesView({ initialInvoices }) {
  const [invoices, setInvoices] = useState(initialInvoices || []);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (filter && inv.status !== filter) return false;
      if (!term) return true;
      return `${inv.jNumber} ${inv.vendorName} ${inv.invoiceNo} ${inv.jobItem}`.toLowerCase().includes(term);
    });
  }, [invoices, filter, q]);

  const totals = useMemo(() => {
    const t = { count: filtered.length, amount: 0, outstanding: 0 };
    for (const inv of filtered) {
      const a = inv.amount || 0;
      t.amount += a;
      if (inv.status !== "paid" && inv.status !== "rejected") t.outstanding += a;
    }
    return t;
  }, [filtered]);

  async function setStatus(id, status) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/factoryos/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setInvoices((list) => list.map((i) => (i.id === id ? { ...i, status } : i)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Vendor payables</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Invoices submitted by vendors against jobs.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 dark:text-gray-400">Outstanding (filtered)</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white">₹{totals.outstanding.toLocaleString("en-IN")}</div>
          <div className="text-xs text-gray-400">{totals.count} invoices · ₹{totals.amount.toLocaleString("en-IN")} total</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100"
          placeholder="Search by J#, vendor, invoice no…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 text-xs dark:bg-gray-900 dark:border-gray-800">
          {["", ...STATUSES].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md font-medium capitalize ${
                filter === s ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {s || "all"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No invoices.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left p-3 font-medium">Job</th>
                  <th className="text-left p-3 font-medium">Vendor</th>
                  <th className="text-left p-3 font-medium">Invoice</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-50 dark:border-gray-800">
                    <td className="p-3">
                      <Link href={`/factoryos/admin/jobs/${inv.jobId}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        {inv.jNumber || "—"}
                      </Link>
                      <div className="text-[11px] text-gray-400 truncate max-w-[160px]">{inv.jobItem}</div>
                    </td>
                    <td className="p-3 text-gray-900 dark:text-gray-100">{inv.vendorName || "—"}</td>
                    <td className="p-3">
                      <div className="text-gray-900 dark:text-gray-100">{inv.invoiceNo || "—"}</div>
                      {inv.fileUrl && (
                        <a href={inv.fileUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline dark:text-blue-400">
                          view file
                        </a>
                      )}
                    </td>
                    <td className="p-3 text-right text-gray-900 dark:text-gray-100">
                      {inv.amount != null ? `₹${inv.amount.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="p-3 text-gray-600 dark:text-gray-300">{inv.invoiceDate ? formatDate(inv.invoiceDate) : "—"}</td>
                    <td className="p-3">
                      <select
                        value={inv.status}
                        disabled={busyId === inv.id}
                        onChange={(e) => setStatus(inv.id, e.target.value)}
                        className={`text-[11px] font-semibold rounded px-2 py-1 border-0 capitalize ${STATUS_STYLE[inv.status] || ""}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
