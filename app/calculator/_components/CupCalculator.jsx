"use client";
import { useEffect, useMemo, useState } from "react";
import {
  calculate,
  CUP_PRESETS, PACKING_PRESETS, CASE_PACK_DEFAULTS,
  SW_DIMS, OF_DIMS, SIZE_OPTS, PRINT_OPTS, COATING_OPTS,
  COATING_RATES, DEFAULTS, PACK_LABOUR_PER_CUP, MONTHLY_CAPACITY,
  CONVERSION_DEFAULT_COMPONENTS, CPM_DEFAULTS_BY_SIZE, MONTHLY_HOURS_DEFAULT,
  DW_SPEED_FACTOR, computeConversionCostPerCup, effectiveCpm,
  MACHINE_COUNT_SW_DEFAULT, MACHINE_COUNT_DW_DEFAULT,
  PACKING_DEFAULT_MATERIALS, PACKING_DEFAULT_LABOUR_MONTHLY, computePackingCostPerCup,
  GLUE_GRAMS_PER_CUP_BY_SIZE, GLUE_DEFAULT_RATE, GLUE_DW_FACTOR, computeGlueCostPerCup,
  ORDER_RUN_SETUP_DEFAULT,
  STANDARD_CUP_DIMS,
  getOuterFanCount, getSidewallDims,
} from "@/lib/calc/cup-calculator";
import { USD_RATE } from "@/lib/calc/calculator";
import { tierFromMargin } from "@/lib/calc/pricing-tiers";

const STORAGE_PREFIX = "aeros:cup:order:";

const INNER_GSM_OPTS = [240, 260, 280, 300, 320];
const OUTER_GSM_OPTS = [240, 260, 280, 300];
const LOCKED_BT_GSM = "230";
const LOCKED_BT_COATING = "2PE";

// Export pallet — matches Aeros container-loading spec.
const PALLET = { L: 1200, W: 1000, maxH: 1600 };

function cartonMetrics(boxL, boxW, boxH, totalBoxes) {
  const L = parseFloat(boxL), W = parseFloat(boxW), H = parseFloat(boxH);
  if (!(L > 0 && W > 0 && H > 0)) return null;
  const cbm = (L * W * H) / 1_000_000_000;
  const perLayerA = Math.floor(PALLET.L / L) * Math.floor(PALLET.W / W);
  const perLayerB = Math.floor(PALLET.L / W) * Math.floor(PALLET.W / L);
  const perLayer = Math.max(perLayerA, perLayerB);
  const layers = Math.floor(PALLET.maxH / H);
  const boxesPerPallet = Math.max(0, perLayer * layers);
  return {
    cbm,
    boxesPerPallet,
    palletCount: boxesPerPallet > 0 ? Math.ceil((totalBoxes || 0) / boxesPerPallet) : 0,
  };
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadAdminCsv({ cupVariant, size, sku, qty, casePack, td, bd, h, boxL, boxW, boxH, swGSM, ofGSM, isDW, result }) {
  const totalCases = qty && casePack ? Math.ceil(parseInt(qty) / parseInt(casePack)) : 0;
  const m = cartonMetrics(boxL, boxW, boxH, totalCases);
  const rows = [
    ["Aeros Paper Cup — Admin Quote"],
    [],
    ["Cup type", cupVariant || "—"],
    ["Size", size || "—"],
    ["SKU", sku || "—"],
    (() => {
      const std = (STANDARD_CUP_DIMS[size] || [])[0];
      const dTd = td || std?.td;
      const dBd = bd || std?.bd;
      const dH = h || std?.h;
      const isStd = !td && std;
      return ["Cup dimensions (mm)" + (isStd ? " (standard)" : ""), dTd && dBd && dH ? `${dTd} × ${dBd} × ${dH}` : "—"];
    })(),
    ["Box dimensions (mm)", boxL && boxW && boxH ? `${boxL} × ${boxW} × ${boxH}` : "—"],
    ["Sidewall GSM", swGSM || "—"],
    ["Outer fan GSM", isDW ? (ofGSM || "—") : "—"],
    ["Order qty", qty || "—"],
    ["Case pack", casePack || "—"],
    [],
    ["Cases for order", totalCases || "—"],
    ["CBM per box", m ? m.cbm.toFixed(3) : "—"],
    ["Boxes per pallet", m ? m.boxesPerPallet : "—"],
    ["Pallets required", m ? m.palletCount : "—"],
    [],
    ["Cost breakdown (₹/cup)"],
    ["Sidewall RM", result.swRM.toFixed(4)],
    ["Sidewall print", result.swPrintCost.toFixed(4)],
    ...(isDW ? [["Outer fan (RM + print)", result.ofTotal.toFixed(4)]] : []),
    ["Bottom disc", result.btCost.toFixed(4)],
    ["Conversion", result.conv.toFixed(4)],
    ["Packing", result.pack.toFixed(4)],
    ["Glue", result.glue.toFixed(4)],
    ["Other", result.other.toFixed(4)],
    ["Mfg cost / cup", result.mfg.toFixed(4)],
    [`Factory margin (${result.mp}%)`, result.marginAmt.toFixed(4)],
    ["Factory SP / cup", result.sp.toFixed(2)],
    ["Factory SP / case", result.spCase.toFixed(2)],
    [],
    ["Cup weight (g)", result.cupWeightG.toFixed(2)],
    ["  Sidewall", result.swWeightG.toFixed(2)],
    ["  Bottom", result.btWeightG.toFixed(2)],
    ...(isDW ? [["  Outer fan", result.ofWeightG.toFixed(2)]] : []),
  ];
  if (result.swPlate || result.swDie || result.ofPlate || result.ofDie) {
    rows.push([], ["One-time costs (billed separately)"]);
    if (result.swPlate) rows.push(["Sidewall Flexo plates", result.swPlate]);
    if (result.swDie) rows.push(["Sidewall Offset dies", result.swDie]);
    if (result.ofPlate) rows.push(["Outer fan Flexo plates", result.ofPlate]);
    if (result.ofDie) rows.push(["Outer fan Offset dies", result.ofDie]);
  }
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aeros-cup-admin-${size || "cup"}-${(cupVariant || "").replace(/\s+/g, "")}-${qty || "0"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function openAdminPrintView({ cupVariant, size, sku, qty, casePack, td, bd, h, boxL, boxW, boxH, swGSM, ofGSM, isDW, result, quoteRef }) {
  const totalCases = qty && casePack ? Math.ceil(parseInt(qty) / parseInt(casePack)) : 0;
  const m = cartonMetrics(boxL, boxW, boxH, totalCases);
  const today = new Date().toISOString().slice(0, 10);
  const refLabel = (quoteRef || "").trim() || `${size || ""} ${cupVariant || "Cup"}`.trim();
  const title = `Aeros Cup Quote — ${refLabel}`;
  const specRow = (label, value) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;
  const ladderRow = (label, val, opts = {}) => `
    <tr class="${opts.highlight ? "highlight" : ""} ${opts.total ? "total" : ""}">
      <td>${escapeHtml(label)}</td>
      <td>₹${Number(val).toFixed(opts.cents ? 2 : 4)}</td>
    </tr>`;

  const ladder = [];
  ladder.push(ladderRow("Sidewall RM", result.swRM));
  if (result.swPrintCost > 0) ladder.push(ladderRow("Sidewall print", result.swPrintCost));
  if (isDW) ladder.push(ladderRow("Outer fan (RM + print)", result.ofTotal));
  ladder.push(ladderRow("Bottom disc", result.btCost));
  ladder.push(ladderRow("Conversion", result.conv));
  if (result.pack > 0) ladder.push(ladderRow("Packing", result.pack));
  if (result.glue > 0) ladder.push(ladderRow("Glue", result.glue));
  if (result.other > 0) ladder.push(ladderRow("Other", result.other));
  ladder.push(ladderRow("Mfg cost / cup", result.mfg, { total: true }));
  ladder.push(ladderRow(`Factory margin (${result.mp}%)`, result.marginAmt));
  ladder.push(ladderRow("Factory SP / cup", result.sp, { highlight: true, cents: true }));

  const oneTimeRows = [];
  if (result.swPlate > 0) oneTimeRows.push(`Sidewall Flexo plates: ₹${result.swPlate.toLocaleString()}`);
  if (result.swDie > 0) oneTimeRows.push(`Sidewall Offset dies: ₹${result.swDie.toLocaleString()}`);
  if (result.ofPlate > 0) oneTimeRows.push(`Outer fan Flexo plates: ₹${result.ofPlate.toLocaleString()}`);
  if (result.ofDie > 0) oneTimeRows.push(`Outer fan Offset dies: ₹${result.ofDie.toLocaleString()}`);

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; max-width: 820px; margin: 2rem auto; padding: 0 2rem; line-height: 1.4; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 0.25rem; }
  .ref { font-size: 13px; color: #6b7280; margin: 0 0 2rem; }
  .ref strong { color: #111827; }
  h2 { font-size: 16px; font-weight: 600; color: #1d4ed8; margin: 2rem 0 0.75rem; }
  .hero-label { font-size: 13px; color: #6b7280; margin: 1.5rem 0 0.25rem; }
  .hero-price { font-size: 48px; font-weight: 700; color: #111827; letter-spacing: -0.5px; line-height: 1; }
  table.spec, table.ladder { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  table.spec td, table.ladder td { padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
  table.spec td:first-child, table.ladder td:first-child { color: #4b5563; }
  table.spec td:last-child { text-align: right; color: #111827; font-weight: 500; }
  table.ladder td:last-child { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #111827; }
  table.ladder tr.total td { font-weight: 600; font-size: 15px; }
  table.ladder tr.highlight td { background: #eff6ff; font-weight: 700; font-size: 15px; color: #1d4ed8; padding-left: 12px; padding-right: 12px; }
  .stat-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; margin: 0.75rem 0; }
  .stat-lbl { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .stat-val { font-size: 18px; font-weight: 600; color: #111827; }
  .note { font-size: 13px; color: #6b7280; margin: 0.75rem 0 1rem; }
  .memo { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; font-size: 13px; color: #92400e; margin-top: 1rem; }
  .memo-title { font-weight: 600; margin-bottom: 4px; }
  .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: 12px; color: #4b5563; }
  @media print { body { margin: 0.5in; padding: 0; } @page { margin: 0.5in; @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; } @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; } } }
</style>
</head>
<body>
  <h1>Aeros Paper Cup Rate Calculator</h1>
  <div class="ref">Ref <strong>${escapeHtml(refLabel)}</strong> · ${today}</div>

  <div class="hero-label">Factory SP / cup @ ${qty ? parseInt(qty).toLocaleString() : "—"}</div>
  <div class="hero-price">₹${result.sp.toFixed(2)}</div>

  <h2>Cup specifications</h2>
  <table class="spec">
    ${specRow("Type", cupVariant)}
    ${specRow("Volume", size)}
    ${sku ? specRow("SKU", sku) : ""}
    ${(() => {
      const std = (STANDARD_CUP_DIMS[size] || [])[0];
      const dTd = td || std?.td;
      const dBd = bd || std?.bd;
      const dH = h || std?.h;
      if (!dTd || !dBd || !dH) return "";
      const isStd = !td && std;
      return specRow("Cup dimensions" + (isStd ? " (standard)" : ""), `${dTd} × ${dBd} × ${dH} mm`);
    })()}
    ${specRow("Sidewall GSM", swGSM || "—")}
    ${isDW ? specRow("Outer fan GSM", ofGSM || "—") : ""}
    ${specRow("Bottom disc", "230 GSM + 2PE (standard)")}
    ${specRow("Case pack", `${casePack || "—"} cups`)}
    ${specRow("Cup weight", `${result.cupWeightG.toFixed(2)} g`)}
  </table>

  ${boxL && boxW && boxH ? `
    <h2>Approx box dimensions</h2>
    <div class="stat-row">
      <div><div class="stat-lbl">Length</div><div class="stat-val">${boxL} mm</div></div>
      <div><div class="stat-lbl">Width</div><div class="stat-val">${boxW} mm</div></div>
      <div><div class="stat-lbl">Depth</div><div class="stat-val">${boxH} mm</div></div>
    </div>
    <div class="note">${casePack || "—"} cups per case · ${totalCases.toLocaleString()} cases for this order</div>
    ${m && m.boxesPerPallet > 0 ? `
      <div class="stat-row">
        <div><div class="stat-lbl">CBM per box</div><div class="stat-val">${m.cbm.toFixed(3)} m³</div></div>
        <div><div class="stat-lbl">Boxes per pallet</div><div class="stat-val">${m.boxesPerPallet}</div></div>
        <div><div class="stat-lbl">Pallets for order</div><div class="stat-val">${m.palletCount}</div></div>
      </div>
    ` : ""}
  ` : ""}

  <h2>Cost ladder (₹ / cup)</h2>
  <table class="ladder">
    ${ladder.join("")}
  </table>

  ${oneTimeRows.length > 0 ? `<div class="memo"><div class="memo-title">One-time costs — bill separately</div>${oneTimeRows.map((r) => `<div>${r}</div>`).join("")}</div>` : ""}

  <div class="footer">Generated ${today} · All prices are indicative estimates and subject to confirmation.</div>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to export the PDF."); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 300);
}

// Client-facing PDF — no mfg / margin / cost-component breakdown. Just the
// quote: hero rate, cup specs, box dims, and a qty-tier cost ladder so the
// client can see the volume discount.
function openClientCupPrintView({ cupVariant, size, sku, qty, casePack, td, bd, h, boxL, boxW, boxH, swGSM, ofGSM, swCoating, swPrint, swColors, isDW, result, quoteRef }) {
  const today = new Date().toISOString().slice(0, 10);
  const refLabel = (quoteRef || "").trim() || `${size || ""} ${cupVariant || "Cup"}`.trim();
  const title = `Aeros Cup Quote — ${refLabel}`;
  const cpNum = parseInt(casePack) || 0;
  const qtyNum = qty ? parseInt(qty) : 0;
  const totalCases = cpNum && qtyNum ? Math.ceil(qtyNum / cpNum) : 0;
  const m = cartonMetrics(boxL, boxW, boxH, totalCases);
  const isPrinted = swPrint && swPrint !== "No printing";

  // Build qty-tier cost ladder. Setup + plate/die amortise across qty so the
  // ladder slopes down naturally.
  const QTY_TIERS = [25000, 50000, 100000, 250000, 500000];
  const plateDie = (result.swPlate || 0) + (result.swDie || 0) + (result.ofPlate || 0) + (result.ofDie || 0);
  const oneTime = plateDie + ORDER_RUN_SETUP_DEFAULT;
  const mp = result.mp || 0;
  const tiers = QTY_TIERS.map((q) => {
    const oneTimePerCup = q > 0 ? oneTime / q : 0;
    const mfgPerCup = result.mfg + oneTimePerCup;
    const marginAmt = mp >= 100 ? 0 : (mfgPerCup * mp) / (100 - mp);
    const ratePerCup = mfgPerCup + marginAmt;
    return {
      qty: q,
      ratePerCup,
      ratePerCase: ratePerCup * Math.max(cpNum, 1),
      orderTotal: ratePerCup * q,
    };
  });
  const selectedTier = tiers.reduce((closest, t) => Math.abs(t.qty - qtyNum) < Math.abs((closest?.qty || 0) - qtyNum) ? t : closest, tiers[0]);

  const specRow = (label, value) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;
  const curveRow = (c) => `
    <tr class="${c.qty === selectedTier?.qty ? "selected" : ""}">
      <td>${c.qty.toLocaleString()}</td>
      <td>₹${c.ratePerCup.toFixed(2)}</td>
      <td>₹${c.ratePerCase.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>₹${c.orderTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
    </tr>`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; max-width: 820px; margin: 1rem auto; padding: 0 1.5rem; line-height: 1.35; font-size: 13px; }
  h1 { font-size: 20px; font-weight: 700; margin: 0 0 0.15rem; }
  .ref { font-size: 12px; color: #6b7280; margin: 0 0 1rem; }
  .ref strong { color: #111827; }
  h2 { font-size: 14px; font-weight: 600; color: #1d4ed8; margin: 1rem 0 0.4rem; page-break-after: avoid; }
  .hero-label { font-size: 12px; color: #6b7280; margin: 0.75rem 0 0.15rem; }
  .hero-price { font-size: 32px; font-weight: 700; color: #111827; letter-spacing: -0.5px; line-height: 1; }
  table.spec { width: 100%; border-collapse: collapse; margin: 0.25rem 0; page-break-inside: avoid; }
  table.spec td { padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
  table.spec td:first-child { color: #4b5563; }
  table.spec td:last-child { text-align: right; color: #111827; font-weight: 500; }
  .stat-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin: 0.4rem 0; page-break-inside: avoid; }
  .stat-lbl { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
  .stat-val { font-size: 15px; font-weight: 600; color: #111827; }
  .note { font-size: 12px; color: #6b7280; margin: 0.4rem 0 0.6rem; }
  table.curve { width: 100%; border-collapse: collapse; margin-top: 0.25rem; page-break-inside: avoid; }
  table.curve th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; padding: 6px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 500; }
  table.curve th:first-child { text-align: left; }
  table.curve td { padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: right; }
  table.curve td:first-child { text-align: left; }
  table.curve tr.selected td { font-weight: 700; background: #eff6ff; }
  table.curve tr.selected td:last-child { color: #1d4ed8; }
  .footer { margin-top: 1.25rem; padding-top: 0.5rem; border-top: 1px solid #e5e7eb; font-size: 11px; color: #4b5563; }
  @media print { body { margin: 0; padding: 0 0.4in; } @page { margin: 0.4in; size: A4; @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; } @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; } } }
</style>
</head>
<body>
  <h1>Aeros Paper Cup Rate Calculator</h1>
  <div class="ref">Ref <strong>${escapeHtml(refLabel)}</strong> · ${today}</div>

  <div class="hero-label">Rate per cup @ ${qtyNum ? qtyNum.toLocaleString() : "—"}</div>
  <div class="hero-price">${selectedTier ? `₹${selectedTier.ratePerCup.toFixed(2)}` : "—"}</div>

  <h2>Cup specifications</h2>
  <table class="spec">
    ${specRow("Type", cupVariant || "—")}
    ${specRow("Volume", size || "—")}
    ${sku ? specRow("SKU", sku) : ""}
    ${(() => {
      const std = (STANDARD_CUP_DIMS[size] || [])[0];
      const dTd = td || std?.td;
      const dBd = bd || std?.bd;
      const dH = h || std?.h;
      if (!dTd || !dBd || !dH) return "";
      const isStd = !td && std;
      return specRow("Cup dimensions" + (isStd ? " (standard)" : ""), `${dTd} × ${dBd} × ${dH} mm`);
    })()}
    ${specRow("Inner wall", `${swGSM || "—"} GSM${swCoating && swCoating !== "None" ? `, ${swCoating}` : ""}`)}
    ${isDW ? specRow("Outer wall", `${ofGSM || "—"} GSM`) : ""}
    ${specRow("Printing", isPrinted ? `${swColors || 1} colour ${swPrint}` : "Plain")}
    ${specRow("Case pack", `${cpNum || "—"} cups`)}
  </table>

  ${boxL && boxW && boxH ? `
    <h2>Approx box dimensions</h2>
    <div class="stat-row">
      <div><div class="stat-lbl">Length</div><div class="stat-val">${boxL} mm</div></div>
      <div><div class="stat-lbl">Width</div><div class="stat-val">${boxW} mm</div></div>
      <div><div class="stat-lbl">Depth</div><div class="stat-val">${boxH} mm</div></div>
    </div>
    <div class="note">${cpNum || "—"} cups per case · ${totalCases ? totalCases.toLocaleString() : "—"} cases for this order</div>
    ${m && m.boxesPerPallet > 0 ? `
      <div class="stat-row">
        <div><div class="stat-lbl">CBM per box</div><div class="stat-val">${m.cbm.toFixed(3)} m³</div></div>
        <div><div class="stat-lbl">Boxes per pallet</div><div class="stat-val">${m.boxesPerPallet}</div></div>
        <div><div class="stat-lbl">Pallets for order</div><div class="stat-val">${m.palletCount}</div></div>
      </div>
    ` : ""}
  ` : ""}

  <h2>Cost ladder (INR)</h2>
  <table class="curve">
    <thead>
      <tr>
        <th>Order Qty</th>
        <th>Rate / Cup</th>
        <th>Cost / Case</th>
        <th>Order Total</th>
      </tr>
    </thead>
    <tbody>
      ${tiers.map(curveRow).join("")}
    </tbody>
  </table>

  ${plateDie > 0 ? `<div class="note" style="margin-top:1rem">One-time plate/die setup: ₹${plateDie.toLocaleString("en-IN")} (billed separately, once per artwork)</div>` : ""}

  <div class="footer">Generated ${today} · All prices are indicative estimates and subject to confirmation.</div>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to export the PDF."); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 300);
}

// Self-contained styles scoped to `.cup-app`. Dark-mode variants track the
// `html.dark` flag set by the catalog's ThemeToggle.
const css = `
.cup-app{
  --bg-primary:#ffffff;
  --bg-secondary:#f9fafb;
  --text-primary:#111827;
  --text-secondary:#4b5563;
  --text-tertiary:#9ca3af;
  --text-success:#15803d;
  --border-secondary:#e5e7eb;
  --border-tertiary:#f3f4f6;
  --accent:#2563eb;
  --accent-dark:#1d4ed8;
  --accent-bg:#eff6ff;
  --accent-border:#bfdbfe;
  --warn-bg:#fffbeb;
  --warn-border:#fde68a;
  --warn-text:#92400e;
  --margin-text:#b45309;
  --radius-md:8px;
  --radius-lg:12px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  font-size:14px;
  color:var(--text-primary);
}
html.dark .cup-app{
  --bg-primary:#111827;
  --bg-secondary:#1f2937;
  --text-primary:#e5e7eb;
  --text-secondary:#9ca3af;
  --text-tertiary:#6b7280;
  --text-success:#4ade80;
  --border-secondary:#374151;
  --border-tertiary:#1f2937;
  --accent-bg:rgba(37,99,235,0.15);
  --accent-border:rgba(37,99,235,0.4);
  --warn-bg:rgba(234,179,8,0.12);
  --warn-border:rgba(234,179,8,0.3);
  --warn-text:#fbbf24;
  --margin-text:#fbbf24;
}
.cup-app *{box-sizing:border-box}
.cup-app h1{font-size:20px;font-weight:500;margin:0 0 2px}
.cup-app .sub{font-size:13px;color:var(--text-secondary);margin-bottom:1.25rem}
.cup-app .card{background:var(--bg-primary);border:0.5px solid var(--border-tertiary);border-radius:var(--radius-lg);padding:1rem 1.25rem;margin-bottom:1rem}
.cup-app .card-title{font-size:11px;font-weight:500;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:1rem}
.cup-app .field-row{display:flex;gap:12px;margin-bottom:.75rem;flex-wrap:wrap}
.cup-app .field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:120px}
.cup-app .field label{font-size:12px;color:var(--text-secondary)}
.cup-app .field input,.cup-app .field select{width:100%;padding:7px 10px;border:0.5px solid var(--border-secondary);border-radius:var(--radius-md);font-size:13px;background:var(--bg-primary);color:var(--text-primary);outline:none}
.cup-app .field input:focus,.cup-app .field select:focus{border-color:var(--accent);box-shadow:0 0 0 2px rgba(37,99,235,0.15)}
.cup-app .chips{display:flex;flex-wrap:wrap;gap:6px}
.cup-app .chip{padding:5px 12px;border:0.5px solid var(--border-secondary);border-radius:var(--radius-md);font-size:12px;cursor:pointer;background:var(--bg-primary);color:var(--text-secondary);transition:all 0.12s}
.cup-app .chip.sel{background:var(--accent);color:#fff;border-color:var(--accent)}
.cup-app .autofill{font-size:11px;color:var(--text-success);margin-top:3px}
.cup-app .preset-badge{display:inline-flex;align-items:center;gap:4px;background:var(--accent-bg);color:var(--accent-dark);border:0.5px solid var(--accent-border);border-radius:var(--radius-md);font-size:11px;padding:3px 8px;margin-top:4px}
html.dark .cup-app .preset-badge{color:#93c5fd}
.cup-app .spec-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:.75rem}
.cup-app .spec-cell{background:var(--bg-secondary);border-radius:var(--radius-md);padding:8px 10px}
.cup-app .spec-cell .sc-label{font-size:11px;color:var(--text-tertiary);margin-bottom:2px}
.cup-app .spec-cell .sc-val{font-size:13px;font-weight:500}
.cup-app .result-card{background:var(--bg-primary);border:0.5px solid var(--border-tertiary);border-radius:var(--radius-lg);overflow:hidden;margin-top:1.25rem}
.cup-app .sp-highlight{background:var(--accent-bg);border-radius:var(--radius-md);padding:.75rem 1rem;margin-top:.75rem;display:flex;justify-content:space-between;align-items:center}
.cup-app .sp-label{font-size:12px;color:var(--accent-dark)}
html.dark .cup-app .sp-label,html.dark .cup-app .sp-val{color:#93c5fd}
.cup-app .sp-val{font-size:24px;font-weight:500;color:var(--accent-dark)}
.cup-app .weight-box{background:var(--bg-secondary);border-radius:var(--radius-md);padding:.75rem 1rem;margin-top:.5rem;display:flex;justify-content:space-between;align-items:center}
.cup-app .breakdown-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid var(--border-tertiary);font-size:13px}
.cup-app .breakdown-row:last-child{border-bottom:none}
.cup-app .breakdown-row .lbl{color:var(--text-secondary)}
.cup-app .breakdown-row .val{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.cup-app .breakdown-row.total .lbl,.cup-app .breakdown-row.total .val{font-weight:500;font-size:14px}
.cup-app .breakdown-row.margin-row .val{color:var(--margin-text)}
.cup-app .memo-box{background:var(--warn-bg);border-top:0.5px solid var(--warn-border);padding:.75rem 1.25rem;font-size:12px;color:var(--warn-text)}
.cup-app .memo-box .memo-title{font-weight:500;margin-bottom:4px}
.cup-app .calc-btn{width:100%;padding:11px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius-md);font-size:14px;font-weight:500;cursor:pointer;margin-top:.5rem;transition:background 0.15s}
.cup-app .calc-btn:hover{background:var(--accent-dark)}
.cup-app .reset-btn{width:100%;padding:9px;background:var(--bg-secondary);color:var(--text-secondary);border:0.5px solid var(--border-secondary);border-radius:var(--radius-md);font-size:13px;cursor:pointer;margin-top:.5rem}
.cup-app .sect-divider{font-size:11px;font-weight:500;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin:1rem 0 .75rem;display:flex;align-items:center;gap:8px}
.cup-app .sect-divider::after{content:'';flex:1;height:0.5px;background:var(--border-tertiary)}
.cup-app .two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cup-app .dim-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.cup-app .expander-btn{width:100%;display:flex;justify-content:space-between;align-items:center;background:none;border:none;cursor:pointer;padding:0;color:var(--text-primary)}
.cup-app .apply-btn{background:var(--accent);color:#fff;border:none;border-radius:var(--radius-md);padding:5px 12px;font-size:12px;cursor:pointer}
.cup-app .saved-order-tag{display:inline-flex;align-items:center;gap:6px;background:var(--accent-bg);color:var(--accent-dark);border:0.5px solid var(--accent-border);border-radius:var(--radius-md);padding:4px 10px;font-size:12px}
html.dark .cup-app .saved-order-tag{color:#93c5fd}
.cup-app .del-btn{background:none;border:none;cursor:pointer;color:#ef4444;font-size:12px;padding:0}
.cup-app .ghost-btn{font-size:12px;background:none;border:0.5px solid var(--border-secondary);border-radius:var(--radius-md);padding:5px 12px;cursor:pointer;color:var(--text-secondary)}
.cup-app .save-input{flex:1;padding:7px 10px;border:0.5px solid var(--border-secondary);border-radius:var(--radius-md);font-size:13px;background:var(--bg-primary);color:var(--text-primary);outline:none}
.cup-app .soft-note{background:var(--bg-secondary);border-radius:var(--radius-md);padding:10px 12px;margin-bottom:1rem}
.cup-app .admin-grid{display:grid;grid-template-columns:1fr;gap:1rem;align-items:start}
@media(min-width:960px){.cup-app .admin-grid{grid-template-columns:2fr 3fr}}
.cup-app .admin-left,.cup-app .admin-right{min-width:0}
.cup-app .admin-right .result-card{margin-top:0}
.cup-app .admin-right .placeholder{padding:2rem 1.25rem;text-align:center;color:var(--text-secondary);font-size:13px}
@media(max-width:460px){
  .cup-app .two-col{grid-template-columns:1fr}
  .cup-app .dim-row{grid-template-columns:1fr 1fr}
  .cup-app .spec-row{grid-template-columns:1fr 1fr}
}
`;

function Field({ label, children, note, badge }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {badge && <span className="preset-badge">⚡ {badge}</span>}
      {note && <span className="autofill">✓ {note}</span>}
    </div>
  );
}

function NumInput({ value, onChange, placeholder, step }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange && onChange(e.target.value)}
      placeholder={placeholder || "0"}
      step={step || "any"}
    />
  );
}

function Chip({ label, selected, onClick }) {
  return (
    <button type="button" className={`chip${selected ? " sel" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

function CoatingSection({ coating, setCoating, coatingRate, setCoatingRate }) {
  return (
    <div>
      <div className="field" style={{ marginBottom: ".75rem" }}>
        <label>Coating</label>
        <div className="chips" style={{ marginTop: 4 }}>
          {COATING_OPTS.map((o) => (
            <Chip key={o} label={o} selected={coating === o} onClick={() => setCoating(o)} />
          ))}
        </div>
        {coating && coating !== "None" && COATING_RATES[coating] && (
          <span className="autofill">✓ {coating} rate: ₹{COATING_RATES[coating]}/kg</span>
        )}
      </div>
      {coating && coating !== "None" && !COATING_RATES[coating] && (
        <div className="field-row">
          <Field label="Coating rate (₹/kg)">
            <NumInput value={coatingRate} onChange={setCoatingRate} placeholder="e.g. 18" />
          </Field>
        </div>
      )}
    </div>
  );
}

function PrintSection({ print, setPrint, colors, setColors, rate1, setRate1, rateN, setRateN }) {
  const isFlex = print === "Flexo";
  const isOff = print === "Offset";
  const nc = parseInt(colors) || 0;
  return (
    <div>
      <div className="field" style={{ marginBottom: ".75rem" }}>
        <label>Printing method</label>
        <div className="chips" style={{ marginTop: 4 }}>
          {PRINT_OPTS.map((o) => (
            <Chip key={o} label={o} selected={print === o} onClick={() => setPrint(o)} />
          ))}
        </div>
      </div>
      {isFlex && (
        <div className="field-row">
          <Field label="No. of colours">
            <NumInput value={colors} onChange={setColors} placeholder="e.g. 2" />
          </Field>
          <Field label="1st colour rate (₹/kg)">
            <NumInput value={rate1} onChange={setRate1} placeholder="e.g. 8" />
          </Field>
          {nc > 1 && (
            <Field label="Subsequent colour rate (₹/kg)">
              <NumInput value={rateN} onChange={setRateN} placeholder="e.g. 5" />
            </Field>
          )}
        </div>
      )}
      {isOff && (
        <div className="field-row">
          <Field
            label="No. of colours"
            note={nc > 0 ? `Die cost: ₹${(nc * DEFAULTS.offsetDie).toLocaleString()} (billed separately)` : ""}
          >
            <NumInput value={colors} onChange={setColors} placeholder="e.g. 4" />
          </Field>
        </div>
      )}
      {isFlex && nc > 0 && (
        <div className="autofill" style={{ marginBottom: ".5rem" }}>
          ✓ Plate cost: ₹{(nc * DEFAULTS.flexoPlate).toLocaleString()} (billed separately)
        </div>
      )}
    </div>
  );
}

function getFormSnapshot(s) {
  return {
    cupVariant: s.cupVariant, size: s.size, sku: s.sku, qty: s.qty, casePack: s.casePack, margin: s.margin,
    td: s.td, bd: s.bd, h: s.h, boxL: s.boxL, boxW: s.boxW, boxH: s.boxH,
    swGSM: s.swGSM, swRate: s.swRate, swCoating: s.swCoating, swCoatingRate: s.swCoatingRate,
    swPrint: s.swPrint, swColors: s.swColors, swRate1: s.swRate1, swRateN: s.swRateN,
    btGSM: s.btGSM, btRate: s.btRate, btCoating: s.btCoating, btCoatingRate: s.btCoatingRate,
    conv: s.conv, pack: s.pack, glue: s.glue, otherCost: s.otherCost,
    convSalary: s.convSalary, convElec: s.convElec, convRent: s.convRent,
    packPoly: s.packPoly, packCarton: s.packCarton,
    ofGSM: s.ofGSM, ofRate: s.ofRate, ofCoating: s.ofCoating, ofCoatingRate: s.ofCoatingRate,
    ofPrint: s.ofPrint, ofColors: s.ofColors, ofRate1: s.ofRate1, ofRateN: s.ofRateN,
  };
}

function loadSavedOrders(scope) {
  if (typeof window === "undefined") return [];
  const orders = [];
  const prefix = `${STORAGE_PREFIX}${scope}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      try {
        const value = localStorage.getItem(key);
        if (value) orders.push({ key, ...JSON.parse(value) });
      } catch {}
    }
  }
  return orders.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
}

export default function CupCalculator({ scope = "default" }) {
  const [cupVariant, setCupVariant] = useState("");
  const [quoteRef, setQuoteRef] = useState("");
  const [size, setSize] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("");
  const [casePack, setCasePack] = useState("");
  const [margin, setMargin] = useState("");
  const [td, setTd] = useState(""); const [bd, setBd] = useState(""); const [h, setH] = useState("");
  const [boxL, setBoxL] = useState(""); const [boxW, setBoxW] = useState(""); const [boxH, setBoxH] = useState("");
  const [swGSM, setSwGSM] = useState(""); const [swRate, setSwRate] = useState("");
  const [swCoating, setSwCoating] = useState("None"); const [swCoatingRate, setSwCoatingRate] = useState("");
  const [swPrint, setSwPrint] = useState("No printing"); const [swColors, setSwColors] = useState("");
  const [swRate1, setSwRate1] = useState(""); const [swRateN, setSwRateN] = useState("");
  const [btGSM, setBtGSM] = useState(""); const [btRate, setBtRate] = useState("");
  const [btCoating, setBtCoating] = useState("None"); const [btCoatingRate, setBtCoatingRate] = useState("");
  const [conv, setConv] = useState(""); const [pack, setPack] = useState("");
  const [glue, setGlue] = useState(""); const [otherCost, setOtherCost] = useState("");
  const [showConvCalc, setShowConvCalc] = useState(false);
  const [convSalary, setConvSalary] = useState(String(CONVERSION_DEFAULT_COMPONENTS.salary));
  const [convElec, setConvElec] = useState(String(CONVERSION_DEFAULT_COMPONENTS.electricity));
  const [convRent, setConvRent] = useState(String(CONVERSION_DEFAULT_COMPONENTS.rent));
  const [convMaint, setConvMaint] = useState(String(CONVERSION_DEFAULT_COMPONENTS.maintenance));
  const [convQc, setConvQc] = useState(String(CONVERSION_DEFAULT_COMPONENTS.qc));
  const [convHours, setConvHours] = useState(String(MONTHLY_HOURS_DEFAULT));
  const [cpm8, setCpm8] = useState(String(CPM_DEFAULTS_BY_SIZE["8oz"]));
  const [cpm12, setCpm12] = useState(String(CPM_DEFAULTS_BY_SIZE["12oz"]));
  const [cpm16, setCpm16] = useState(String(CPM_DEFAULTS_BY_SIZE["16oz"]));
  const [cpm20, setCpm20] = useState(String(CPM_DEFAULTS_BY_SIZE["20oz"]));
  const [machineCountSw, setMachineCountSw] = useState(String(MACHINE_COUNT_SW_DEFAULT));
  const [machineCountDw, setMachineCountDw] = useState(String(MACHINE_COUNT_DW_DEFAULT));
  const [showPackCalc, setShowPackCalc] = useState(false);
  const [packPoly, setPackPoly] = useState(String(PACKING_DEFAULT_MATERIALS.poly));
  const [packCarton, setPackCarton] = useState(String(PACKING_DEFAULT_MATERIALS.carton));
  const [packTape, setPackTape] = useState(String(PACKING_DEFAULT_MATERIALS.tape));
  const [packLabel, setPackLabel] = useState(String(PACKING_DEFAULT_MATERIALS.label));
  const [packLabour, setPackLabour] = useState(String(PACKING_DEFAULT_LABOUR_MONTHLY));
  const [ofGSM, setOfGSM] = useState(""); const [ofRate, setOfRate] = useState("");
  const [ofCoating, setOfCoating] = useState("None"); const [ofCoatingRate, setOfCoatingRate] = useState("");
  const [ofPrint, setOfPrint] = useState("No printing"); const [ofColors, setOfColors] = useState("");
  const [ofRate1, setOfRate1] = useState(""); const [ofRateN, setOfRateN] = useState("");
  const [result, setResult] = useState(null);
  const [presetLocked, setPresetLocked] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [pastQuotes, setPastQuotes] = useState([]);
  const [loadedQuoteId, setLoadedQuoteId] = useState("");

  async function refreshPastQuotes(autoLoadId) {
    try {
      const res = await fetch("/api/calc/cup-quotes");
      if (!res.ok) return;
      const list = await res.json();
      setPastQuotes(Array.isArray(list) ? list : []);
      if (autoLoadId && Array.isArray(list) && list.some((q) => q.id === autoLoadId)) {
        setLoadedQuoteId(autoLoadId);
      }
    } catch {}
  }
  useEffect(() => { refreshPastQuotes(); }, []);

  function loadPastQuote(id) {
    setLoadedQuoteId(id);
    if (!id) return;
    const q = pastQuotes.find((x) => x.id === id);
    if (!q) return;
    const variant = q.wallType === "Single Wall" ? "SW Standard"
      : q.wallType === "Ripple" ? "Ripple Standard"
      : q.wallType === "Double Wall" ? "DW Standard"
      : "";
    if (variant) setCupVariant(variant);
    if (q.size) setSize(q.size);
    if (q.sku) setSku(q.sku);
    if (q.innerGsm != null) setSwGSM(String(q.innerGsm));
    if (q.outerGsm != null) setOfGSM(String(q.outerGsm));
    if (q.innerCoating) setSwCoating(q.innerCoating);
    // Restore RM rates so the recalculated mfg matches the saved quote.
    if (q.swRate != null) setSwRate(String(q.swRate));
    if (q.btRate != null) setBtRate(String(q.btRate));
    if (q.ofRate != null) setOfRate(String(q.ofRate));
    const swPrintMethod = q.printMethod || (q.plainPrinted === "Printed" ? "Flexo" : "No printing");
    const ofPrintMethod = q.outerPrintMethod || swPrintMethod;
    setSwPrint(swPrintMethod);
    setOfPrint(ofPrintMethod);
    if (q.colours != null) {
      setSwColors(q.colours ? String(q.colours) : "");
      setOfColors(q.colours ? String(q.colours) : "");
    }
    if (q.casePack != null) setCasePack(String(q.casePack));
    if (q.orderQty != null) setQty(String(q.orderQty));
    if (q.marginPct != null) setMargin(String(q.marginPct));
    if (q.quoteRef) setQuoteRef(q.quoteRef);
    setSaveStatus(null);
    setPresetLocked(false);

    // Auto-show the calculated rate using the loaded values directly so
    // the admin doesn't have to hit Calculate. Bypasses state batching by
    // computing inline with the loaded quote's values.
    const isDwLoaded = q.wallType === "Double Wall" || q.wallType === "Ripple";
    const cpForLoad = q.casePack || CASE_PACK_DEFAULTS[q.wallType]?.[q.size] || 500;
    const r = calculate({
      wallType: q.wallType,
      size: q.size,
      casePack: String(q.casePack ?? cpForLoad),
      margin: String(q.marginPct ?? 15),
      swGSM: String(q.innerGsm ?? ""),
      swRate: String(q.swRate ?? ""),
      swCoating: q.innerCoating || "None",
      swCoatingRate: "",
      swPrint: swPrintMethod,
      swColors: q.colours != null ? String(q.colours) : "",
      swRate1: "", swRateN: "",
      btGSM: LOCKED_BT_GSM,
      btRate: String(q.btRate ?? ""),
      btCoating: LOCKED_BT_COATING,
      btCoatingRate: "",
      ofGSM: isDwLoaded && q.outerGsm != null ? String(q.outerGsm) : "",
      ofRate: isDwLoaded && q.ofRate != null ? String(q.ofRate) : "",
      ofCoating: "None",
      ofCoatingRate: "",
      ofPrint: ofPrintMethod,
      ofColors: q.colours != null ? String(q.colours) : "",
      ofRate1: "", ofRateN: "",
      conv: String(computeConversionCostPerCup({ size: q.size, wallType: q.wallType })),
      pack: String(computePackingCostPerCup({ size: q.size, wallType: q.wallType, casePack: cpForLoad }).total),
      glue: String(computeGlueCostPerCup({ size: q.size, wallType: q.wallType })),
      otherCost: "0",
    });
    setResult(r);
  }

  const [savedOrders, setSavedOrders] = useState([]);
  const [loadedOrderKey, setLoadedOrderKey] = useState("");
  const [saveLabel, setSaveLabel] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  // Real product variants from Aeros Products Master. Shape:
  //   { [wallType]: { [size]: [{ td, bd, h, sku, productName, variant, casePack, cartonDimensions }] } }
  // Dimensions, box size, and case pack are all auto-filled from here —
  // free-text dim inputs have been removed.
  const [productDims, setProductDims] = useState({});
  // Paper RM Master — list of { supplier, gsm, effectiveRate, materialName, ... }.
  // Admin picks a sidewall brand at the chosen GSM and a bottom brand at 230 GSM;
  // selecting one auto-fills the paper rate.
  const [masterPapers, setMasterPapers] = useState([]);
  const [swPaperId, setSwPaperId] = useState("");
  const [btPaperId, setBtPaperId] = useState("");
  const [ofPaperId, setOfPaperId] = useState("");

  useEffect(() => {
    setSavedOrders(loadSavedOrders(scope));
    setStorageReady(true);
  }, [scope]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calc/master-papers")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => { if (!cancelled && data?.masterPapers) setMasterPapers(data.masterPapers); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calc/cup-products")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => { if (!cancelled && data && !data.error) setProductDims(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const preset = cupVariant ? CUP_PRESETS[cupVariant] : null;
  const cupType = preset ? preset.wallType : "";
  const isDW = cupType === "Double Wall" || cupType === "Ripple";

  // Variants from DB for the currently picked cup type + size.
  const productVariants = cupType && size ? (productDims[cupType]?.[size] || []) : [];
  const selectedProduct = useMemo(
    () => productVariants.find((v) => v.sku === sku) || null,
    [productVariants, sku]
  );

  // Pick a product variant → stamp SKU, dims, case pack, carton box on the form.
  function applyProductVariant(product) {
    if (!product) return;
    setSku(product.sku || "");
    setTd(String(product.td || ""));
    setBd(String(product.bd || ""));
    setH(String(product.h || ""));
    if (product.casePack) setCasePack(String(product.casePack));
    // Carton Dimensions format: "415 × 330 × 500" (L × W × H in mm)
    if (product.cartonDimensions) {
      const parts = product.cartonDimensions.split(/[×x*]/).map((p) => p.trim().replace(/[^0-9.]/g, ""));
      if (parts[0]) setBoxL(parts[0]);
      if (parts[1]) setBoxW(parts[1]);
      if (parts[2]) setBoxH(parts[2]);
    }
  }

  // When variants load or wall/size changes, auto-pick the first variant
  // unless an existing sku still matches.
  useEffect(() => {
    if (!cupType || !size) return;
    if (productVariants.length === 0) return;
    if (!productVariants.find((v) => v.sku === sku)) {
      applyProductVariant(productVariants[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productDims, cupType, size]);

  function applyPreset(variant, sz) {
    const p = CUP_PRESETS[variant];
    if (!p || !sz) return;
    const sw = p.sw[sz], bt = p.bt[sz], of = p.of?.[sz];
    if (sw) { setSwGSM(String(sw.gsm)); setSwCoating(sw.coating); }
    if (bt) { setBtGSM(String(bt.gsm)); setBtCoating(bt.coating); }
    if (of) { setOfGSM(String(of.gsm)); setOfCoating(of.coating); }
    else { setOfGSM(""); setOfCoating("None"); }
    // SKU, dims and box size are NOT filled from the preset — they come from
    // Products Master via the Variant dropdown (see applyProductVariant).
    const cp = CASE_PACK_DEFAULTS[p.wallType]?.[sz];
    if (cp) setCasePack(String(cp));
    const pp = PACKING_PRESETS[variant]?.[sz];
    if (pp) {
      setPackPoly(pp.poly !== "" ? String(pp.poly) : "");
      setPackCarton(pp.carton !== "" ? String(pp.carton) : "");
    }
    setPresetLocked(true);
    setResult(null);
  }

  function loadOrder(key) {
    const order = savedOrders.find((o) => o.key === key);
    if (!order) return;
    const d = order.data;
    setCupVariant(d.cupVariant || "");
    setSize(d.size || "");
    setSku(d.sku || "");
    setQty(d.qty || "");
    setCasePack(d.casePack || "");
    setMargin(d.margin || "");
    setTd(d.td || ""); setBd(d.bd || ""); setH(d.h || "");
    setBoxL(d.boxL || ""); setBoxW(d.boxW || ""); setBoxH(d.boxH || "");
    if (!d.boxL && (d.cupVariant === "DW Export" || d.cupVariant === "DW Standard") && d.size === "20oz") {
      setBoxL("450"); setBoxW("370"); setBoxH("650");
    }
    setSwGSM(d.swGSM || ""); setSwRate(d.swRate || "");
    setSwCoating(d.swCoating || "None"); setSwCoatingRate(d.swCoatingRate || "");
    setSwPrint(d.swPrint || "No printing"); setSwColors(d.swColors || "");
    setSwRate1(d.swRate1 || ""); setSwRateN(d.swRateN || "");
    setBtGSM(d.btGSM || ""); setBtRate(d.btRate || "");
    setBtCoating(d.btCoating || "None"); setBtCoatingRate(d.btCoatingRate || "");
    setConv(d.conv || ""); setPack(d.pack || "");
    setGlue(d.glue || ""); setOtherCost(d.otherCost || "");
    setConvSalary(d.convSalary || "185000");
    setConvElec(d.convElec || "100000");
    setConvRent(d.convRent || "112500");
    setPackPoly(d.packPoly || ""); setPackCarton(d.packCarton || "");
    setOfGSM(d.ofGSM || ""); setOfRate(d.ofRate || "");
    setOfCoating(d.ofCoating || "None"); setOfCoatingRate(d.ofCoatingRate || "");
    setOfPrint(d.ofPrint || "No printing"); setOfColors(d.ofColors || "");
    setOfRate1(d.ofRate1 || ""); setOfRateN(d.ofRateN || "");
    setLoadedOrderKey(key);
    setResult(null);
    setPresetLocked(false);
  }

  function saveOrder() {
    if (!saveLabel.trim()) return;
    const key = `${STORAGE_PREFIX}${scope}:${Date.now()}`;
    const snapshot = getFormSnapshot({
      cupVariant, size, sku, qty, casePack, margin, td, bd, h, boxL, boxW, boxH,
      swGSM, swRate, swCoating, swCoatingRate, swPrint, swColors, swRate1, swRateN,
      btGSM, btRate, btCoating, btCoatingRate, conv, pack, glue, otherCost,
      convSalary, convElec, convRent, packPoly, packCarton,
      ofGSM, ofRate, ofCoating, ofCoatingRate, ofPrint, ofColors, ofRate1, ofRateN,
    });
    const payload = { label: saveLabel.trim(), data: snapshot };
    try {
      localStorage.setItem(key, JSON.stringify(payload));
      setSavedOrders((prev) => [...prev, { key, ...payload }]);
      setLoadedOrderKey(key);
      setSaveLabel("");
      setShowSaveInput(false);
    } catch (e) {
      alert("Save failed: " + e.message);
    }
  }

  function deleteOrder(key) {
    try {
      localStorage.removeItem(key);
      setSavedOrders((prev) => prev.filter((o) => o.key !== key));
      if (loadedOrderKey === key) setLoadedOrderKey("");
    } catch {}
  }

  const swDims = getSidewallDims(size, swPrint);
  const ofDims = size && OF_DIMS[size] ? OF_DIMS[size] : null;
  const ofFans = getOuterFanCount(size);

  // Auto-fill conversion + packing from fleet/material settings. Admin can
  // still type a manual override in the conv/pack fields — the effect only
  // pushes when override flag is false.
  const autoConv = useMemo(() => {
    if (!cupType || !size) return null;
    return computeConversionCostPerCup({
      size, wallType: cupType,
      components: {
        salary: parseFloat(convSalary) || 0,
        electricity: parseFloat(convElec) || 0,
        rent: parseFloat(convRent) || 0,
        maintenance: parseFloat(convMaint) || 0,
        qc: parseFloat(convQc) || 0,
      },
      monthlyHours: parseFloat(convHours) || 0,
      cpmBySize: { "8oz": parseFloat(cpm8) || 0, "12oz": parseFloat(cpm12) || 0, "16oz": parseFloat(cpm16) || 0, "20oz": parseFloat(cpm20) || 0 },
      machineCountSw: parseFloat(machineCountSw) || 0,
      machineCountDw: parseFloat(machineCountDw) || 0,
    });
  }, [cupType, size, convSalary, convElec, convRent, convMaint, convQc, convHours, cpm8, cpm12, cpm16, cpm20, machineCountSw, machineCountDw]);

  const autoPack = useMemo(() => {
    if (!cupType || !size) return null;
    const cp = parseInt(casePack) || CASE_PACK_DEFAULTS[cupType]?.[size] || 0;
    if (!cp) return null;
    return computePackingCostPerCup({
      size, wallType: cupType, casePack: cp,
      materials: {
        poly: parseFloat(packPoly) || 0,
        carton: parseFloat(packCarton) || 0,
        tape: parseFloat(packTape) || 0,
        label: parseFloat(packLabel) || 0,
      },
      monthlyLabour: parseFloat(packLabour) || 0,
      monthlyHours: parseFloat(convHours) || 0,
      cpmBySize: { "8oz": parseFloat(cpm8) || 0, "12oz": parseFloat(cpm12) || 0, "16oz": parseFloat(cpm16) || 0, "20oz": parseFloat(cpm20) || 0 },
      machineCountSw: parseFloat(machineCountSw) || 0,
      machineCountDw: parseFloat(machineCountDw) || 0,
    });
  }, [cupType, size, casePack, packPoly, packCarton, packTape, packLabel, packLabour, convHours, cpm8, cpm12, cpm16, cpm20, machineCountSw, machineCountDw]);

  // Glue: always computed from size × wall type — no admin UI input, just
  // baked into the mfg cost so the rate stays honest.
  const autoGlue = useMemo(() => {
    if (!cupType || !size) return null;
    return computeGlueCostPerCup({ size, wallType: cupType });
  }, [cupType, size]);

  const [convOverride, setConvOverride] = useState(false);
  const [packOverride, setPackOverride] = useState(false);
  useEffect(() => {
    if (convOverride || !autoConv) return;
    setConv(autoConv.toFixed(4));
  }, [autoConv, convOverride]);
  useEffect(() => {
    if (packOverride || !autoPack) return;
    setPack(autoPack.total.toFixed(4));
  }, [autoPack, packOverride]);
  useEffect(() => {
    if (autoGlue == null) return;
    setGlue(autoGlue.toFixed(4));
  }, [autoGlue]);

  // Papers filtered to the sidewall GSM / bottom 230 GSM. Rates may be blank
  // in the RM Master — we still surface the brand but only autofill rate when
  // it's populated, and flag the missing-rate case in the UI.
  const swPaperOpts = useMemo(() => {
    const target = parseInt(swGSM);
    if (!target) return [];
    return masterPapers
      .filter((p) => p.gsm === target)
      .sort((a, b) => (a.materialName || "").localeCompare(b.materialName || ""));
  }, [masterPapers, swGSM]);
  const btPaperOpts = useMemo(
    () => masterPapers
      .filter((p) => p.gsm === 230)
      .sort((a, b) => (a.materialName || "").localeCompare(b.materialName || "")),
    [masterPapers]
  );
  const ofPaperOpts = useMemo(() => {
    const target = parseInt(ofGSM);
    if (!target) return [];
    return masterPapers
      .filter((p) => p.gsm === target)
      .sort((a, b) => (a.materialName || "").localeCompare(b.materialName || ""));
  }, [masterPapers, ofGSM]);

  function applySwPaper(id) {
    setSwPaperId(id);
    const p = masterPapers.find((x) => x.id === id);
    if (p && p.effectiveRate != null) setSwRate(String(p.effectiveRate));
  }
  function applyBtPaper(id) {
    setBtPaperId(id);
    const p = masterPapers.find((x) => x.id === id);
    if (p && p.effectiveRate != null) setBtRate(String(p.effectiveRate));
  }
  function applyOfPaper(id) {
    setOfPaperId(id);
    const p = masterPapers.find((x) => x.id === id);
    if (p && p.effectiveRate != null) setOfRate(String(p.effectiveRate));
  }

  // Clear the selected brand if the GSM pill changes and no longer matches.
  useEffect(() => {
    if (!swPaperId) return;
    const p = masterPapers.find((x) => x.id === swPaperId);
    if (!p || String(p.gsm) !== String(swGSM)) setSwPaperId("");
  }, [swGSM, masterPapers, swPaperId]);
  useEffect(() => {
    if (!ofPaperId) return;
    const p = masterPapers.find((x) => x.id === ofPaperId);
    if (!p || String(p.gsm) !== String(ofGSM)) setOfPaperId("");
  }, [ofGSM, masterPapers, ofPaperId]);

  function runCalculate() {
    const r = calculate({
      wallType: cupType,
      size, casePack, margin,
      swGSM, swRate, swCoating, swCoatingRate,
      swPrint, swColors, swRate1, swRateN,
      btGSM: LOCKED_BT_GSM, btRate, btCoating: LOCKED_BT_COATING, btCoatingRate: "",
      ofGSM, ofRate, ofCoating, ofCoatingRate,
      ofPrint, ofColors, ofRate1, ofRateN,
      conv, pack, glue, otherCost,
    });
    setResult(r);
  }

  async function saveQuote() {
    if (!result) return;
    setSavingQuote(true);
    setSaveStatus(null);
    const plateDie = (result.swPlate || 0) + (result.swDie || 0) + (result.ofPlate || 0) + (result.ofDie || 0);
    const cpNum = parseInt(casePack) || 0;
    const payload = {
      quoteRef: quoteRef || `${cupVariant || "Cup"} ${size || ""}`.trim(),
      wallType: cupType,
      size,
      sku,
      innerGsm: swGSM ? Number(swGSM) : undefined,
      outerGsm: isDW && ofGSM ? Number(ofGSM) : undefined,
      innerCoating: swCoating || undefined,
      // Paper rates (RM ₹/kg) — without these the loaded quote can't recompute.
      swRate: swRate ? Number(swRate) : undefined,
      btRate: btRate ? Number(btRate) : undefined,
      ofRate: isDW && ofRate ? Number(ofRate) : undefined,
      printMethod: swPrint || undefined,
      outerPrintMethod: isDW ? (ofPrint || undefined) : undefined,
      printing: swPrint !== "No printing" || ofPrint !== "No printing",
      colours: swColors ? Number(swColors) : (ofColors ? Number(ofColors) : undefined),
      coverage: undefined, // admin doesn't expose coverage; keep blank
      casePack: cpNum || undefined,
      orderQty: qty ? parseInt(qty) : undefined,
      marginPct: result.mp,
      mfgCost: Math.round(result.mfg * 10000) / 10000,
      sellingPrice: Math.round(result.sp * 100) / 100,
      costPerCase: cpNum ? Math.round(result.sp * cpNum * 100) / 100 : undefined,
      orderTotal: qty ? Math.round(result.sp * parseInt(qty) * 100) / 100 : undefined,
      cupWeightG: Math.round(result.cupWeightG * 100) / 100,
      oneTimeTotal: plateDie || undefined,
    };
    try {
      const res = await fetch("/api/calc/cup-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json().catch(() => null);
        setSaveStatus({ ok: true, msg: `✓ Saved as "${payload.quoteRef}"` });
        refreshPastQuotes(created?.id);
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveStatus({ ok: false, msg: err.error || "Save failed" });
      }
    } catch (e) {
      setSaveStatus({ ok: false, msg: e.message || "Save failed" });
    } finally {
      setSavingQuote(false);
    }
  }

  const f4 = (n) => `₹${(n || 0).toFixed(4)}`;
  const f2 = (n) => `₹${(n || 0).toFixed(2)}`;
  const swSpec = preset && size ? preset.sw[size] : null;
  const btSpec = preset && size ? preset.bt[size] : null;
  const ofSpec = preset && size && preset.of ? preset.of[size] : null;
  const loadedOrder = savedOrders.find((o) => o.key === loadedOrderKey);

  return (
    <div className="cup-app">
      <style>{css}</style>
      <div className="admin-grid">
      <div className="admin-left">

      {pastQuotes.length > 0 && (
        <div className="card">
          <div className="card-title">Load a past quote</div>
          <div className="field-row" style={{ alignItems: "flex-end" }}>
            <Field label={loadedQuoteId ? `Editing — clear to start fresh` : "Pick a saved cup quote"}>
              <select value={loadedQuoteId} onChange={(e) => loadPastQuote(e.target.value)}>
                <option value="">— New quote —</option>
                {pastQuotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.quoteRef || "(no ref)"}{q.wallType ? ` — ${q.wallType}` : ""}{q.size ? ` ${q.size}` : ""}{q.date ? ` · ${q.date}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {loadedQuoteId && (
              <div style={{ paddingBottom: 2 }}>
                <button className="ghost-btn" onClick={() => loadPastQuote("")}>Clear</button>
              </div>
            )}
          </div>
          {loadedQuoteId && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
              Specs reloaded. Recalculate, then Save quote to overwrite.
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">Basics</div>
        <div className="field-row">
          <Field label="Quote reference (shown on PDF)">
            <input
              type="text"
              value={quoteRef}
              onChange={(e) => setQuoteRef(e.target.value)}
              placeholder="e.g. Wellbeing DW 8oz PE"
            />
          </Field>
        </div>
        <div className="field-row">
          <Field label="Cup type">
            <select
              value={cupVariant}
              onChange={(e) => { setCupVariant(e.target.value); setSize(""); setResult(null); setPresetLocked(false); }}
            >
              <option value="">Select type…</option>
              <option value="SW Standard">Single Wall</option>
              <option value="DW Standard">Double Wall</option>
              <option value="Ripple Standard">Ripple Wall</option>
            </select>
          </Field>
          <Field label="Cup size">
            <div className="chips" style={{ marginTop: 2 }}>
              {SIZE_OPTS.map((o) => (
                <Chip
                  key={o}
                  label={o}
                  selected={size === o}
                  onClick={() => {
                    setSize(o);
                    if (cupVariant) applyPreset(cupVariant, o);
                    const isDWType = CUP_PRESETS[cupVariant]?.wallType === "Double Wall";
                    if (o === "20oz" && isDWType) { setBoxL("450"); setBoxW("370"); setBoxH("650"); }
                    else { setBoxL(""); setBoxW(""); setBoxH(""); }
                  }}
                />
              ))}
            </div>
          </Field>
        </div>
        {preset && size && (
          <div className="spec-row">
            <div className="spec-cell">
              <div className="sc-label">Sidewall</div>
              <div className="sc-val">{swSpec?.gsm}+{swSpec?.coating}</div>
            </div>
            <div className="spec-cell">
              <div className="sc-label">Bottom</div>
              <div className="sc-val">{btSpec?.gsm}+{btSpec?.coating}</div>
            </div>
            {ofSpec && (
              <div className="spec-cell">
                <div className="sc-label">Outer fan</div>
                <div className="sc-val">{ofSpec?.gsm}+{ofSpec?.coating}</div>
              </div>
            )}
          </div>
        )}
        {productVariants.length > 0 && (
          <div className="field-row">
            <Field label={productVariants.length > 1 ? "Variant (pick dimensions)" : "Product"}>
              <select
                value={sku}
                onChange={(e) => {
                  const v = productVariants.find((p) => p.sku === e.target.value);
                  if (v) applyProductVariant(v);
                }}
              >
                {productVariants.map((v) => (
                  <option key={v.sku} value={v.sku}>
                    {v.variant} — {v.td}×{v.bd}×{v.h} mm · {v.sku}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {productVariants.length === 0 && cupType && size && (
          <div className="autofill" style={{ marginBottom: ".75rem", color: "var(--text-secondary)" }}>
            No SKU in Aeros Products Master for {size} {cupType}. Add one to proceed.
          </div>
        )}
        {(td || bd || h) && (
          <div className="spec-row" style={{ marginBottom: ".75rem" }}>
            <div className="spec-cell">
              <div className="sc-label">Top dia</div>
              <div className="sc-val">{td ? `${td} mm` : "—"}</div>
            </div>
            <div className="spec-cell">
              <div className="sc-label">Bottom dia</div>
              <div className="sc-val">{bd ? `${bd} mm` : "—"}</div>
            </div>
            <div className="spec-cell">
              <div className="sc-label">Height</div>
              <div className="sc-val">{h ? `${h} mm` : "—"}</div>
            </div>
          </div>
        )}
        {(boxL || boxW || boxH) && (
          <div className="spec-row" style={{ marginBottom: ".75rem" }}>
            <div className="spec-cell">
              <div className="sc-label">Box L</div>
              <div className="sc-val">{boxL ? `${boxL} mm` : "—"}</div>
            </div>
            <div className="spec-cell">
              <div className="sc-label">Box W</div>
              <div className="sc-val">{boxW ? `${boxW} mm` : "—"}</div>
            </div>
            <div className="spec-cell">
              <div className="sc-label">Box H</div>
              <div className="sc-val">{boxH ? `${boxH} mm` : "—"}</div>
            </div>
          </div>
        )}
        {sku && (
          <div className="autofill" style={{ marginBottom: ".75rem" }}>
            SKU · {sku}{selectedProduct?.productName ? ` — ${selectedProduct.productName}` : ""}
          </div>
        )}
        <div className="field-row">
          <Field label="Order quantity (cups)">
            <NumInput value={qty} onChange={setQty} placeholder="e.g. 50000" />
          </Field>
          <Field label="Case pack" note={casePack && size && cupType ? `Auto-filled: ${cupType} ${size}` : ""}>
            <NumInput value={casePack} onChange={setCasePack} placeholder="e.g. 1000" />
          </Field>
          <Field label="Factory margin %">
            <NumInput value={margin} onChange={setMargin} placeholder="e.g. 15" />
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Inner wall</div>
        <div className="field-row">
          <Field label="Sidewall GSM" badge={presetLocked && swSpec ? `Preset: ${swSpec.gsm}` : ""}>
            <div className="chips" style={{ marginTop: 2 }}>
              {INNER_GSM_OPTS.map((g) => (
                <Chip key={g} label={String(g)} selected={String(swGSM) === String(g)} onClick={() => setSwGSM(String(g))} />
              ))}
            </div>
          </Field>
        </div>
        <div className="field-row">
          <Field
            label="Paper brand (from RM Master)"
            note={
              swGSM && swPaperOpts.length === 0
                ? `No paper at ${swGSM} GSM in RM Master — enter rate manually`
                : swPaperId && masterPapers.find((x) => x.id === swPaperId)?.effectiveRate == null
                ? "Rate not set in RM Master — enter manually or update Airtable"
                : ""
            }
          >
            <select value={swPaperId} onChange={(e) => applySwPaper(e.target.value)} disabled={!swGSM || swPaperOpts.length === 0}>
              <option value="">{swPaperOpts.length ? "Select brand…" : "Pick GSM first"}</option>
              {swPaperOpts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.materialName}{p.effectiveRate != null ? ` · ₹${p.effectiveRate}/kg` : " · rate TBD"}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Sidewall paper rate (₹/kg)"
            note={
              swDims && swPrint !== "No printing"
                ? `Dims: ${swDims[0]}×${swDims[1]}mm · 6 fans`
                : swDims
                ? `Dims: ${swDims[0]}×${swDims[1]}mm`
                : ""
            }
          >
            <NumInput value={swRate} onChange={setSwRate} placeholder="e.g. 95" />
          </Field>
        </div>
        <CoatingSection
          coating={swCoating} setCoating={setSwCoating}
          coatingRate={swCoatingRate} setCoatingRate={setSwCoatingRate}
        />
        <div className="sect-divider">Printing</div>
        <PrintSection
          print={swPrint} setPrint={setSwPrint}
          colors={swColors} setColors={setSwColors}
          rate1={swRate1} setRate1={setSwRate1}
          rateN={swRateN} setRateN={setSwRateN}
        />
      </div>

      <div className="card">
        <div className="card-title">Bottom disc</div>
        <div className="soft-note" style={{ marginBottom: ".75rem" }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>Standard spec — not editable</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            230 GSM + 15g PE + 15g PE · Roll width: 75mm · PE adds 2PE = ₹{COATING_RATES["2PE"]}/kg on top of baseboard
          </div>
        </div>
        <div className="field-row">
          <Field
            label="Baseboard brand (from RM Master)"
            note={
              btPaperOpts.length === 0
                ? "No 230 GSM paper in RM Master — enter rate manually"
                : btPaperId && masterPapers.find((x) => x.id === btPaperId)?.effectiveRate == null
                ? "Rate not set in RM Master — enter manually or update Airtable"
                : ""
            }
          >
            <select value={btPaperId} onChange={(e) => applyBtPaper(e.target.value)} disabled={btPaperOpts.length === 0}>
              <option value="">{btPaperOpts.length ? "Select brand…" : "—"}</option>
              {btPaperOpts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.materialName}{p.effectiveRate != null ? ` · ₹${p.effectiveRate}/kg` : " · rate TBD"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Baseboard rate (₹/kg)" note="PE coating (₹26/kg for 2PE) is added automatically">
            <NumInput value={btRate} onChange={setBtRate} placeholder="e.g. 90" />
          </Field>
        </div>
      </div>

      {isDW && (
        <div className="card">
          <div className="card-title">Outer wall</div>
          <div className="field-row">
            <Field label="Outer fan GSM" badge={presetLocked && ofSpec ? `Preset: ${ofSpec.gsm}` : ""}>
              <div className="chips" style={{ marginTop: 2 }}>
                {OUTER_GSM_OPTS.map((g) => (
                  <Chip key={g} label={String(g)} selected={String(ofGSM) === String(g)} onClick={() => setOfGSM(String(g))} />
                ))}
              </div>
            </Field>
          </div>
          <div className="field-row">
            <Field
              label="Paper brand (from RM Master)"
              note={
                ofGSM && ofPaperOpts.length === 0
                  ? `No paper at ${ofGSM} GSM in RM Master — enter rate manually`
                  : ofPaperId && masterPapers.find((x) => x.id === ofPaperId)?.effectiveRate == null
                  ? "Rate not set in RM Master — enter manually or update Airtable"
                  : ""
              }
            >
              <select value={ofPaperId} onChange={(e) => applyOfPaper(e.target.value)} disabled={!ofGSM || ofPaperOpts.length === 0}>
                <option value="">{ofPaperOpts.length ? "Select brand…" : "Pick GSM first"}</option>
                {ofPaperOpts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.materialName}{p.effectiveRate != null ? ` · ₹${p.effectiveRate}/kg` : " · rate TBD"}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Outer fan paper rate (₹/kg)"
              note={ofDims && size ? `Dims: ${ofDims[0]}×${ofDims[1]}mm · ${ofFans} fans` : ""}
            >
              <NumInput value={ofRate} onChange={setOfRate} placeholder="e.g. 85" />
            </Field>
          </div>
          <CoatingSection
            coating={ofCoating} setCoating={setOfCoating}
            coatingRate={ofCoatingRate} setCoatingRate={setOfCoatingRate}
          />
          <div className="sect-divider">Printing</div>
          <PrintSection
            print={ofPrint} setPrint={setOfPrint}
            colors={ofColors} setColors={setOfColors}
            rate1={ofRate1} setRate1={setOfRate1}
            rateN={ofRateN} setRateN={setOfRateN}
          />
        </div>
      )}

      <div className="card">
        <div className="card-title">Conversion &amp; packing</div>

        <div className="soft-note" style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            {cupType && size ? `${cupType} · ${size}` : "Pick wall type and size above"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            Conversion: <strong>₹{autoConv != null ? autoConv.toFixed(4) : "—"}/cup</strong>
            {" · "}Packing: <strong>₹{autoPack != null ? autoPack.total.toFixed(4) : "—"}/cup</strong>
            {" · "}Glue: <strong>₹{autoGlue != null ? autoGlue.toFixed(4) : "—"}/cup</strong>
            <br />
            <span style={{ color: "var(--text-tertiary)" }}>
              {(convOverride || packOverride) ? "Manual override in effect — clear fields below to re-auto-fill." : "Auto-filled from factory defaults. Tune only if needed."}
            </span>
          </div>
        </div>

        <div className="soft-note">
          <button className="expander-btn" onClick={() => setShowConvCalc((v) => !v)}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Advanced: edit factory overheads, fleet &amp; packing materials</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {showConvCalc ? "▲ hide" : "▼ expand"}
            </span>
          </button>
          {showConvCalc && (() => {
            const components = {
              salary: parseFloat(convSalary) || 0,
              electricity: parseFloat(convElec) || 0,
              rent: parseFloat(convRent) || 0,
              maintenance: parseFloat(convMaint) || 0,
              qc: parseFloat(convQc) || 0,
            };
            const total = Object.values(components).reduce((s, v) => s + v, 0);
            const hours = parseFloat(convHours) || 0;
            const cpmBySize = { "8oz": parseFloat(cpm8) || 0, "12oz": parseFloat(cpm12) || 0, "16oz": parseFloat(cpm16) || 0, "20oz": parseFloat(cpm20) || 0 };
            const nSw = parseFloat(machineCountSw) || 0;
            const nDw = parseFloat(machineCountDw) || 0;
            const totalMachines = nSw + nDw;
            const swCapPerMonth = nSw * hours * 60 * (parseFloat(cpm8) || 0);
            const dwCapPerMonth = nDw * hours * 60 * Math.round((parseFloat(cpm8) || 0) * DW_SPEED_FACTOR);
            const perCupForSize = (sz) => computeConversionCostPerCup({ size: sz, wallType: cupType, components, monthlyHours: hours, cpmBySize, machineCountSw: nSw, machineCountDw: nDw });
            const selectedPerCup = size ? perCupForSize(size) : null;
            const selectedCpm = size ? effectiveCpm(size, cupType, cpmBySize) : null;
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.7 }}>
                  Cost / cup = <strong>Σ monthly overheads ÷ (machines × hours × 60 × cpm)</strong>. Overheads are pooled across the fleet ({nSw} SW + {nDw} DW = {totalMachines} machines). Double Wall / Ripple runs at {Math.round(DW_SPEED_FACTOR * 100)}% of single-wall speed.
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", margin: "8px 0 6px" }}>Monthly overheads</div>
                <div className="two-col" style={{ marginBottom: 8 }}>
                  <Field label="Salary (₹)" note="2 ops × ₹70k + 3 labour × ₹15k">
                    <NumInput value={convSalary} onChange={setConvSalary} placeholder="185000" />
                  </Field>
                  <Field label="Electricity (₹)" note="Torrent Power, Bhiwandi">
                    <NumInput value={convElec} onChange={setConvElec} placeholder="100000" />
                  </Field>
                  <Field label="Rent (₹)" note="7,500 sq ft × ₹15/sq ft">
                    <NumInput value={convRent} onChange={setConvRent} placeholder="112500" />
                  </Field>
                  <Field label="Maintenance (₹)" note="Dies, heating, grease, spares">
                    <NumInput value={convMaint} onChange={setConvMaint} placeholder="15000" />
                  </Field>
                  <Field label="QC / wastage buffer (₹)" note="Incoming QC, wastage provision">
                    <NumInput value={convQc} onChange={setConvQc} placeholder="10000" />
                  </Field>
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", margin: "8px 0 6px" }}>Fleet &amp; machine speed</div>
                <div className="two-col" style={{ marginBottom: 8 }}>
                  <Field label="Single-wall machines" note="Count of SW cup formers in the fleet">
                    <NumInput value={machineCountSw} onChange={setMachineCountSw} placeholder="1" />
                  </Field>
                  <Field label="Double-wall machines" note="DW formers (Ripple runs on these too)">
                    <NumInput value={machineCountDw} onChange={setMachineCountDw} placeholder="2" />
                  </Field>
                  <Field label="Production hours / month / machine" note="Default: 2 shifts (9am–7pm + 7pm–5am) × 25 days = 500 hrs. Drop to 300 for single-shift weeks.">
                    <NumInput value={convHours} onChange={setConvHours} placeholder="500" />
                  </Field>
                  <Field label="8oz cups / min (SW)">
                    <NumInput value={cpm8} onChange={setCpm8} placeholder="70" />
                  </Field>
                  <Field label="12oz cups / min (SW)">
                    <NumInput value={cpm12} onChange={setCpm12} placeholder="70" />
                  </Field>
                  <Field label="16oz cups / min (SW)">
                    <NumInput value={cpm16} onChange={setCpm16} placeholder="70" />
                  </Field>
                  <Field label="20oz cups / min (SW)">
                    <NumInput value={cpm20} onChange={setCpm20} placeholder="70" />
                  </Field>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>
                  Fleet capacity @ {hours || 0} hrs/machine · 8oz baseline cpm: <strong>{(swCapPerMonth + dwCapPerMonth).toLocaleString("en-IN")}</strong> cups/month ({nSw} SW × {swCapPerMonth.toLocaleString("en-IN")} + {nDw} DW × {(dwCapPerMonth / Math.max(nDw, 1)).toLocaleString("en-IN")})
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>
                  Cost / cup by size (current wall type: {cupType || "—"}):
                  {" "}8oz ₹{perCupForSize("8oz").toFixed(4)} · 12oz ₹{perCupForSize("12oz").toFixed(4)} · 16oz ₹{perCupForSize("16oz").toFixed(4)} · 20oz ₹{perCupForSize("20oz").toFixed(4)}
                </div>
                {total > 0 && size && selectedPerCup != null && (
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", borderTop: "0.5px solid var(--border-tertiary)", paddingTop: 8 }}>
                    ₹{total.toLocaleString()} / month · {size} @ {selectedCpm} cpm → ₹{selectedPerCup.toFixed(4)}/cup (auto-applied)
                  </div>
                )}
              </div>
            );
          })()}

          {showConvCalc && (() => {
            const materials = {
              poly: parseFloat(packPoly) || 0,
              carton: parseFloat(packCarton) || 0,
              tape: parseFloat(packTape) || 0,
              label: parseFloat(packLabel) || 0,
            };
            const hours = parseFloat(convHours) || 0;
            const cpmBySize = { "8oz": parseFloat(cpm8) || 0, "12oz": parseFloat(cpm12) || 0, "16oz": parseFloat(cpm16) || 0, "20oz": parseFloat(cpm20) || 0 };
            const nSw = parseFloat(machineCountSw) || 0;
            const nDw = parseFloat(machineCountDw) || 0;
            const resolvedCasePack = parseInt(casePack) || CASE_PACK_DEFAULTS[cupType]?.[size] || 0;
            const breakdown = (sz) => computePackingCostPerCup({
              size: sz, wallType: cupType, casePack: resolvedCasePack,
              materials, monthlyLabour: parseFloat(packLabour) || 0,
              monthlyHours: hours, cpmBySize,
              machineCountSw: nSw, machineCountDw: nDw,
            });
            const selected = size && resolvedCasePack ? breakdown(size) : null;
            const materialTotal = Object.values(materials).reduce((s, v) => s + v, 0);
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.7 }}>
                  Per-cup packing = <strong>Σ (materials ÷ case pack) + (monthly labour ÷ fleet cups/month)</strong>. DW 500/case absorbs 2× the material cost per cup vs SW 1000/case.
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", margin: "8px 0 6px" }}>Materials (per case)</div>
                <div className="two-col" style={{ marginBottom: 8 }}>
                  <Field label="Poly (₹/case)" note="Food-grade poly sleeve / liner">
                    <NumInput value={packPoly} onChange={setPackPoly} placeholder="1.25" step="0.01" />
                  </Field>
                  <Field label="Carton (₹/case)" note="5-ply brown corrugated box">
                    <NumInput value={packCarton} onChange={setPackCarton} placeholder="70" step="0.01" />
                  </Field>
                  <Field label="Tape / strapping (₹/case)">
                    <NumInput value={packTape} onChange={setPackTape} placeholder="3" step="0.01" />
                  </Field>
                  <Field label="Label / sticker (₹/case)">
                    <NumInput value={packLabel} onChange={setPackLabel} placeholder="1" step="0.01" />
                  </Field>
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", margin: "8px 0 6px" }}>Labour (monthly)</div>
                <div className="two-col" style={{ marginBottom: 8 }}>
                  <Field label="Packing labour (₹/month)" note="Pooled across fleet output, like conversion labour">
                    <NumInput value={packLabour} onChange={setPackLabour} placeholder="30000" />
                  </Field>
                </div>
                {resolvedCasePack > 0 ? (
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>
                    Material ₹{materialTotal.toFixed(2)}/case ÷ {resolvedCasePack} cups ={" "}
                    ₹{(materialTotal / resolvedCasePack).toFixed(4)}/cup.{selected && (
                      <> Labour: ₹{selected.labourPerCup.toFixed(4)}/cup ({size} @ effective cpm).</>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>
                    Pick a size / set a case pack to preview per-cup packing.
                  </div>
                )}
                {selected && (
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", borderTop: "0.5px solid var(--border-tertiary)", paddingTop: 8 }}>
                    Material + labour = ₹{selected.total.toFixed(4)}/cup (auto-applied)
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <div className="two-col">
          <Field label="Conversion cost (₹/cup)" note={convOverride ? "Manual — clear to re-auto" : "Auto from fleet settings"}>
            <NumInput
              value={conv}
              onChange={(v) => { setConv(v); setConvOverride(v !== "" && (!autoConv || v !== autoConv.toFixed(4))); }}
              placeholder="auto"
              step="0.0001"
            />
          </Field>
          <Field label="Packing cost (₹/cup)" note={packOverride ? "Manual — clear to re-auto" : "Auto from materials + labour"}>
            <NumInput
              value={pack}
              onChange={(v) => { setPack(v); setPackOverride(v !== "" && (!autoPack || v !== autoPack.total.toFixed(4))); }}
              placeholder="auto"
              step="0.0001"
            />
          </Field>
          <Field label="Other cost (₹/cup)">
            <NumInput value={otherCost} onChange={setOtherCost} placeholder="e.g. 0.00" step="0.01" />
          </Field>
        </div>
      </div>

      <button className="calc-btn" onClick={runCalculate}>Calculate rate</button>
      {result && (
        <button className="reset-btn" onClick={() => setResult(null)}>Clear result</button>
      )}
      </div>

      <div className="admin-right">
      {!result && (
        <div className="card placeholder">
          Pick the specs on the left and click <strong>Calculate rate</strong> — the breakdown will appear here.
        </div>
      )}
      {result && (
        <div className="result-card">
          <div style={{ padding: "1rem 1.25rem", borderBottom: "0.5px solid var(--border-tertiary)" }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 2 }}>
              {sku || "—"} · {size} {cupVariant} · Qty {qty ? parseInt(qty).toLocaleString() : "—"}
              {td && bd && h ? ` · Cup: ${td}×${bd}×${h}mm` : ""}
              {boxL && boxW && boxH ? ` · Box: ${boxL}×${boxW}×${boxH}mm` : ""}
            </div>
            {(() => {
              const qtyNum = qty ? parseInt(qty) : 0;
              const cpNum = parseInt(casePack) || 0;
              const orderTotal = qtyNum > 0 ? result.sp * qtyNum : 0;
              return (
                <>
                  <div style={{
                    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                    borderRadius: 16,
                    padding: "1.75rem 2rem",
                    color: "#fff",
                    marginTop: ".75rem",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  }}>
                    {(() => {
                      const tier = tierFromMargin(result.mp);
                      if (!tier) return null;
                      return (
                        <div style={{ marginBottom: "1rem" }}>
                          <span style={{
                            display: "inline-block",
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: ".04em",
                            textTransform: "uppercase",
                            background: "rgba(255,255,255,0.18)",
                            border: "1px solid rgba(255,255,255,0.25)",
                            color: "#fff",
                            padding: "3px 10px",
                            borderRadius: 999,
                          }}>{tier} · {result.mp}% margin</span>
                        </div>
                      );
                    })()}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#bfdbfe", marginBottom: 8, fontWeight: 400 }}>Selling Price / cup</div>
                        <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{f2(result.sp)}</div>
                        <div style={{ fontSize: 12, color: "#bfdbfe", marginTop: 6 }}>${(result.sp / USD_RATE).toFixed(4)} @ ₹{USD_RATE}/$</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, color: "#bfdbfe", marginBottom: 8, fontWeight: 400 }}>
                          Cost / Case ({cpNum || "—"})
                        </div>
                        <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{f2(result.spCase)}</div>
                        <div style={{ fontSize: 12, color: "#bfdbfe", marginTop: 6 }}>${(result.spCase / USD_RATE).toFixed(2)} @ ₹{USD_RATE}/$</div>
                      </div>
                    </div>
                    <div style={{
                      marginTop: "1.5rem",
                      paddingTop: "1.5rem",
                      borderTop: "1px solid rgba(255,255,255,0.2)",
                    }}>
                      <div style={{ fontSize: 13, color: "#bfdbfe", marginBottom: 8, fontWeight: 400 }}>
                        Order Total — {qtyNum ? qtyNum.toLocaleString("en-IN") + " cups" : "—"}
                      </div>
                      <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>
                        ₹{orderTotal > 0 ? orderTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                      </div>
                      {orderTotal > 0 && (
                        <div style={{ fontSize: 12, color: "#bfdbfe", marginTop: 6 }}>${(orderTotal / USD_RATE).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @ ₹{USD_RATE}/$</div>
                      )}
                    </div>
                  </div>
                  <div style={{
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    borderRadius: 16,
                    padding: "1.5rem 2rem",
                    color: "#fff",
                    marginTop: ".75rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "2rem",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "#fecaca", marginBottom: 8, fontWeight: 400 }}>Manufacturing Cost</div>
                      <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{f4(result.mfg)}</div>
                    </div>
                    <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.25)" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "#fecaca", marginBottom: 8, fontWeight: 400 }}>Profit ({result.mp}%)</div>
                      <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{f4(result.marginAmt)}</div>
                    </div>
                  </div>
                </>
              );
            })()}
            <div className="weight-box">
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>
                  Cup weight <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>(corr. factor 0.908)</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 500 }}>{result.cupWeightG.toFixed(2)} g</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
                <div>Sidewall: {result.swWeightG.toFixed(2)} g</div>
                <div>Bottom: {result.btWeightG.toFixed(2)} g</div>
                {isDW && <div>Outer fan: {result.ofWeightG.toFixed(2)} g</div>}
              </div>
            </div>
          </div>
          <div style={{ padding: "0 1.25rem" }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", padding: ".75rem 0 .25rem" }}>
              Cost breakdown / cup
            </div>
            {[
              ["Sidewall RM", result.swRM],
              ["Sidewall print", result.swPrintCost],
              ...(isDW ? [["Outer fan (RM + print)", result.ofTotal]] : []),
              ["Bottom disc", result.btCost],
              ["Conversion", result.conv],
              ["Packing", result.pack],
              ["Glue", result.glue],
              ["Other", result.other],
            ].map(([lbl, val]) => (
              <div className="breakdown-row" key={lbl}>
                <span className="lbl">{lbl}</span>
                <span className="val">{f4(val)}</span>
              </div>
            ))}
            <div className="breakdown-row total">
              <span className="lbl">Mfg cost / cup</span>
              <span className="val">{f4(result.mfg)}</span>
            </div>
            <div className="breakdown-row margin-row">
              <span className="lbl">Factory margin ({result.mp}%)</span>
              <span className="val">{f4(result.marginAmt)}</span>
            </div>
            <div className="breakdown-row total" style={{ marginBottom: ".75rem" }}>
              <span className="lbl" style={{ color: "var(--accent-dark)" }}>Factory SP / cup</span>
              <span className="val" style={{ color: "var(--accent-dark)" }}>{f2(result.sp)}</span>
            </div>
          </div>
          {(() => {
            const plateDie = (result.swPlate || 0) + (result.swDie || 0) + (result.ofPlate || 0) + (result.ofDie || 0);
            // Production-run setup (changeover, QC, startup wastage) is
            // baked into the rate so the ladder moves even on plain orders.
            const oneTime = plateDie + ORDER_RUN_SETUP_DEFAULT;
            const cp = parseInt(casePack) || 1;
            const mp = parseFloat(margin) || 0;
            const tiers = [25000, 50000, 100000, 250000, 500000];
            const currentQty = parseInt(qty) || 0;
            const rows = tiers.map((q) => {
              const oneTimePerCup = q > 0 ? oneTime / q : 0;
              const mfgPerCup = result.mfg + oneTimePerCup;
              const marginAmt = mp >= 100 ? 0 : (mfgPerCup * mp) / (100 - mp);
              const ratePerCup = mfgPerCup + marginAmt;
              const ratePerCase = ratePerCup * cp;
              const orderTotal = ratePerCup * q;
              return { qty: q, ratePerCup, ratePerCase, orderTotal };
            });
            return (
              <div style={{ padding: "0 1.25rem 1rem" }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", padding: ".75rem 0 .5rem" }}>
                  Cost ladder by quantity
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                      <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500 }}>Order Qty</th>
                      <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500 }}>Rate / Cup</th>
                      <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500 }}>Rate / Case</th>
                      <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500 }}>Order Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const selected = r.qty === currentQty;
                      return (
                        <tr key={r.qty} style={{ borderBottom: "0.5px solid var(--border-tertiary)", background: selected ? "var(--accent-bg)" : "transparent" }}>
                          <td style={{ padding: "7px 0", fontWeight: selected ? 600 : 400 }}>{r.qty.toLocaleString()}</td>
                          <td style={{ padding: "7px 0", textAlign: "right", fontWeight: selected ? 600 : 400 }}>₹{r.ratePerCup.toFixed(2)}</td>
                          <td style={{ padding: "7px 0", textAlign: "right" }}>₹{r.ratePerCase.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ padding: "7px 0", textAlign: "right", fontWeight: selected ? 600 : 400 }}>₹{Math.round(r.orderTotal).toLocaleString("en-IN")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
                  Production-run setup (₹{ORDER_RUN_SETUP_DEFAULT.toLocaleString()}){plateDie > 0 ? ` + plate/die (₹${plateDie.toLocaleString()})` : ""} amortised over each tier — rate drops at higher volumes.
                </p>
              </div>
            );
          })()}
          {(() => {
            const totalCases = qty && casePack ? Math.ceil(parseInt(qty) / parseInt(casePack)) : 0;
            const m = cartonMetrics(boxL, boxW, boxH, totalCases);
            if (!m) return null;
            return (
              <div style={{ padding: "0 1.25rem 1rem" }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", padding: ".5rem 0 .5rem" }}>
                  Logistics
                </div>
                <div className="spec-row">
                  <div className="spec-cell">
                    <div className="sc-label">CBM / box</div>
                    <div className="sc-val">{m.cbm.toFixed(3)} m³</div>
                  </div>
                  <div className="spec-cell">
                    <div className="sc-label">Boxes / pallet</div>
                    <div className="sc-val">{m.boxesPerPallet > 0 ? m.boxesPerPallet : "—"}</div>
                  </div>
                  <div className="spec-cell">
                    <div className="sc-label">Pallets for order</div>
                    <div className="sc-val">{m.palletCount > 0 ? m.palletCount : "—"}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  Pallet footprint {PALLET.L}×{PALLET.W} mm · max stack {PALLET.maxH} mm
                </div>
              </div>
            );
          })()}
          {(result.swPlate || result.swDie || result.ofPlate || result.ofDie) && (
            <div className="memo-box">
              <div className="memo-title">One-time costs — bill separately</div>
              {result.swPlate > 0 && <div>Sidewall Flexo plates: ₹{result.swPlate.toLocaleString()}</div>}
              {result.swDie > 0 && <div>Sidewall Offset dies: ₹{result.swDie.toLocaleString()}</div>}
              {result.ofPlate > 0 && <div>Outer fan Flexo plates: ₹{result.ofPlate.toLocaleString()}</div>}
              {result.ofDie > 0 && <div>Outer fan Offset dies: ₹{result.ofDie.toLocaleString()}</div>}
            </div>
          )}
          <div style={{ padding: "1rem 1.25rem", borderTop: "0.5px solid var(--border-tertiary)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="ghost-btn"
              style={{ flex: "1 1 120px", padding: "9px 12px", fontSize: 13 }}
              onClick={() => downloadAdminCsv({ cupVariant, size, sku, qty, casePack, td, bd, h, boxL, boxW, boxH, swGSM, ofGSM, isDW, result })}
            >
              Download Excel (.csv)
            </button>
            <button
              type="button"
              className="ghost-btn"
              style={{ flex: "1 1 120px", padding: "9px 12px", fontSize: 13 }}
              title="Internal review — full cost breakdown, weights, mfg cost, margin"
              onClick={() => openAdminPrintView({ cupVariant, size, sku, qty, casePack, td, bd, h, boxL, boxW, boxH, swGSM, ofGSM, isDW, result, quoteRef })}
            >
              Admin PDF
            </button>
            <button
              type="button"
              className="ghost-btn"
              style={{ flex: "1 1 120px", padding: "9px 12px", fontSize: 13 }}
              title="Customer-facing — only the rate, specs, and cost ladder; no internal cost breakdown"
              onClick={() => openClientCupPrintView({ cupVariant, size, sku, qty, casePack, td, bd, h, boxL, boxW, boxH, swGSM, ofGSM, swCoating, swPrint, swColors, isDW, result, quoteRef })}
            >
              Customer PDF
            </button>
            <button
              type="button"
              disabled={savingQuote}
              style={{ flex: "1 1 120px", padding: "9px 12px", fontSize: 13, background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 500 }}
              onClick={saveQuote}
            >
              {savingQuote ? "Saving…" : "Save quote"}
            </button>
          </div>
          {saveStatus && (
            <div style={{ padding: "0 1.25rem 1rem", fontSize: 12, color: saveStatus.ok ? "var(--text-success)" : "#dc2626" }}>
              {saveStatus.msg}
            </div>
          )}
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
