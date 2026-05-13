// Express Ship quote → PDF. Builds an HTML string, opens it in a new
// window, and auto-triggers the browser's print dialog so the user picks
// "Save as PDF". No external libraries.
//
// Visual language matches Aeros's monochrome brand — no royal blue or
// gold accents. Big number block at top reads as per-unit selling USD.

const usd = (n, d = 2) =>
  Number.isFinite(n)
    ? "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "—";
const inr = (n, d = 0) =>
  Number.isFinite(n)
    ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "—";
const num = (n, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

const ORIGIN_LABEL = { IN: "India", CN: "China" };

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function exportExpressShipPDF({ form, result }) {
  if (!form || !result || result.error) return;

  const date = new Date().toISOString().split("T")[0];
  const product = form.product || {};
  const s = result.shipmentSpecs;
  const f = result.freight;
  const d = result.duty;
  const p = result.pricing;
  const t = result.transit;

  const warningsBlock = (result.warnings && result.warnings.length)
    ? `
      <h2>Notes</h2>
      <ul class="warn">
        ${result.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}
      </ul>`
    : "";

  const fuelLine = f.fuelPct
    ? `<span class="sub">includes ${f.fuelPct}% fuel</span>`
    : "";

  const rateLine = f.rateUnit === "perKg"
    ? `${num(f.rateInput)} ${f.rateCurrency} / kg · ${num(f.billedOnKg)} kg billed`
    : `${num(f.rateInput)} ${f.rateCurrency} (flat)`;

  const dutyRows = [
    `<tr><td>MFN (HTSUS ${esc(d.htsus || "—")})</td><td class="r">${(d.mfnPct * 100).toFixed(2)}%</td><td class="r">${usd(d.mfnUsd)}</td></tr>`,
    d.section301Pct > 0
      ? `<tr><td>Section 301 (China-origin)</td><td class="r">${(d.section301Pct * 100).toFixed(2)}%</td><td class="r">${usd(d.s301Usd)}</td></tr>`
      : "",
    d.section122Applied
      ? `<tr><td>Section 122 (reciprocal)</td><td class="r">${(d.section122Pct * 100).toFixed(2)}%</td><td class="r">${usd(d.s122Usd)}</td></tr>`
      : "",
    `<tr><td>MPF${d.mpfFloored ? " (min floor)" : d.mpfCapped ? " (max cap)" : ""}</td><td class="r">—</td><td class="r">${usd(d.mpfUsd)}</td></tr>`,
  ].filter(Boolean).join("");

  const quoteRef = esc(form.quoteRef || `EXP ${date} — ${product.sku || ""}`);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Aeros Express Ship Quote — ${quoteRef}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #111; margin: 32px; max-width: 760px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.3px; }
  .muted { color: #6b7280; font-size: 12px; }
  .hero { background: #111; color: #fff; padding: 22px 24px; border-radius: 12px; margin: 18px 0; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  .hero .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; opacity: 0.7; }
  .hero .big { font-size: 36px; font-weight: 700; margin-top: 4px; line-height: 1; }
  .hero .small { font-size: 13px; opacity: 0.85; margin-top: 6px; }
  .hero .side { text-align: right; font-size: 12px; opacity: 0.8; }
  .hero .side strong { display: block; font-size: 14px; font-weight: 600; color: #fff; margin-top: 2px; }
  h2 { font-size: 13px; margin: 22px 0 8px; color: #111; text-transform: uppercase; letter-spacing: 0.6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12.5px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #f1f1f1; }
  th { font-size: 10.5px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; font-weight: 600; }
  td.r, th.r { text-align: right; }
  tr.highlight td { background: #f5f5f5; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 6px 0 8px; }
  .grid .k { font-size: 10.5px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  .grid .v { font-size: 15px; font-weight: 600; margin-top: 2px; }
  .grid .v .sub { display: block; font-size: 11px; font-weight: 400; color: #6b7280; margin-top: 2px; letter-spacing: 0; }
  .warn { font-size: 11.5px; color: #92400e; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; list-style-position: inside; }
  .warn li { padding: 2px 0; }
  .sub { font-size: 11px; color: #6b7280; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10.5px; color: #6b7280; line-height: 1.5; }
  @media print { body { margin: 18px; max-width: none; } .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>

<h1>Aeros Express Ship Quote</h1>
<div class="muted">
  Ref <strong>${quoteRef}</strong> · Mumbai, India · ${date}
</div>

<div class="hero">
  <div>
    <div class="label">Per-unit selling, landed door-to-door</div>
    <div class="big">${usd(p.perUnitSellingUsd, 4)}</div>
    <div class="small">${inr(p.perUnitSellingInr, 2)} · landed ${usd(p.perUnitLandedUsd, 4)} · ${p.marginPct}% margin</div>
  </div>
  <div class="side">
    <div>${esc(ORIGIN_LABEL[result.origin] || result.origin)} → USA</div>
    <strong>${esc(product.sku || "—")}</strong>
    ${product.productName ? `<div>${esc(product.productName)}</div>` : ""}
    <div style="margin-top:8px;">Qty <strong>${num(p.qty, 0)} pcs</strong></div>
  </div>
</div>

<h2>Route &amp; transit</h2>
<div class="grid">
  <div><div class="k">Origin</div><div class="v">${esc(ORIGIN_LABEL[result.origin] || result.origin)}${form.originPostcode ? `<span class="sub">PIN ${esc(form.originPostcode)}</span>` : ""}</div></div>
  <div><div class="k">Destination ZIP</div><div class="v">${esc(t.destinationZip || "—")}${t.coast ? `<span class="sub">${esc(t.coast)} coast</span>` : ""}</div></div>
  <div><div class="k">Dispatch → Delivery</div><div class="v">${esc(t.dispatchDate || "—")}${t.deliveryDate ? `<span class="sub">→ ${esc(t.deliveryDate)}${t.days != null ? ` · ${t.days} bd` : ""}</span>` : ""}</div></div>
</div>

<h2>Product</h2>
<table>
  <tr><td>SKU</td><td class="r">${esc(product.sku || "—")}</td></tr>
  <tr><td>Name</td><td class="r">${esc(product.productName || "—")}</td></tr>
  <tr><td>Category</td><td class="r">${esc(product.category || "—")}</td></tr>
  ${product.sizeVolume ? `<tr><td>Size</td><td class="r">${esc(product.sizeVolume)}</td></tr>` : ""}
  <tr><td>Country of origin</td><td class="r">${esc(product.countryOfOrigin || "—")}</td></tr>
  <tr><td>HTSUS</td><td class="r">${esc(d.htsus || "—")}</td></tr>
</table>

<h2>Shipment</h2>
<table>
  <tr><td>Pieces / cartons / pallets</td><td class="r">${num(s.qtyPcs, 0)} / ${num(s.cartons, 0)} / ${num(s.pallets, 0)}</td></tr>
  <tr><td>Carton dims</td><td class="r">${num(s.cartonDimsCm.L_cm, 1)} × ${num(s.cartonDimsCm.W_cm, 1)} × ${num(s.cartonDimsCm.H_cm, 1)} cm</td></tr>
  <tr><td>Cartons per pallet</td><td class="r">${s.cartonsPerPallet} (${s.perLayer} × ${s.layersPerPallet})</td></tr>
  <tr><td>Actual weight</td><td class="r">${num(s.actualWeightKg)} kg</td></tr>
  <tr><td>Dim weight</td><td class="r">${num(s.dimWeightKg)} kg</td></tr>
  <tr class="highlight"><td>Chargeable weight</td><td class="r">${num(s.chargeableKg)} kg</td></tr>
  <tr><td>Cargo volume</td><td class="r">${num(s.cargoCBM, 3)} CBM</td></tr>
</table>

<h2>Cost breakdown</h2>
<table>
  <thead><tr><th>Component</th><th class="r">Rate</th><th class="r">USD</th></tr></thead>
  <tbody>
    <tr><td>Product cost (FOB)</td><td class="r">${inr(form.exFactoryInrPerUnit)}/pc</td><td class="r">${usd(p.productUsd)}</td></tr>
    <tr><td>DHL Express freight</td><td class="r">${esc(rateLine)} ${fuelLine}</td><td class="r">${usd(p.freightUsd)}</td></tr>
    ${dutyRows}
    <tr class="highlight"><td>Landed total</td><td class="r"></td><td class="r">${usd(p.totalLandedUsd)}</td></tr>
    <tr><td>Margin (${p.marginPct}%)</td><td class="r"></td><td class="r">${usd(p.marginUsd)}</td></tr>
    <tr class="highlight"><td>Selling total</td><td class="r"></td><td class="r">${usd(p.totalSellingUsd)}</td></tr>
    <tr><td>Selling total (₹)</td><td class="r"></td><td class="r">${inr(p.totalSellingInr)}</td></tr>
  </tbody>
</table>

<h2>Per unit</h2>
<div class="grid">
  <div><div class="k">Landed (USD)</div><div class="v">${usd(p.perUnitLandedUsd, 4)}</div></div>
  <div><div class="k">Selling (USD)</div><div class="v">${usd(p.perUnitSellingUsd, 4)}</div></div>
  <div><div class="k">Selling (₹)</div><div class="v">${inr(p.perUnitSellingInr, 2)}</div></div>
</div>

${warningsBlock}

<div class="footer">
  Generated ${date} · Aeros (Boson Machines OPC Pvt Ltd), Mumbai, India · Express air via DHL.<br/>
  Indicative landed-price estimate. Freight rates are subject to confirmation by DHL on the dispatch
  date; duty regimes (MFN, Section 301, Section 122, MPF) are subject to CBP changes and should
  be re-verified before customs entry.
</div>

<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Popup blocked — please allow popups to export PDFs.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
