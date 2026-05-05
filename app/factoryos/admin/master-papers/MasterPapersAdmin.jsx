"use client";
import { useMemo, useState } from "react";
import { inputCls, labelCls } from "@/app/factoryos/_components/ui";

// Per-row editor. Base Rate and Discount are editable; Effective = Base − Discount
// is computed client-side so the user sees the impact of their edit immediately,
// then we PATCH Airtable on save.
function RateRow({ paper, onSaved }) {
  const [base, setBase] = useState(paper.baseRate != null ? String(paper.baseRate) : "");
  const [discount, setDiscount] = useState(paper.discount != null ? String(paper.discount) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const baseN = base === "" ? null : Number(base);
  const discountN = discount === "" ? null : Number(discount);
  const effective = baseN != null && Number.isFinite(baseN) ? baseN - (Number.isFinite(discountN) ? discountN : 0) : null;

  const dirty =
    (String(paper.baseRate ?? "") !== base) ||
    (String(paper.discount ?? "") !== discount);

  async function save() {
    if (!dirty) return;
    if (base !== "" && !Number.isFinite(Number(base))) { setErr("Base must be a number"); return; }
    if (discount !== "" && !Number.isFinite(Number(discount))) { setErr("Discount must be a number"); return; }
    setErr(""); setBusy(true); setOk(false);
    const res = await fetch(`/api/factoryos/master-papers/${paper.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRate: base === "" ? null : Number(base),
        discount: discount === "" ? null : Number(discount),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      let detail = "Failed";
      try { detail = (await res.json()).error || detail; } catch {}
      setErr(detail);
      return;
    }
    const data = await res.json();
    onSaved(data.masterPaper);
    setOk(true);
    setTimeout(() => setOk(false), 1800);
  }

  function reset() {
    setBase(paper.baseRate != null ? String(paper.baseRate) : "");
    setDiscount(paper.discount != null ? String(paper.discount) : "");
    setErr("");
  }

  return (
    <tr className={dirty ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}>
      <td className="px-4 py-2">
        <div className="text-gray-900 dark:text-white">{paper.materialName}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {paper.type || "—"}
          {paper.gsm != null ? ` · ${paper.gsm} GSM` : ""}
          {paper.bf != null ? ` · ${paper.bf} BF` : ""}
          {paper.form ? ` · ${paper.form}` : ""}
        </div>
      </td>
      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{paper.supplier || "—"}</td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.01"
          className={`${inputCls} w-24 text-right tabular-nums`}
          value={base}
          onChange={(e) => setBase(e.target.value)}
          placeholder="—"
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") reset(); }}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.01"
          className={`${inputCls} w-24 text-right tabular-nums`}
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          placeholder="—"
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") reset(); }}
        />
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {effective != null && Number.isFinite(effective) ? (
          <span className="font-medium text-gray-900 dark:text-white">₹{effective.toFixed(2)}</span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        )}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {dirty && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-500 hover:underline dark:text-gray-400 mr-3"
            disabled={busy}
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : ok ? "Saved" : "Save"}
        </button>
        {err && <div className="text-xs text-red-500 mt-1">{err}</div>}
      </td>
    </tr>
  );
}

export default function MasterPapersAdmin({ initialPapers }) {
  const [papers, setPapers] = useState(initialPapers);
  const [query, setQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  // Pending = rows with no base rate yet. Useful "what's left to enter" filter.
  const [pendingOnly, setPendingOnly] = useState(false);

  // Replace a single row after a successful save, keep sort stable.
  function onSaved(updated) {
    setPapers((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  }

  const suppliers = useMemo(() => {
    const s = new Set();
    for (const p of papers) if (p.supplier) s.add(p.supplier);
    return Array.from(s).sort();
  }, [papers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return papers.filter((p) => {
      if (pendingOnly && p.baseRate != null) return false;
      if (supplierFilter !== "all" && p.supplier !== supplierFilter) return false;
      if (!q) return true;
      return `${p.materialName} ${p.supplier} ${p.type} ${p.gsm ?? ""} ${p.bf ?? ""}`.toLowerCase().includes(q);
    });
  }, [papers, query, supplierFilter, pendingOnly]);

  // Summary — counts of rows missing a rate, useful as a "to-do" nudge.
  const missing = useMemo(() => papers.filter((p) => p.baseRate == null).length, [papers]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className={`${inputCls} flex-1`}
          placeholder={`Search ${papers.length} master papers…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className={`${inputCls} sm:w-56`} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
          <option value="all">All suppliers</option>
          {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* Quick toggle for the most common drill-down: rows that still need a rate. */}
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Pending only
        </label>
      </div>

      {missing > 0 && !pendingOnly && (
        <button
          type="button"
          onClick={() => setPendingOnly(true)}
          className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-900 dark:text-amber-200 dark:hover:bg-amber-900/30"
        >
          {missing} row{missing === 1 ? "" : "s"} still without a base rate. <span className="underline">Show only these →</span>
        </button>
      )}
      {pendingOnly && (
        <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-900 dark:text-amber-200">
          <span>Showing only rows without a base rate ({filtered.length}).</span>
          <button
            type="button"
            onClick={() => setPendingOnly(false)}
            className="font-medium underline hover:no-underline"
          >
            Clear filter
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Material / Spec</th>
                <th className="text-left px-4 py-2 font-medium">Supplier</th>
                <th className="text-right px-4 py-2 font-medium">Base ₹/kg</th>
                <th className="text-right px-4 py-2 font-medium">Discount ₹/kg</th>
                <th className="text-right px-4 py-2 font-medium">Effective</th>
                <th className="text-right px-4 py-2 font-medium">&nbsp;</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((p) => <RateRow key={p.id} paper={p} onSaved={onSaved} />)}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">No matches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Tip — press Enter to save a row, Esc to revert. Only Base Rate and Discount are editable here; for other fields use Airtable.
      </p>
    </div>
  );
}
