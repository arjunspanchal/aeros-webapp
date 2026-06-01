// Client-side quote export helpers. Runs entirely in the browser — no server round-trip.
// CSV: Excel opens it directly; PDF: uses the browser print dialog (Save as PDF).

import { CURRENCIES, formatCurrency } from "@/lib/calc/calculator";

const BAG_TYPE_LABEL = {
  sos: "SOS",
  rope_handle: "Rope Handle",
  flat_handle: "Flat Handle",
  v_bottom_gusset: "V-Bottom",
};

const UNIT_LABEL = { mm: "mm", cm: "cm", in: "in" };
const MM_PER = { mm: 1, cm: 10, in: 25.4 };
const toUnit = (mm, unit) => (unit === "mm" ? mm : +(mm / MM_PER[unit]).toFixed(unit === "cm" ? 1 : 2));

function escCsv(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportQuoteCSV({ form, result, currency = "INR", unit = "mm", filename }) {
  const lines = [];
  const push = (...cols) => lines.push(cols.map(escCsv).join(","));

  push("Aeros Paper Bag Rate Calculator");
  push("Quote ref", form.quoteRef || "—");
  if (form.brand) push("Brand", form.brand);
  push("Date", new Date().toISOString().split("T")[0]);
  push();

  push("Bag specifications");
  push("Type", BAG_TYPE_LABEL[form.bagType] || form.bagType);
  push(`Width (${UNIT_LABEL[unit]})`, toUnit(form.width, unit));
  push(`Gusset (${UNIT_LABEL[unit]})`, toUnit(form.gusset, unit));
  push(`Height (${UNIT_LABEL[unit]})`, toUnit(form.height, unit));
  push("Paper type", form.paperType || "—");
  push("GSM", form.gsm);
  push("BF", form.bf);
  push("Printing", form.printing ? `${form.colours}C @ ${form.coverage}%` : "Plain");
  push("Case pack", form.casePack);
  push();

  if (result?.result?.totalWeight) {
    push("Bag weight");
    push("Paper (g)", (result.result.wkg * 1000).toFixed(2));
    if (result.result.handleWeight > 0) push("Handle (g)", (result.result.handleWeight * 1000).toFixed(0));
    push("Total / bag (g)", (result.result.totalWeight * 1000).toFixed(2));
    push();
  }

  if (result?.result?.box) {
    const b = result.result.box;
    push("Approximate box dimensions");
    push(`Length (${UNIT_LABEL[unit]})`, toUnit(b.L, unit));
    push(`Width (${UNIT_LABEL[unit]})`, toUnit(b.W, unit));
    push(`Depth (${UNIT_LABEL[unit]})`, toUnit(b.D, unit));
    push();
  }

  if (result?.curve?.length) {
    push(`Rate curve (${currency})`);
    push("Order qty", "Rate / bag", "Cost / case", "Order total");
    for (const row of result.curve) {
      const cur = CURRENCIES[currency] || CURRENCIES.INR;
      const rate = (row.ratePerBag / cur.inrPer).toFixed(4);
      const per = (row.costPerCase / cur.inrPer).toFixed(2);
      const total = (row.orderTotal / cur.inrPer).toFixed(2);
      push(row.qty, `${cur.symbol}${rate}`, `${cur.symbol}${per}`, `${cur.symbol}${total}`);
    }
  }

  const csv = "\ufeff" + lines.join("\n"); // BOM so Excel opens UTF-8 correctly
  const name = filename || `aeros-quote-${(form.quoteRef || "new").replace(/\s+/g, "-")}.csv`;
  downloadBlob(name, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

export function exportQuotePDF({ form, result, currency = "INR", unit = "mm" }) {
  const cur = CURRENCIES[currency] || CURRENCIES.INR;
  const date = new Date().toISOString().split("T")[0];
  const bagType = BAG_TYPE_LABEL[form.bagType] || form.bagType;
  const printing = form.printing ? `${form.colours} colour${form.colours > 1 ? "s" : ""} @ ${form.coverage}% coverage` : "Plain";

  const curveRows = (result?.curve || []).map((row) => `
    <tr>
      <td>${row.qty.toLocaleString()}</td>
      <td class="r">${formatCurrency(row.ratePerBag, currency)}</td>
      <td class="r">${formatCurrency(row.costPerCase, currency)}</td>
      <td class="r"><strong>${formatCurrency(row.orderTotal, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong></td>
    </tr>
  `).join("");

  const box = result?.result?.box;
  const weight = result?.result;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Aeros Quote — ${form.quoteRef || "New"}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #111; margin: 32px; max-width: 720px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #666; font-size: 12px; }
  .rate { background: #1e40af; color: #fff; padding: 20px; border-radius: 12px; margin: 20px 0; }
  .rate .label { font-size: 12px; opacity: 0.8; }
  .rate .val { font-size: 32px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
  th { font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }
  td.r, th.r { text-align: right; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 8px 0 16px; }
  .grid .k { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .grid .v { font-size: 16px; font-weight: 600; margin-top: 2px; }
  h2 { font-size: 14px; margin: 24px 0 8px; color: #1e40af; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #888; }
  @media print {
    body { margin: 20px; }
    /* Suppress the browser's auto-added URL / date / page-number chrome so the
       customer PDF doesn't carry "https://webapp.aeros-x.com/calculator/admin"
       across the top. Empty content directives win against the default. */
    @page {
      margin: 0.5in;
      size: A4;
      @top-left { content: ""; }
      @top-center { content: ""; }
      @top-right { content: ""; }
      @bottom-left { content: ""; }
      @bottom-center { content: ""; }
      @bottom-right { content: ""; }
    }
  }
</style></head><body>

<h1>Aeros Paper Bag Rate Calculator</h1>
<div class="muted">
  ${form.quoteRef ? `Ref <strong>${form.quoteRef}</strong> · ` : ""}${form.brand ? `${form.brand} · ` : ""}${date}
</div>

<div class="rate">
  <div class="label">Rate per bag @ ${form.orderQty.toLocaleString()}</div>
  <div class="val">${formatCurrency((result.curve.find((c) => c.qty === form.orderQty) || result.curve[0]).ratePerBag, currency)}</div>
</div>

<h2>Bag specifications</h2>
<table>
  <tr><td>Type</td><td class="r">${bagType}</td></tr>
  <tr><td>Dimensions</td><td class="r">${toUnit(form.width, unit)} × ${toUnit(form.gusset, unit)} × ${toUnit(form.height, unit)} ${UNIT_LABEL[unit]}</td></tr>
  <tr><td>Paper</td><td class="r">${form.paperType || "—"}, ${form.gsm} GSM, ${form.bf} BF</td></tr>
  <tr><td>Printing</td><td class="r">${printing}</td></tr>
  <tr><td>Case pack</td><td class="r">${form.casePack} bags</td></tr>
</table>

${weight?.totalWeight ? `
<h2>Bag weight</h2>
<div class="grid">
  <div><div class="k">Paper</div><div class="v">${(weight.wkg * 1000).toFixed(2)} g</div></div>
  ${weight.handleWeight > 0 ? `<div><div class="k">Handle</div><div class="v">${(weight.handleWeight * 1000).toFixed(0)} g</div></div>` : ""}
  <div><div class="k">Total / bag</div><div class="v">${(weight.totalWeight * 1000).toFixed(2)} g</div></div>
</div>
` : ""}

${box ? `
<h2>Approx box dimensions</h2>
<div class="grid">
  <div><div class="k">Length</div><div class="v">${toUnit(box.L, unit)} ${UNIT_LABEL[unit]}</div></div>
  <div><div class="k">Width</div><div class="v">${toUnit(box.W, unit)} ${UNIT_LABEL[unit]}</div></div>
  <div><div class="k">Depth</div><div class="v">${toUnit(box.D, unit)} ${UNIT_LABEL[unit]}</div></div>
</div>
<div class="muted">${form.casePack} bags per case · ${Math.ceil(form.orderQty / form.casePack).toLocaleString()} cases for this order</div>
` : ""}

<h2>Rate curve (${currency})</h2>
<table>
  <thead>
    <tr><th>Order qty</th><th class="r">Rate / bag</th><th class="r">Cost / case</th><th class="r">Order total</th></tr>
  </thead>
  <tbody>${curveRows}</tbody>
</table>

<div class="footer">
  Generated ${date} · All prices are indicative estimates and subject to confirmation.
</div>

<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Popup blocked — please allow popups to export PDFs."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// Admin-internal PDF — same layout but adds the full cost breakdown (paper,
// glue, labour, wastage, setup, plate, mfg cost, margin, profit) so the team
// can review the numbers before sending the client-facing version.
export function exportAdminQuotePDF({ form, breakdown, curve, currency = "INR", unit = "mm" }) {
  const date = new Date().toISOString().split("T")[0];
  const bagType = BAG_TYPE_LABEL[form.bagType] || form.bagType;
  const printing = form.printing ? `${form.colours} colour${form.colours > 1 ? "s" : ""} @ ${form.coverage}% coverage` : "Plain";

  const curveRows = (curve || []).map((row) => `
    <tr>
      <td>${row.qty.toLocaleString()}</td>
      <td class="r">${formatCurrency(row.mfgPerBag ?? 0, currency)}</td>
      <td class="r">${formatCurrency(row.ratePerBag, currency)}</td>
      <td class="r">${formatCurrency(row.costPerCase, currency)}</td>
      <td class="r"><strong>${formatCurrency(row.orderTotal, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong></td>
    </tr>
  `).join("");

  const inr = (v) => `₹${Number(v || 0).toFixed(4)}`;
  const box = breakdown?.box;
  const cb = breakdown || {};

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Aeros Admin Quote — ${form.quoteRef || "New"}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #111; margin: 32px; max-width: 760px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 600; margin-left: 8px; vertical-align: middle; }
  .muted { color: #666; font-size: 12px; }
  .rate { background: #1e40af; color: #fff; padding: 16px 20px; border-radius: 12px; margin: 16px 0; display: flex; gap: 24px; align-items: baseline; }
  .rate .label { font-size: 11px; opacity: 0.75; }
  .rate .val { font-size: 26px; font-weight: 700; }
  .rate .sep { width: 1px; align-self: stretch; background: rgba(255,255,255,0.25); }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eee; }
  th { font-size: 10px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }
  td.r, th.r { text-align: right; }
  tr.highlight td { background: #eff6ff; font-weight: 700; color: #1e40af; }
  h2 { font-size: 13px; margin: 18px 0 6px; color: #1e40af; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 6px 0 12px; }
  .grid .k { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .grid .v { font-size: 14px; font-weight: 600; margin-top: 2px; }
  .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #eee; font-size: 11px; color: #888; }
  @media print {
    body { margin: 18px; }
    /* Strip browser-added URL / date / page-number headers from the admin PDF too. */
    @page {
      margin: 0.5in;
      size: A4;
      @top-left { content: ""; }
      @top-center { content: ""; }
      @top-right { content: ""; }
      @bottom-left { content: ""; }
      @bottom-center { content: ""; }
      @bottom-right { content: ""; }
    }
  }
</style></head><body>

<h1>Aeros Paper Bag Rate Calculator <span class="badge">INTERNAL</span></h1>
<div class="muted">
  ${form.quoteRef ? `Ref <strong>${form.quoteRef}</strong> · ` : ""}${form.brand ? `${form.brand} · ` : ""}${date}
</div>

<div class="rate">
  <div><div class="label">Selling Price / bag</div><div class="val">${inr(cb.sellingPrice)}</div></div>
  <div class="sep"></div>
  <div><div class="label">Mfg Cost / bag</div><div class="val">${inr(cb.totalMfg)}</div></div>
  <div class="sep"></div>
  <div><div class="label">Profit (${cb.profitPct ?? "—"}%)</div><div class="val">${inr(cb.profit)}</div></div>
</div>

<h2>Bag specifications</h2>
<table>
  <tr><td>Type</td><td class="r">${bagType}</td></tr>
  <tr><td>Dimensions</td><td class="r">${form.width} × ${form.gusset} × ${form.height} mm</td></tr>
  <tr><td>Paper</td><td class="r">${form.paperType || "—"} · ${form.millName || "—"} · ${form.gsm} GSM · ${form.bf} BF</td></tr>
  <tr><td>Paper rate (RM)</td><td class="r">₹${Number(form.paperRate || 0).toFixed(2)} / kg</td></tr>
  <tr><td>Printing</td><td class="r">${printing}</td></tr>
  <tr><td>Case pack</td><td class="r">${form.casePack} bags</td></tr>
  <tr><td>Order qty</td><td class="r">${Number(form.orderQty).toLocaleString()}</td></tr>
</table>

<h2>Cost breakdown (₹ / bag)</h2>
<table>
  <tr><td>Paper</td><td class="r">${inr(cb.paperCost)}</td></tr>
  <tr><td>Glue</td><td class="r">${inr(cb.glueCost)}</td></tr>
  <tr><td>Case packing</td><td class="r">${inr(cb.cpCost)}</td></tr>
  <tr><td>Wastage (${cb.wastage ?? "—"}%)</td><td class="r">${inr(cb.wastageCost)}</td></tr>
  <tr><td>Conversion labour (₹${cb.convRate ?? "—"}/kg)</td><td class="r">${inr(cb.labourCost)}</td></tr>
  ${cb.handleCost ? `<tr><td>Handle</td><td class="r">${inr(cb.handleCost)}</td></tr>` : ""}
  ${form.printing ? `<tr><td>Printing — ${form.coverage}% (₹${cb.printRate ?? 0}/kg)</td><td class="r">${inr(cb.printCost)}</td></tr>` : ""}
  <tr><td>Setup amortised</td><td class="r">${inr(cb.setupAmortised)}</td></tr>
  ${form.printing && cb.plateCost ? `<tr><td>Plate amortised (₹${cb.plateCost.toLocaleString()} ÷ ${Number(form.orderQty).toLocaleString()})</td><td class="r">${inr(cb.plateAmortised)}</td></tr>` : ""}
  <tr class="highlight"><td>Total Manufacturing</td><td class="r">${inr(cb.totalMfg)}</td></tr>
  <tr><td>Profit (${cb.profitPct ?? "—"}%)</td><td class="r">${inr(cb.profit)}</td></tr>
  <tr class="highlight"><td>Selling Price / bag</td><td class="r">${inr(cb.sellingPrice)}</td></tr>
</table>

<h2>Bag weight</h2>
<div class="grid">
  <div><div class="k">Paper</div><div class="v">${((cb.wkg || 0) * 1000).toFixed(2)} g</div></div>
  ${cb.handleWeight > 0 ? `<div><div class="k">Handle</div><div class="v">${(cb.handleWeight * 1000).toFixed(0)} g</div></div>` : ""}
  <div><div class="k">Total / bag</div><div class="v">${((cb.totalWeight || 0) * 1000).toFixed(2)} g</div></div>
</div>

${box ? `
<h2>Approx box dimensions</h2>
<div class="grid">
  <div><div class="k">Length</div><div class="v">${box.L} mm</div></div>
  <div><div class="k">Width</div><div class="v">${box.W} mm</div></div>
  <div><div class="k">Depth</div><div class="v">${box.D} mm</div></div>
</div>
<div class="muted">${form.casePack} bags / case · ${Math.ceil(form.orderQty / form.casePack).toLocaleString()} cases for this order</div>
` : ""}

<h2>Rate curve by quantity</h2>
<table>
  <thead>
    <tr><th>Order qty</th><th class="r">Mfg / bag</th><th class="r">Rate / bag</th><th class="r">Cost / case</th><th class="r">Order total</th></tr>
  </thead>
  <tbody>${curveRows}</tbody>
</table>

${form.printing && cb.plateCost ? `<div class="muted" style="margin-top:14px">One-time plate cost: ₹${cb.plateCost.toLocaleString()} (${form.colours} colour${form.colours > 1 ? "s" : ""} × ₹5,000) — billed separately, once per artwork.</div>` : ""}

<div class="footer">
  Generated ${date} · Internal review document — do NOT send to customers. Use "Customer PDF" for the customer-facing version.
</div>

<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Popup blocked — please allow popups to export PDFs."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
