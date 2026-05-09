"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, inputCls, PillBtn } from "@/app/calculator/_components/ui";

// Detail field sets per product type. Each entry hides itself when the value
// is falsy and `skipIfEmpty` is set.
const fmtRupee = (v) => `₹${Number(v).toFixed(2)}`;
const fmtRupee4 = (v) => `₹${Number(v).toFixed(4)}`;
const fmtRupeeIN = (v) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (v) => v?.toLocaleString();

const DETAIL_FIELDS_BY_TYPE = {
  Bag: [
    { key: "quoteRef", label: "Quote ref" },
    { key: "date", label: "Date" },
    { key: "brand", label: "Brand", skipIfEmpty: true },
    { key: "item", label: "Item", skipIfEmpty: true },
    { key: "bagType", label: "Bag type" },
    { key: "plainPrinted", label: "Plain/Printed" },
    { key: "colours", label: "Colours", skipIfEmpty: true },
    { key: "coveragePct", label: "Coverage %", skipIfEmpty: true, suffix: "%" },
    { key: "dimensions", label: "Dimensions (W × G × H mm)", compute: (q) => `${q.width} × ${q.gusset} × ${q.height}` },
    { key: "paperType", label: "Paper type", skipIfEmpty: true },
    { key: "mill", label: "Mill", skipIfEmpty: true },
    { key: "gsm", label: "GSM" },
    { key: "bf", label: "BF", skipIfEmpty: true, suffix: " BF" },
    { key: "casePack", label: "Case pack" },
    { key: "orderQty", label: "Order qty", format: fmtNum },
    { key: "handleCost", label: "Handle cost / bag", skipIfEmpty: true, format: fmtRupee },
    { key: "wastagePct", label: "Wastage %", skipIfEmpty: true, suffix: "%" },
    { key: "profitPct", label: "Profit %", skipIfEmpty: true, suffix: "%" },
    { key: "paperRate", label: "Paper rate (₹/kg)", skipIfEmpty: true, format: fmtRupee },
    { key: "mfgCost", label: "Mfg cost / bag", skipIfEmpty: true, format: fmtRupee4 },
    { key: "sellingPrice", label: "Selling price / bag", highlight: true, format: fmtRupee4 },
    { key: "costPerCase", label: "Cost / case", format: fmtRupeeIN },
    { key: "orderTotal", label: "Order total", highlight: true, format: fmtRupeeIN },
  ],
  Box: [
    { key: "quoteRef", label: "Quote ref" },
    { key: "date", label: "Date" },
    { key: "boxType", label: "Box type" },
    { key: "plainPrinted", label: "Plain/Printed" },
    { key: "colours", label: "Colours", skipIfEmpty: true },
    { key: "coveragePct", label: "Coverage %", skipIfEmpty: true, suffix: "%" },
    { key: "openSize", label: "Open size (mm)", compute: (q) => q.openLength && q.openWidth ? `${q.openLength} × ${q.openWidth}` : "—" },
    { key: "paperName", label: "Paper", skipIfEmpty: true },
    { key: "gsm", label: "GSM" },
    { key: "qty", label: "Order qty", format: fmtNum },
    { key: "punching", label: "Punching", format: (v) => v ? "Yes" : "No" },
    { key: "wastagePct", label: "Wastage %", skipIfEmpty: true, suffix: "%" },
    { key: "profitPct", label: "Profit %", skipIfEmpty: true, suffix: "%" },
    { key: "paperRate", label: "Paper rate (₹/kg)", skipIfEmpty: true, format: fmtRupee },
    { key: "mfgCost", label: "Mfg cost / box", skipIfEmpty: true, format: fmtRupee4 },
    { key: "sellingPrice", label: "Selling price / box", highlight: true, format: fmtRupee4 },
    { key: "orderTotal", label: "Order total", highlight: true, format: fmtRupeeIN },
  ],
  Cup: [
    { key: "quoteRef", label: "Quote ref" },
    { key: "date", label: "Date" },
    { key: "wallType", label: "Wall type" },
    { key: "size", label: "Volume" },
    { key: "sku", label: "SKU", skipIfEmpty: true },
    { key: "innerGsm", label: "Inner GSM", suffix: " gsm" },
    { key: "outerGsm", label: "Outer GSM", skipIfEmpty: true, suffix: " gsm" },
    { key: "innerCoating", label: "Inner coating", skipIfEmpty: true },
    { key: "plainPrinted", label: "Plain/Printed" },
    { key: "colours", label: "Colours", skipIfEmpty: true },
    { key: "swRate", label: "Sidewall rate (₹/kg)", skipIfEmpty: true, format: fmtRupee },
    { key: "btRate", label: "Bottom rate (₹/kg)", skipIfEmpty: true, format: fmtRupee },
    { key: "ofRate", label: "Outer rate (₹/kg)", skipIfEmpty: true, format: fmtRupee },
    { key: "casePack", label: "Case pack" },
    { key: "orderQty", label: "Order qty", format: fmtNum },
    { key: "marginPct", label: "Margin %", skipIfEmpty: true, suffix: "%" },
    { key: "cupWeightG", label: "Cup weight", skipIfEmpty: true, suffix: " g" },
    { key: "mfgCost", label: "Mfg cost / cup", skipIfEmpty: true, format: fmtRupee4 },
    { key: "sellingPrice", label: "Selling price / cup", highlight: true, format: fmtRupee4 },
    { key: "costPerCase", label: "Cost / case", format: fmtRupeeIN },
    { key: "orderTotal", label: "Order total", highlight: true, format: fmtRupeeIN },
    { key: "oneTimeTotal", label: "One-time plate/die", skipIfEmpty: true, format: (v) => `₹${Number(v).toLocaleString("en-IN")}` },
  ],
  PP: [
    { key: "quoteRef", label: "Quote ref" },
    { key: "date", label: "Date" },
    { key: "itemName", label: "Item" },
    { key: "itemWeight", label: "Item weight", skipIfEmpty: true, suffix: " g" },
    { key: "cavities", label: "Cavities", skipIfEmpty: true },
    { key: "cycleTime", label: "Cycle time", skipIfEmpty: true, suffix: " s" },
    { key: "rmRate", label: "RM rate (₹/kg)", skipIfEmpty: true, format: fmtRupee },
    { key: "runnerWeightPerShot", label: "Runner / shot", skipIfEmpty: true, suffix: " g" },
    { key: "regrindCapturePercent", label: "Regrind capture", skipIfEmpty: true, suffix: "%" },
    { key: "machinePowerKw", label: "Machine power", skipIfEmpty: true, suffix: " kW" },
    { key: "moldCost", label: "Mold cost", skipIfEmpty: true, format: (v) => `₹${Number(v).toLocaleString("en-IN")}` },
    { key: "rejectPercent", label: "Reject %", skipIfEmpty: true, suffix: "%" },
    { key: "casePack", label: "Case pack" },
    { key: "profitPct", label: "Profit %", skipIfEmpty: true, suffix: "%" },
    { key: "mfgCost", label: "Mfg cost / item", skipIfEmpty: true, format: fmtRupee4 },
    { key: "sellingPrice", label: "Selling price / item", highlight: true, format: fmtRupee4 },
    { key: "spPerCase", label: "SP / case", format: fmtRupeeIN },
  ],
};

const TYPE_PILLS = ["All", "Bag", "Cup", "Box", "PP"];

function specSummary(quote) {
  if (quote.productType === "Bag") {
    return `${quote.width}×${quote.gusset}×${quote.height}mm · ${quote.gsm}G${quote.bf ? `/${quote.bf}BF` : ""}`;
  }
  if (quote.productType === "Box") {
    return `${quote.openLength || "?"}×${quote.openWidth || "?"}mm · ${quote.gsm}G`;
  }
  if (quote.productType === "Cup") {
    return `${quote.size || "?"} · IW${quote.innerGsm || "?"}G${quote.outerGsm ? ` / OW${quote.outerGsm}G` : ""}${quote.innerCoating ? ` · ${quote.innerCoating}` : ""}`;
  }
  if (quote.productType === "PP") {
    const w = quote.itemWeight ? `${quote.itemWeight}g` : "?";
    const cav = quote.cavities ? ` · ${quote.cavities}-cav` : "";
    const rate = quote.rmRate ? ` · ₹${quote.rmRate}/kg` : "";
    return `${w}${cav}${rate}`;
  }
  return "—";
}

function reopenHref(quote) {
  if (quote.productType === "Bag") return `/calculator/admin?quote=${quote.id}`;
  if (quote.productType === "Box") return `/calculator/admin/box?quote=${quote.id}`;
  if (quote.productType === "Cup") return `/calculator/admin/cup?quote=${quote.id}`;
  if (quote.productType === "PP") return `/calculator/admin/pp?quote=${quote.id}`;
  return "#";
}

function typeColor(type) {
  if (type === "Bag") return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  if (type === "Box") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (type === "Cup") return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  if (type === "PP") return "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
}

function DetailView({ quote, showClientColumn }) {
  const fieldSet = DETAIL_FIELDS_BY_TYPE[quote.productType] || DETAIL_FIELDS_BY_TYPE.Bag;
  const rows = fieldSet.map((f) => {
    const raw = f.compute ? f.compute(quote) : quote[f.key];
    if (f.skipIfEmpty && (raw === null || raw === undefined || raw === "" || raw === 0)) return null;
    const display = raw === null || raw === undefined || raw === "" ? "—"
      : f.format ? f.format(raw)
      : f.suffix ? `${raw}${f.suffix}`
      : raw;
    return { label: f.label, value: display, highlight: f.highlight };
  }).filter(Boolean);

  return (
    <div className="bg-gray-50 p-4 border-b border-gray-100 dark:bg-gray-800 dark:border-gray-700">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-700">
            <span className="text-gray-500 dark:text-gray-400">{r.label}</span>
            <span className={r.highlight ? "font-semibold text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-gray-200"}>{r.value}</span>
          </div>
        ))}
        {showClientColumn && quote.clientEmail && (
          <div className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-700">
            <span className="text-gray-500 dark:text-gray-400">Customer email</span>
            <span className="text-gray-900 break-all dark:text-gray-200">{quote.clientEmail}</span>
          </div>
        )}
      </div>
      {quote.notes && (
        <div className="mt-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">Notes: </span>
          <span className="text-gray-800 dark:text-gray-200">{quote.notes}</span>
        </div>
      )}
    </div>
  );
}

export default function QuoteHistoryTable({ showClientColumn }) {
  const [quotes, setQuotes] = useState(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/calc/quotes").then((r) => r.ok ? r.json() : []).then((arr) => arr.map((x) => ({ ...x, productType: "Bag" }))).catch(() => []),
      fetch("/api/calc/box-quotes").then((r) => r.ok ? r.json() : []).then((arr) => arr.map((x) => ({ ...x, productType: "Box", orderQty: x.qty }))).catch(() => []),
      fetch("/api/calc/cup-quotes").then((r) => r.ok ? r.json() : []).then((arr) => arr.map((x) => ({ ...x, productType: "Cup" }))).catch(() => []),
      fetch("/api/calc/pp-quotes").then((r) => r.ok ? r.json() : []).then((arr) => arr.map((x) => ({ ...x, productType: "PP", orderTotal: x.spPerCase }))).catch(() => []),
    ]).then(([bags, boxes, cups, pps]) => {
      const all = [...bags, ...boxes, ...cups, ...pps];
      // Sort by date desc — Airtable already sorts within type but we just merged.
      all.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      setQuotes(all);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!quotes) return null;
    const needle = q.trim().toLowerCase();
    return quotes.filter((x) => {
      if (typeFilter !== "All" && x.productType !== typeFilter) return false;
      if (!needle) return true;
      return [x.quoteRef, x.brand, x.item, x.bagType, x.boxType, x.wallType, x.size, x.sku, x.plainPrinted, x.clientEmail, x.mill, x.paperName, x.itemName]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(needle));
    });
  }, [quotes, q, typeFilter]);

  if (quotes === null) return <Card><p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p></Card>;
  if (quotes.length === 0) return <Card><p className="text-sm text-gray-500 dark:text-gray-400">No quotes saved yet.</p></Card>;

  const counts = quotes.reduce((acc, x) => { acc[x.productType] = (acc[x.productType] || 0) + 1; return acc; }, {});
  const colspan = showClientColumn ? 9 : 8;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {TYPE_PILLS.map((t) => {
          const count = t === "All" ? quotes.length : (counts[t] || 0);
          return (
            <PillBtn key={t} active={typeFilter === t} onClick={() => { setTypeFilter(t); setExpandedId(null); }}>
              {t} <span className="opacity-60 ml-1">{count}</span>
            </PillBtn>
          );
        })}
      </div>
      <input className={`${inputCls} mb-4`} placeholder="Search by ref, brand, item, type, size, mill…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:text-gray-500 dark:border-gray-800">
              <th className="text-left pb-2 font-medium">Date</th>
              <th className="text-left pb-2 font-medium">Type</th>
              <th className="text-left pb-2 font-medium">Ref</th>
              <th className="text-left pb-2 font-medium">Product</th>
              <th className="text-left pb-2 font-medium">Specs</th>
              <th className="text-right pb-2 font-medium">Qty</th>
              <th className="text-right pb-2 font-medium">Rate</th>
              <th className="text-right pb-2 font-medium">Order Total</th>
              {showClientColumn && <th className="text-left pb-2 font-medium">Customer</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((quote) => {
              const isOpen = expandedId === quote.id;
              const productLabel = quote.productType === "Bag" ? quote.bagType
                : quote.productType === "Box" ? quote.boxType
                : quote.productType === "Cup" ? quote.wallType
                : quote.productType === "PP" ? quote.itemName
                : "—";
              return (
                <>
                  <tr key={quote.id}
                    onClick={() => setExpandedId(isOpen ? null : quote.id)}
                    className={`cursor-pointer border-b border-gray-50 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800 ${isOpen ? "bg-blue-50/40 dark:bg-blue-900/20" : ""}`}>
                    <td className="py-2 text-gray-500 text-xs dark:text-gray-400">{quote.date || "—"}</td>
                    <td className="py-2">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${typeColor(quote.productType)}`}>{quote.productType}</span>
                    </td>
                    <td className="py-2 font-medium dark:text-gray-200">
                      <span className="text-gray-400 mr-1 dark:text-gray-500">{isOpen ? "▾" : "▸"}</span>
                      {quote.quoteRef || "—"}
                    </td>
                    <td className="py-2">
                      <span className="inline-flex gap-1 items-center">
                        <span className="text-gray-700 dark:text-gray-300">{productLabel || "—"}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{quote.plainPrinted}</span>
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs dark:text-gray-400">{specSummary(quote)}</td>
                    <td className="py-2 text-right dark:text-gray-200">{quote.orderQty ? quote.orderQty.toLocaleString() : "—"}</td>
                    <td className="py-2 text-right dark:text-gray-200">{quote.sellingPrice != null ? `₹${Number(quote.sellingPrice).toFixed(2)}` : "—"}</td>
                    <td className="py-2 text-right font-medium dark:text-gray-200">{quote.orderTotal != null ? `₹${Number(quote.orderTotal).toLocaleString("en-IN")}` : "—"}</td>
                    {showClientColumn && <td className="py-2 text-gray-500 text-xs dark:text-gray-400">{quote.clientEmail || quote.generatedBy}</td>}
                  </tr>
                  {isOpen && (
                    <tr key={`${quote.id}-detail`}>
                      <td colSpan={colspan + 1} className="p-0">
                        <DetailView quote={quote} showClientColumn={showClientColumn} />
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3 dark:bg-gray-800 dark:border-gray-700">
                          <Link href={reopenHref(quote)}
                            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
                            Re-open in calculator
                          </Link>
                          <span className="text-xs text-gray-400 dark:text-gray-500">Opens the {quote.productType.toLowerCase()} calculator pre-filled with this quote.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-4 dark:text-gray-500">No matches.</p>}
    </Card>
  );
}
