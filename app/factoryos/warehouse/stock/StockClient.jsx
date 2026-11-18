"use client";
import { useMemo, useState } from "react";
import { PageHead, Card, Empty, Notice, Pill, Segmented, Btn, inputCls, num, fmtDate } from "../_components/ui";

const SOURCE_LABEL = { FG: "Made by us", RM: "Raw material", Traded: "Traded", Clearance: "Clearance", Other: "Other" };

function downloadCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Code", "Item", "Category", "Sub-category", "Customer", "Type", "On hand", "Unit", "Racks"].map(esc).join(",")];
  for (const r of rows) lines.push([r.sku, r.name, r.category, r.subCategory, r.customer, SOURCE_LABEL[r.source] || r.source, r.qty, r.uom, r.racks.map((x) => `${x.code}: ${x.qty}`).join("; ")].map(esc).join(","));
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = `warehouse-stock-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function StockClient({ stock, error, notInListing }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState("in");
  const [source, setSource] = useState("");
  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const sources = useMemo(() => [...new Set(stock.map((r) => r.source).filter(Boolean))], [stock]);
  const inView = (r) => (show === "in" ? r.qty > 0 : show === "neg" ? r.qty < 0 || r.racks.some((x) => x.qty < 0) : true);
  // Category chips from the product master (Aeros Listing), for the current
  // view, biggest first; "Not in the listing" always last.
  const tally = (list, f) => { const m = new Map(); for (const r of list) { const k = f(r); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
  const base = useMemo(() => stock.filter((r) => inView(r) && (!source || r.source === source)), [stock, show, source]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => [...tally(base, (r) => r.category).entries()]
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => (a.key === notInListing) - (b.key === notInListing) || b.count - a.count || a.label.localeCompare(b.label)), [base, notInListing]);
  const activeCat = cats.some((c) => c.key === cat) ? cat : "";
  const subs = useMemo(() => (activeCat ? [...tally(base.filter((r) => r.category === activeCat), (r) => r.subCategory).entries()] : [])
    .map(([label, count]) => ({ key: label, label, count })).sort((a, b) => b.count - a.count), [base, activeCat]);
  const activeSub = subs.some((c) => c.key === sub) ? sub : "";
  const rows = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return stock
      .filter(inView)
      .filter((r) => !source || r.source === source)
      .filter((r) => !activeCat || r.category === activeCat)
      .filter((r) => !activeSub || r.subCategory === activeSub)
      .filter((r) => { const t = `${r.sku} ${r.name} ${r.customer} ${r.category} ${r.racks.map((x) => x.code).join(" ")}`.toLowerCase(); return words.every((w) => t.includes(w)); })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stock, q, show, source, activeCat, activeSub]); // eslint-disable-line react-hooks/exhaustive-deps
  const inStock = stock.filter((r) => r.qty > 0).length;
  const negative = stock.filter((r) => r.qty < 0 || r.racks.some((x) => x.qty < 0)).length;
  return (
    <div>
      <PageHead title="Stock" sub={`${num(inStock)} items on the racks${negative ? ` · ${negative} below zero, needs a count` : ""}`}
        right={<Btn tone="ghost" onClick={() => downloadCsv(rows)}>Download</Btn>} />
      {error && <Notice>Could not read stock: {error}</Notice>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className={`${inputCls} max-w-sm`} placeholder="Search item, code, customer or rack…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Segmented value={show} onChange={setShow} options={[{ value: "in", label: "In stock" }, { value: "all", label: "All items" }, ...(negative ? [{ value: "neg", label: "Below zero" }] : [])]} />
        {sources.length > 1 && (
          <select className={inputCls.replace("w-full", "w-auto")} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Type of goods">
            <option value="">All types</option>
            {sources.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s] || s}</option>)}
          </select>
        )}
      </div>
      {cats.length > 1 && (
        <Chips label="Category" value={activeCat} onChange={(v) => { setCat(v); setSub(""); }}
          options={[{ key: "", label: "All categories", count: base.length }, ...cats]} />
      )}
      {subs.length > 0 && (
        <Chips label="Sub-category" small value={activeSub} onChange={setSub}
          options={[{ key: "", label: `All ${activeCat}`, count: base.filter((r) => r.category === activeCat).length }, ...subs]} />
      )}
      {rows.length === 0 ? <Empty>No item matches.</Empty> : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5 text-right">On hand</th>
                  <th className="px-4 py-2.5">Where</th>
                  <th className="px-4 py-2.5">Last moved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.slice(0, 400).map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-2.5">
                      <div className="text-gray-900 dark:text-white">{r.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400"><span className="font-mono">{r.sku}</span>{` · ${r.subCategory ? `${r.category} › ${r.subCategory}` : r.category}`}{r.customer ? ` · ${r.customer}` : ""}{r.needsReview ? " · to review" : ""}</div>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums ${r.qty < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>{num(r.qty)} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{r.uom}</span></td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {r.racks.length ? r.racks.map((x) => <Pill key={x.code} tone={x.qty < 0 ? "late" : "neutral"}>{x.code} · {num(x.qty)}</Pill>) : <span className="text-xs text-gray-400">none</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{fmtDate(r.lastMoved)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 400 && <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">Showing the first 400 of {num(rows.length)}. Search to narrow down, or download the full list.</p>}
        </Card>
      )}
    </div>
  );
}

function Chips({ label, value, onChange, options, small }) {
  return (
    <div className="-mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1.5 sm:flex-wrap" role="group" aria-label={label}>
        {options.map((c) => {
          const on = value === c.key;
          return (
            <button key={c.key || "all"} type="button" onClick={() => onChange(c.key)} aria-pressed={on}
              className={`shrink-0 rounded-full px-3 font-medium ${small ? "py-1 text-[11px]" : "py-1.5 text-xs"} ${on ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : small ? "border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}>
              {c.label} <span className={on ? "opacity-70" : "text-gray-500 dark:text-gray-400"}>{num(c.count)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
