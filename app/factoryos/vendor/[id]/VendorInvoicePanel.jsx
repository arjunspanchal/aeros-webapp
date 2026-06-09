"use client";
import { useEffect, useState } from "react";
import { formatDate } from "@/app/factoryos/_components/ui";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const STATUS_STYLE = {
  submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

const inp =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function VendorInvoicePanel({ jobId }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [amount, setAmount] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const res = await fetch(`/api/factoryos/jobs/${jobId}/invoices`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.invoices) setInvoices(data.invoices);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function submit() {
    setErr("");
    if (!invoiceNo.trim() && !file) {
      setErr("Add an invoice number or a file.");
      return;
    }
    setBusy(true);
    try {
      const payload = { invoiceNo: invoiceNo.trim(), amount, invoiceDate };
      if (file) {
        payload.filename = file.name;
        payload.contentType = file.type;
        payload.fileBase64 = await fileToBase64(file);
      }
      const res = await fetch(`/api/factoryos/jobs/${jobId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Submit failed");
      if (data.invoices) setInvoices(data.invoices);
      setInvoiceNo(""); setAmount(""); setInvoiceDate(""); setFile(null); setOpen(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Invoices</h2>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black dark:bg-white dark:text-gray-900"
        >
          {open ? "Close" : "Submit invoice"}
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Invoice no.</label>
            <input className={inp} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Amount (₹)</label>
            <input type="number" step="0.01" className={inp} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Invoice date</label>
            <input type="date" className={inp} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">File (PDF/JPG/PNG)</label>
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs mt-1.5" />
          </div>
          <div className="col-span-2 flex items-center gap-2 pt-1">
            <button onClick={submit} disabled={busy} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Submitting…" : "Submit"}
            </button>
            {err && <span className="text-xs text-red-600 dark:text-red-400">{err}</span>}
          </div>
        </div>
      )}

      <div className="mt-3">
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : invoices.length === 0 ? (
          <p className="text-xs text-gray-400">No invoices submitted yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {inv.invoiceNo || "(no number)"}
                    {inv.amount != null && <span className="text-gray-500 dark:text-gray-400"> · ₹{inv.amount.toLocaleString("en-IN")}</span>}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {inv.invoiceDate ? formatDate(inv.invoiceDate) : "—"}
                    {inv.fileUrl && (
                      <>
                        {" · "}
                        <a href={inv.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                          view file
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[inv.status] || ""}`}>
                  {inv.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
