"use client";
import { useMemo, useState } from "react";

// Recency chip values map to a max-age in days. "" = no filter.
const RECENCY_OPTIONS = [
  { value: "",   label: "All time" },
  { value: "7",  label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function withinDays(iso, days) {
  if (!iso || !days) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= Number(days) * 86400000;
}

export default function RfqManager({ initialQuotes, clients, canUpload, currentEmail }) {
  const [quotes, setQuotes] = useState(initialQuotes || []);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState(""); // client id (internal only)
  const [recency, setRecency] = useState("");
  const [modalMode, setModalMode] = useState(null); // null | "upload" | "edit"
  const [editingQuote, setEditingQuote] = useState(null);
  const [busyDelete, setBusyDelete] = useState(null);

  const clientById = useMemo(
    () => Object.fromEntries((clients || []).map((c) => [c.id, c])),
    [clients],
  );

  // Counts run over the full dataset (not the search-filtered view) so the
  // KPI strip and recency chips always show total inventory, not "how many
  // match my current typing." Matches the Sample Dispatch queue pattern.
  const kpis = useMemo(() => {
    const k = { total: quotes.length, last7: 0, last30: 0, last90: 0 };
    for (const q of quotes) {
      if (withinDays(q.createdAt, 7))  k.last7++;
      if (withinDays(q.createdAt, 30)) k.last30++;
      if (withinDays(q.createdAt, 90)) k.last90++;
    }
    return k;
  }, [quotes]);

  const filtered = useMemo(() => {
    const sq = search.trim().toLowerCase();
    return quotes.filter((q) => {
      if (clientFilter) {
        if (q.clientId !== clientFilter && (q.clientEmail || "").toLowerCase() !==
            (clientById[clientFilter]?.contactEmail || "").toLowerCase()) {
          return false;
        }
      }
      if (recency && !withinDays(q.createdAt, recency)) return false;
      if (!sq) return true;
      return (
        (q.aerosRfqNumber || "").toLowerCase().includes(sq) ||
        (q.customerRfqNumber || "").toLowerCase().includes(sq) ||
        (q.brand || "").toLowerCase().includes(sq) ||
        (q.productName || "").toLowerCase().includes(sq) ||
        (q.filename || "").toLowerCase().includes(sq) ||
        (q.notes || "").toLowerCase().includes(sq)
      );
    });
  }, [quotes, search, clientFilter, recency, clientById]);

  async function onDelete(quote) {
    if (!confirm(`Delete RFQ ${quote.aerosRfqNumber} (${quote.filename})? This cannot be undone.`)) return;
    setBusyDelete(quote.id);
    const res = await fetch(`/api/rfq/${quote.id}`, { method: "DELETE" });
    setBusyDelete(null);
    if (!res.ok) {
      alert("Delete failed");
      return;
    }
    setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
  }

  function onUploaded(newQuote) {
    setQuotes((prev) => [newQuote, ...prev]);
    closeModal();
  }

  function onEdited(updatedQuote) {
    setQuotes((prev) => prev.map((q) => (q.id === updatedQuote.id ? updatedQuote : q)));
    closeModal();
  }

  function openUpload() {
    setEditingQuote(null);
    setModalMode("upload");
  }

  function openEdit(quote) {
    setEditingQuote(quote);
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setEditingQuote(null);
  }

  return (
    <div className="space-y-4">
      {/* KPI strip — totals over the full dataset, regardless of filters. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total" value={kpis.total} />
        <Kpi label="Last 7 days" value={kpis.last7} accent="emerald" />
        <Kpi label="Last 30 days" value={kpis.last30} accent="blue" />
        <Kpi label="Last 90 days" value={kpis.last90} accent="slate" />
      </div>

      {/* Recency chips — quick filter that composes with search + customer. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mr-1">Show:</span>
        {RECENCY_OPTIONS.map((o) => (
          <button
            key={o.value || "all"}
            type="button"
            onClick={() => setRecency(o.value)}
            className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition ${
              recency === o.value
                ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RFQ #, brand, product, filename…"
            className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔎</span>
        </div>
        {canUpload && (clients || []).length > 0 && (
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
          >
            <option value="">All customers</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {canUpload && (
          <button
            type="button"
            onClick={openUpload}
            className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
          >
            + Upload RFQ
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="text-left px-3 sm:px-4 py-2 font-medium whitespace-nowrap">Aeros RFQ #</th>
                <th className="text-left px-3 sm:px-4 py-2 font-medium whitespace-nowrap">Customer RFQ #</th>
                <th className="text-left px-3 sm:px-4 py-2 font-medium">Brand</th>
                <th className="text-left px-3 sm:px-4 py-2 font-medium">Product</th>
                {canUpload && <th className="text-left px-3 sm:px-4 py-2 font-medium">Customer</th>}
                <th className="text-left px-3 sm:px-4 py-2 font-medium">File</th>
                <th className="text-left px-3 sm:px-4 py-2 font-medium whitespace-nowrap">Uploaded</th>
                <th className="text-right px-3 sm:px-4 py-2 font-medium whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
                  <td className="px-3 sm:px-4 py-2.5 font-mono text-xs text-gray-900 dark:text-white">
                    {q.aerosRfqNumber || "—"}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-300">
                    {q.customerRfqNumber || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-sm text-gray-800 dark:text-gray-100">
                    {q.brand || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-gray-800 dark:text-gray-100">
                    {q.productName || <span className="text-gray-400">—</span>}
                  </td>
                  {canUpload && (
                    <td className="px-3 sm:px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                      {clientById[q.clientId]?.name || q.clientEmail || <span className="text-gray-400">—</span>}
                    </td>
                  )}
                  <td className="px-3 sm:px-4 py-2.5">
                    <div className="text-xs text-gray-700 dark:text-gray-200 break-all">{q.filename}</div>
                    {q.bytes ? (
                      <div className="text-[11px] text-gray-400">{formatBytes(q.bytes)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-right whitespace-nowrap space-x-2">
                    {q.url ? (
                      <a
                        href={q.url}
                        target="_blank"
                        rel="noopener"
                        className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1 rounded"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                    {canUpload && (
                      <>
                        <button
                          onClick={() => openEdit(q)}
                          className="text-xs text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(q)}
                          disabled={busyDelete === q.id}
                          className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 disabled:opacity-50"
                        >
                          {busyDelete === q.id ? "…" : "Delete"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canUpload ? 8 : 7} className="text-center text-sm text-gray-500 py-10 dark:text-gray-400">
                    {search || clientFilter
                      ? "No RFQs match those filters."
                      : canUpload
                        ? "No RFQs uploaded yet. Click + Upload RFQ to add one."
                        : "No quotes shared with you yet. Once Aeros uploads a quote it'll appear here."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode === "upload" && (
        <QuoteModal
          mode="upload"
          clients={clients || []}
          currentEmail={currentEmail}
          onClose={closeModal}
          onSaved={onUploaded}
        />
      )}
      {modalMode === "edit" && editingQuote && (
        <QuoteModal
          mode="edit"
          existing={editingQuote}
          clients={clients || []}
          currentEmail={currentEmail}
          onClose={closeModal}
          onSaved={onEdited}
        />
      )}
    </div>
  );
}

function formatBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function QuoteModal({ mode, existing, clients, onClose, onSaved }) {
  const isEdit = mode === "edit" && !!existing;
  // In edit mode, prefer the saved client_id when matching a row in the
  // current clients list; otherwise fall back to "" so the dropdown
  // shows the empty state and the user can re-pick.
  const initialClientId = isEdit
    ? (clients.some((c) => c.id === existing.clientId) ? existing.clientId : "")
    : "";

  const [aerosRfq, setAerosRfq] = useState(isEdit ? (existing.aerosRfqNumber || "") : "");
  const [customerRfq, setCustomerRfq] = useState(isEdit ? (existing.customerRfqNumber || "") : "");
  const [clientId, setClientId] = useState(initialClientId);
  const [brand, setBrand] = useState(isEdit ? (existing.brand || "") : "");
  const [productName, setProductName] = useState(isEdit ? (existing.productName || "") : "");
  const [notes, setNotes] = useState(isEdit ? (existing.notes || "") : "");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!aerosRfq.trim()) { setErr("Aeros RFQ number is required"); return; }
    if (!brand.trim()) { setErr("Brand is required"); return; }
    if (!clientId) { setErr("Pick a customer"); return; }
    // File only required on upload — edit-mode keeps the existing PDF.
    if (!isEdit) {
      if (!file) { setErr("Pick a PDF to upload"); return; }
      if (file.size > 10 * 1024 * 1024) { setErr("File exceeds 10 MB"); return; }
      if (!file.type.toLowerCase().includes("pdf")) { setErr("Only PDFs are supported"); return; }
    }

    setBusy(true);
    try {
      const payload = {
        aerosRfqNumber: aerosRfq.trim(),
        customerRfqNumber: customerRfq.trim() || null,
        clientId,
        clientEmail: selectedClient?.contactEmail || null,
        brand: brand.trim(),
        productName: productName.trim() || null,
        notes: notes.trim() || null,
      };
      let res;
      if (isEdit) {
        res = await fetch(`/api/rfq/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        const fileBase64 = await fileToBase64(file);
        res = await fetch("/api/rfq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            filename: file.name,
            contentType: file.type || "application/pdf",
            fileBase64,
          }),
        });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || (isEdit ? "Update failed" : "Upload failed"));
      }
      const { quote } = await res.json();
      onSaved(quote);
    } catch (e2) {
      setErr(e2?.message || (isEdit ? "Update failed" : "Upload failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full sm:max-w-xl bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isEdit ? "Edit RFQ quote" : "Upload RFQ quote"}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isEdit
                  ? "Update the metadata for this quote. Replacing the PDF means delete + re-upload."
                  : "PDF up to 10 MB. The customer sees this in their RFQ Manager."}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1 -mr-1">✕</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Aeros RFQ # <span className="text-red-500">*</span></label>
              <input
                value={aerosRfq}
                onChange={(e) => setAerosRfq(e.target.value)}
                placeholder="e.g. AER-RFQ-00123"
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Customer RFQ #</label>
              <input
                value={customerRfq}
                onChange={(e) => setCustomerRfq(e.target.value)}
                placeholder="Their internal reference"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Customer <span className="text-red-500">*</span></label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
            >
              <option value="">Pick a customer…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.contactEmail ? ` · ${c.contactEmail}` : ""}
                </option>
              ))}
            </select>
            {selectedClient && !selectedClient.contactEmail && (
              <p className="text-[11px] text-amber-600 mt-1">No contact email on this customer. Add one or the customer won't see the RFQ until linked.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Brand <span className="text-red-500">*</span></label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. PAX"
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Product / Item</label>
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. 12oz double-wall cup"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              />
            </div>
          </div>

          {isEdit ? (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium text-gray-700 dark:text-gray-200">PDF:</span>{" "}
              <span className="font-mono break-all">{existing.filename}</span>
              {existing.bytes ? <span className="text-gray-400 ml-2">· {formatBytes(existing.bytes)}</span> : null}
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                File can&apos;t be replaced here — delete and re-upload to swap.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">PDF <span className="text-red-500">*</span></label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
                className="w-full text-sm text-gray-700 dark:text-gray-200 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-300"
              />
              {file && <p className="text-[11px] text-gray-400 mt-1">{file.name} · {formatBytes(file.size)}</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional internal notes"
              rows={2}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
            />
          </div>

          {err && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 text-xs sm:text-sm text-red-700 dark:text-red-300 font-medium">
              ⚠️ {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
            >
              {busy ? (isEdit ? "Saving…" : "Uploading…") : (isEdit ? "Save changes" : "Upload")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = reader.result;
      // strip the "data:...;base64," prefix
      const base64 = String(str).split(",", 2)[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const KPI_ACCENTS = {
  default: "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900",
  emerald: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-900/10",
  blue:    "border-blue-200 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-900/10",
  slate:   "border-slate-200 bg-slate-50/60 dark:border-slate-800/60 dark:bg-slate-900/40",
};

function Kpi({ label, value, accent = "default" }) {
  const tone = KPI_ACCENTS[accent] || KPI_ACCENTS.default;
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
        {Number(value || 0).toLocaleString("en-IN")}
      </div>
    </div>
  );
}
