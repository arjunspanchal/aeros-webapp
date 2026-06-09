// Client-side Box quote export helpers — CSV + customer PDF + admin PDF.
// Same shape as `export.js` (bag) but tailored to the box calculator:
//
//   form        — AdminBoxCalculator state
//   result      — calculate(form) — single-tier cost breakdown
//   curve       — computeRateCurve(form) — rate ladder across QTY_TIERS
//   currentTier — picked from curve at form.qty (rate per box at chosen qty)
//
// Layout audit Calc-PR-B: Box was the only product calculator without an
// Export card. Bag (export.js), Cup (CupCalculator inline), PP (pp-export.js)
// all had Save + CSV + Customer PDF + Admin PDF. Box only had Save, so the
// admin screenshotted the screen — or rebuilt the numbers in a separate PDF.
// This file closes that gap; AdminBoxCalculator gains the same Export card.

import { CURRENCIES, formatCurrency } from "@/lib/calc/calculator";
import { BOX_TYPE_LABEL, isCorrugated, FLUTE_PROFILES } from "@/lib/calc/box-calculator";

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

function paperDescription(form) {
  if (!isCorrugated(form.boxType)) {
    return `${form.paperName || "—"} · ${form.gsm} GSM`;
  }
  const flute = FLUTE_PROFILES[form.flute]?.label || `${form.flute}-flute`;
  const stack = form.layers.map((l) => `${l.gsm}${l.kind === "flute" ? " (flute)" : ""}`).join(" / ");
  return `${form.ply}-ply ${flute} — ${stack}`;
}

export function exportBoxQuoteCSV({ form, result, curve, currency = "INR", filename }) {
  const lines = [];
  const push = (...cols) => lines.push(cols.map(escCsv).join(","));

  push("Aeros Box Rate Calculator");
  push("Quote ref", form.quoteRef || "—");
  push("Date", new Date().toISOString().split("T")[0]);
  push();

  push("Box specifications");
  push("Type", BOX_TYPE_LABEL[form.boxType] || form.boxType);
  push("Open dims (mm)", `${form.openLength} × ${form.openWidth}`);
  push("Paper", paperDescription(form));
  push("Printing", form.printing ? `${form.colours}C @ ${form.coverage}%` : "Plain");
  if (form.punching) push("Punching", "Yes");
  push();

  if (result?.totalMfg) {
    push("Cost breakdown (₹/box)");
    if (result.paperCost) push("Paper", result.paperCost.toFixed(4));
    if (result.printCost) push("Printing", result.printCost.toFixed(4));
    if (result.corrugationCost) push("Corrugation", result.corrugationCost.toFixed(4));
    if (result.stitchingCost) push("Stitching", result.stitchingCost.toFixed(4));
    if (result.punchingCost) push("Punching", result.punchingCost.toFixed(4));
    if (result.innerPackCost) push("Inner pack", result.innerPackCost.toFixed(4));
    if (result.outerCartonCost) push("Outer carton", result.outerCartonCost.toFixed(4));
    push(`Wastage (${result.wastagePct}%)`, result.wastageCost.toFixed(4));
    push("Manufacturing", result.totalMfg.toFixed(4));
    push(`Profit (${result.profitPct}%)`, result.profit.toFixed(4));
    push("Selling price", result.sellingPrice.toFixed(4));
    push();
  }

  if (curve?.length) {
    push(`Rate curve (${currency})`);
    push("Order qty", "Rate / box", "Order total");
    for (const row of curve) {
      const cur = CURRENCIES[currency] || CURRENCIES.INR;
      const rate = (row.ratePerBox / cur.inrPer).toFixed(4);
      const total = (row.orderTotal / cur.inrPer).toFixed(2);
      push(row.qty, `${cur.symbol}${rate}`, `${cur.symbol}${total}`);
    }
  }

  const csv = "﻿" + lines.join("\n");
  const name = filename || `aeros-box-quote-${(form.quoteRef || "new").replace(/\s+/g, "-")}.csv`;
  downloadBlob(name, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

// Customer-facing PDF (clean, no margin / mfg numbers — just the rate ladder).
export function exportBoxQuotePDF({ form, result, curve, currency = "INR" }) {
  const date = new Date().toISOString().split("T")[0];
  const boxType = BOX_TYPE_LABEL[form.boxType] || form.boxType;
  const printing = form.printing ? `${form.colours} colour${form.colours > 1 ? "s" : ""} @ ${form.coverage}% coverage` : "Plain";
  const currentTier = (curve || []).find((c) => c.qty === form.qty) || (curve || [])[0];

  const curveRows = (curve || []).map((row) => `
    <tr>
      <td>${row.qty.toLocaleString()}</td>
      <td class="r">${formatCurrency(row.ratePerBox, currency)}</td>
      <td class="r"><strong>${formatCurrency(row.orderTotal, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong></td>
    </tr>
  `).join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Aeros Box Quote — ${form.quoteRef || "New"}</title>
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
  h2 { font-size: 14px; margin: 24px 0 8px; color: #1e40af; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #888; }
  @media print {
    body { margin: 20px; }
    @page {
      margin: 0.5in; size: A4;
      @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; }
      @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; }
    }
  }
</style></head><body>

<h1>Aeros Box Rate</h1>
<div class="muted">
  ${form.quoteRef ? `Ref <strong>${form.quoteRef}</strong> · ` : ""}${date}
</div>

<div class="rate">
  <div class="label">Rate per box @ ${form.qty.toLocaleString()}</div>
  <div class="val">${currentTier ? formatCurrency(currentTier.ratePerBox, currency) : "—"}</div>
</div>

<h2>Specifications</h2>
<table>
  <tr><td>Type</td><td class="r">${boxType}</td></tr>
  <tr><td>Open dimensions</td><td class="r">${form.openLength} × ${form.openWidth} mm</td></tr>
  <tr><td>Paper</td><td class="r">${paperDescription(form)}</td></tr>
  <tr><td>Printing</td><td class="r">${printing}</td></tr>
  ${form.punching ? `<tr><td>Punching</td><td class="r">Yes</td></tr>` : ""}
</table>

<h2>Rate curve (${currency})</h2>
<table>
  <thead>
    <tr><th>Order qty</th><th class="r">Rate / box</th><th class="r">Order total</th></tr>
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

// Admin-internal PDF — adds full cost breakdown + margin so team can review
// before sending the client-facing version.
export function exportAdminBoxQuotePDF({ form, result, curve, currency = "INR" }) {
  const date = new Date().toISOString().split("T")[0];
  const boxType = BOX_TYPE_LABEL[form.boxType] || form.boxType;
  const printing = form.printing ? `${form.colours} colour${form.colours > 1 ? "s" : ""} @ ${form.coverage}% coverage` : "Plain";
  const currentTier = (curve || []).find((c) => c.qty === form.qty) || (curve || [])[0];

  const curveRows = (curve || []).map((row) => `
    <tr>
      <td>${row.qty.toLocaleString()}</td>
      <td class="r">${formatCurrency(row.mfgPerBox ?? 0, currency)}</td>
      <td class="r">${formatCurrency(row.ratePerBox, currency)}</td>
      <td class="r"><strong>${formatCurrency(row.orderTotal, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong></td>
    </tr>
  `).join("");

  const inr = (v) => `₹${Number(v || 0).toFixed(4)}`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Aeros Admin Box Quote — ${form.quoteRef || "New"}</title>
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
  .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #eee; font-size: 11px; color: #888; }
  @media print {
    body { margin: 18px; }
    @page {
      margin: 0.5in; size: A4;
      @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; }
      @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; }
    }
  }
</style></head><body>

<h1>Aeros Box Rate <span class="badge">INTERNAL</span></h1>
<div class="muted">
  ${form.quoteRef ? `Ref <strong>${form.quoteRef}</strong> · ` : ""}${date}
</div>

<div class="rate">
  <div><div class="label">Selling Price / box</div><div class="val">${inr(result.sellingPrice)}</div></div>
  <div class="sep"></div>
  <div><div class="label">Mfg Cost / box</div><div class="val">${inr(result.totalMfg)}</div></div>
  <div class="sep"></div>
  <div><div class="label">Profit (${result.profitPct}%)</div><div class="val">${inr(result.profit)}</div></div>
</div>

<h2>Specifications</h2>
<table>
  <tr><td>Type</td><td class="r">${boxType}</td></tr>
  <tr><td>Open dimensions</td><td class="r">${form.openLength} × ${form.openWidth} mm</td></tr>
  <tr><td>Paper</td><td class="r">${paperDescription(form)}</td></tr>
  <tr><td>Printing</td><td class="r">${printing}</td></tr>
  ${form.punching ? `<tr><td>Punching</td><td class="r">Yes${form.punchingDieCost ? ` · die ₹${form.punchingDieCost.toLocaleString()}` : ""}</td></tr>` : ""}
  <tr><td>Order qty</td><td class="r">${Number(form.qty).toLocaleString()}</td></tr>
</table>

<h2>Cost breakdown (₹ / box)</h2>
<table>
  ${result.paperCost ? `<tr><td>Paper</td><td class="r">${inr(result.paperCost)}</td></tr>` : ""}
  ${result.printCost ? `<tr><td>Printing — ${form.coverage}%</td><td class="r">${inr(result.printCost)}</td></tr>` : ""}
  ${result.corrugationCost ? `<tr><td>Corrugation</td><td class="r">${inr(result.corrugationCost)}</td></tr>` : ""}
  ${result.stitchingCost ? `<tr><td>Stitching</td><td class="r">${inr(result.stitchingCost)}</td></tr>` : ""}
  ${result.punchingCost ? `<tr><td>Punching</td><td class="r">${inr(result.punchingCost)}</td></tr>` : ""}
  ${result.innerPackCost ? `<tr><td>Inner packing</td><td class="r">${inr(result.innerPackCost)}</td></tr>` : ""}
  ${result.outerCartonCost ? `<tr><td>Outer carton</td><td class="r">${inr(result.outerCartonCost)}</td></tr>` : ""}
  <tr><td>Wastage (${result.wastagePct}%)</td><td class="r">${inr(result.wastageCost)}</td></tr>
  <tr class="highlight"><td>Total Manufacturing</td><td class="r">${inr(result.totalMfg)}</td></tr>
  <tr><td>Profit (${result.profitPct}%)</td><td class="r">${inr(result.profit)}</td></tr>
  <tr class="highlight"><td>Selling Price / box</td><td class="r">${inr(result.sellingPrice)}</td></tr>
</table>

<h2>Rate curve by quantity</h2>
<table>
  <thead>
    <tr><th>Order qty</th><th class="r">Mfg / box</th><th class="r">Rate / box</th><th class="r">Order total</th></tr>
  </thead>
  <tbody>${curveRows}</tbody>
</table>

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
