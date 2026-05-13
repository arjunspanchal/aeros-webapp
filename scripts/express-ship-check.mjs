// Self-check harness for lib/factoryos/express-ship-calc.js. Runs 4 realistic
// fixtures and prints a one-page breakdown each. Eyeball the numbers before
// the UI layer goes in.
//
// Usage:  node scripts/express-ship-check.mjs
//
// Exits non-zero if any fixture fails a hard sanity check (cartons > 0,
// chargeable kg > 0, per-unit USD > 0). Range expectations from the spec
// are advisory — printed as ✓ / ⚠ next to each.

import {
  calcExpressShip,
  defaultHtsusForCategory,
} from "../lib/factoryos/express-ship-calc.js";

// Real master_products rows (snapshotted 2026-05-13 from Supabase). Avoids
// a DB call in this harness so we can run offline.
const MASTERS = {
  "PC-SW-009": {
    sku: "PC-SW-009",
    productName: "8oz Normal Single Wall Paper Cup",
    category: "Paper Cups",
    htsCodeUs: null,
    countryOfOrigin: "India",
    cartonDimensions: "415 × 330 × 390",
    unitsPerCase: 1000,
    casesPerPallet: 18,
    grossWeightKg: null,          // exercises item_weight_g fallback
    itemWeightG: 7,
    heightMm: 92,
  },
  "PC-DW-8": {
    sku: "PC-DW-8",
    productName: "8oz Normal Double Wall Paper Cup",
    category: "Paper Cups",
    htsCodeUs: null,
    countryOfOrigin: "India",
    cartonDimensions: "415 × 330 × 500",
    unitsPerCase: 500,
    casesPerPallet: 12,
    grossWeightKg: null,
    itemWeightG: 11.5,
    heightMm: 93,
  },
  "PET-CUP-003": {
    sku: "PET-CUP-003",
    productName: "16oz PET Cup (98mm TD)",
    category: "PET Cups",
    htsCodeUs: null,
    countryOfOrigin: "India",
    cartonDimensions: "495 × 430 × 395",
    unitsPerCase: 1000,
    casesPerPallet: null,
    grossWeightKg: null,
    itemWeightG: 14,
    heightMm: null,
  },
  "LID-PP-CN": {
    // Synthetic China-origin PP lid fixture. Real master row would be
    // sourced from a Chinese supplier — schema is identical.
    sku: "LID-PP-CN",
    productName: "98mm PP Sipper Lid (China-sourced)",
    category: "Lids",
    htsCodeUs: "3923.50.00.00",
    countryOfOrigin: "China",
    cartonDimensions: "560 × 360 × 460",
    unitsPerCase: 2000,
    casesPerPallet: null,
    grossWeightKg: 12.5,
    itemWeightG: 2.5,
    heightMm: null,
  },
};

function buildInput({ sku, qtyMode = "pcs", qtyPcs, palletsRequested, dispatchDate, origin = "IN", exFactoryInrPerUnit, marginPct = 30 }) {
  const master = MASTERS[sku];
  return {
    origin,
    originPostcode: origin === "CN" ? "518000" : "421302",
    destinationZip: "10001",        // NYC, East-coast bucket
    dispatchDate,
    fxRate: 83.5,
    dhlRate: 450,                    // ₹/kg (Express Parcel SME tier)
    dhlRateCurrency: "INR",
    dhlRateUnit: "perKg",
    fuelPct: 0,
    master,
    qtyMode,
    qtyPcs,
    palletsRequested,
    exFactoryInrPerUnit,
    marginPct,
    htsus: master.htsCodeUs || defaultHtsusForCategory(master.category),
  };
}

function fmt(n, d = 2) {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
}

function badge(ok) {
  return ok ? "✓" : "⚠";
}

function printResult(label, input, result, checks = []) {
  console.log("");
  console.log("─".repeat(78));
  console.log(label);
  console.log("─".repeat(78));
  if (result.error) {
    console.log("ERROR:", result.error);
    if (result.warnings?.length) console.log("warnings:", result.warnings);
    return false;
  }
  const s = result.shipmentSpecs;
  const f = result.freight;
  const d = result.duty;
  const p = result.pricing;
  const t = result.transit;

  console.log(`Origin: ${result.origin}    Dispatch: ${t.dispatchDate}    Dest: ${t.destinationZip} (${t.coast})    ETA: ${t.deliveryDate} (${t.days} bd)`);
  console.log(`SKU: ${input.master.sku} — ${input.master.productName}`);
  console.log(`HTSUS: ${d.htsus}  (family ${d.htsusFamily})`);
  console.log("");
  console.log("SHIPMENT");
  console.log(`  qty: ${fmt(s.qtyPcs, 0)} pcs   cartons: ${s.cartons}   pallets: ${s.pallets}`);
  console.log(`  carton: ${s.cartonDimsCm.L_cm}×${s.cartonDimsCm.W_cm}×${s.cartonDimsCm.H_cm} cm   per-layer ${s.perLayer} × layers ${s.layersPerPallet} = ${s.cartonsPerPallet}/pallet`);
  console.log(`  actual: ${fmt(s.actualWeightKg)} kg   dim: ${fmt(s.dimWeightKg)} kg   chargeable: ${fmt(s.chargeableKg)} kg   CBM: ${fmt(s.cargoCBM, 3)}`);
  console.log("");
  console.log("FREIGHT");
  console.log(`  rate: ${f.rateInput} ${f.rateCurrency}/${f.rateUnit}   fuel: ${f.fuelPct}%`);
  console.log(`  freight INR: ${fmt(f.freightInr, 0)}   USD: $${fmt(f.freightUsd)}`);
  console.log("");
  console.log("DUTY (entered value $", fmt(d.enteredValueUsd), ")");
  console.log(`  MFN ${(d.mfnPct * 100).toFixed(2)}% = $${fmt(d.mfnUsd)}`);
  console.log(`  S301 ${(d.section301Pct * 100).toFixed(2)}% = $${fmt(d.s301Usd)}${d.section301Pct > 0 ? "  (China-origin)" : ""}`);
  console.log(`  S122 ${d.section122Applied ? "ON" : "off"} ${(d.section122Pct * 100).toFixed(2)}% = $${fmt(d.s122Usd)}`);
  console.log(`  MPF ${d.mpfFloored ? "(min)" : d.mpfCapped ? "(max)" : ""} = $${fmt(d.mpfUsd)}`);
  console.log(`  duty subtotal: $${fmt(d.dutyUsd)}   duty+MPF: $${fmt(d.dutyUsd + d.mpfUsd)}`);
  console.log("");
  console.log("PRICING");
  console.log(`  product:  $${fmt(p.productUsd)}   freight: $${fmt(p.freightUsd)}   duty: $${fmt(p.dutyUsd)}   MPF: $${fmt(p.mpfUsd)}`);
  console.log(`  landed:   $${fmt(p.totalLandedUsd)}   (₹${fmt(p.totalLandedInr, 0)})`);
  console.log(`  margin ${p.marginPct}%: $${fmt(p.marginUsd)}`);
  console.log(`  selling:  $${fmt(p.totalSellingUsd)}   (₹${fmt(p.totalSellingInr, 0)})`);
  console.log(`  per-unit landed: $${fmt(p.perUnitLandedUsd, 4)}   selling: $${fmt(p.perUnitSellingUsd, 4)}`);

  if (result.warnings?.length) {
    console.log("");
    console.log("WARNINGS");
    for (const w of result.warnings) console.log("  · " + w);
  }

  if (checks.length) {
    console.log("");
    console.log("CHECKS");
    let allPass = true;
    for (const c of checks) {
      const got = c.get(result);
      const ok = c.test(got);
      if (!ok) allPass = false;
      console.log(`  ${badge(ok)} ${c.label}: ${fmt(got, c.digits ?? 2)} ${c.expected ? `(expected ${c.expected})` : ""}`);
    }
    return allPass;
  }
  return true;
}

// --- Fixtures ---------------------------------------------------------------

const fixtures = [
  {
    label: "Fixture 1 — PC-SW-009 (8oz SW) · 18000 pcs · India · pre-sunset",
    input: buildInput({
      sku: "PC-SW-009",
      qtyPcs: 18000,
      dispatchDate: "2026-06-15",
      exFactoryInrPerUnit: 2.5,
    }),
    checks: [
      { label: "pallets ≈ 1",         get: (r) => r.shipmentSpecs.pallets,           test: (n) => n === 1, digits: 0 },
      { label: "chargeable kg ~290",  get: (r) => r.shipmentSpecs.chargeableKg,      test: (n) => n > 100 && n < 600, expected: "100–600" },
      { label: "freight USD ~1200",   get: (r) => r.pricing.freightUsd,              test: (n) => n > 500 && n < 3000, expected: "500–3000" },
      { label: "MFN = 0",             get: (r) => r.duty.mfnUsd,                     test: (n) => n === 0 },
      { label: "S122 ON pre-sunset",  get: (r) => r.duty.section122Applied ? 1 : 0,  test: (n) => n === 1, digits: 0 },
      { label: "per-unit landed $",   get: (r) => r.pricing.perUnitLandedUsd,        test: (n) => n > 0.04 && n < 0.40, expected: "0.04–0.40", digits: 4 },
    ],
  },
  {
    label: "Fixture 2 — PC-DW-8 (8oz DW) · 12000 pcs · India · POST-sunset",
    input: buildInput({
      sku: "PC-DW-8",
      qtyPcs: 12000,
      dispatchDate: "2026-08-01",
      exFactoryInrPerUnit: 4.2,
    }),
    checks: [
      { label: "S122 OFF post-sunset", get: (r) => r.duty.section122Applied ? 1 : 0, test: (n) => n === 0, digits: 0 },
      { label: "S122 charge = 0",      get: (r) => r.duty.s122Usd,                   test: (n) => n === 0 },
      { label: "sunset warning",       get: (r) => r.warnings.some((w) => /sunset/i.test(w)) ? 1 : 0, test: (n) => n === 1, digits: 0 },
      { label: "MFN-only duty",        get: (r) => r.duty.dutyUsd,                   test: (n) => n === 0, expected: "0 (4823.69 MFN free)" },
    ],
  },
  {
    label: "Fixture 3 — PET-CUP-003 (16oz PET) · 5000 pcs · India · pre-sunset",
    input: buildInput({
      sku: "PET-CUP-003",
      qtyPcs: 5000,
      dispatchDate: "2026-06-15",
      exFactoryInrPerUnit: 4.5,
    }),
    checks: [
      { label: "MFN 3.4%",            get: (r) => r.duty.mfnPct * 100,               test: (n) => Math.abs(n - 3.4) < 0.001, expected: "3.40" },
      { label: "S122 ON 10%",         get: (r) => r.duty.section122Pct * 100,        test: (n) => Math.abs(n - 10) < 0.001, expected: "10.00" },
      { label: "fallback weight used",get: (r) => r.warnings.some((w) => /gross_weight_kg missing/i.test(w)) ? 1 : 0, test: (n) => n === 1, digits: 0 },
      { label: "per-unit landed $",   get: (r) => r.pricing.perUnitLandedUsd,        test: (n) => n > 0, digits: 4 },
    ],
  },
  {
    label: "Fixture 4 — LID-PP-CN (PP lid, China) · 20000 pcs · pre-sunset",
    input: buildInput({
      sku: "LID-PP-CN",
      origin: "CN",
      qtyPcs: 20000,
      dispatchDate: "2026-06-15",
      exFactoryInrPerUnit: 1.8,
    }),
    checks: [
      { label: "MFN 5.3%",            get: (r) => r.duty.mfnPct * 100,               test: (n) => Math.abs(n - 5.3) < 0.001, expected: "5.30" },
      { label: "S301 25% (List 3)",   get: (r) => r.duty.section301Pct * 100,        test: (n) => Math.abs(n - 25) < 0.001, expected: "25.00" },
      { label: "S122 ON 10%",         get: (r) => r.duty.section122Pct * 100,        test: (n) => Math.abs(n - 10) < 0.001 },
      { label: "China origin",        get: (r) => r.origin === "CN" ? 1 : 0,         test: (n) => n === 1, digits: 0 },
      { label: "S301 warning",        get: (r) => r.warnings.some((w) => /301/i.test(w)) ? 1 : 0, test: (n) => n === 1, digits: 0 },
    ],
  },
  {
    label: "Fixture 5 — PC-SW-009 · palletised mode (2 pallets) · India",
    input: buildInput({
      sku: "PC-SW-009",
      qtyMode: "palletised",
      palletsRequested: 2,
      dispatchDate: "2026-06-15",
      exFactoryInrPerUnit: 2.5,
    }),
    checks: [
      { label: "pallets = 2",         get: (r) => r.shipmentSpecs.pallets,           test: (n) => n === 2, digits: 0 },
      { label: "derived qty > 0",     get: (r) => r.shipmentSpecs.qtyPcs,            test: (n) => n > 0, digits: 0 },
      { label: "derivedFromPallets",  get: (r) => r.shipmentSpecs.derivedFromPallets ? 1 : 0, test: (n) => n === 1, digits: 0 },
    ],
  },
];

// --- Run --------------------------------------------------------------------

let failures = 0;
for (const fx of fixtures) {
  const result = calcExpressShip(fx.input);
  const ok = printResult(fx.label, fx.input, result, fx.checks);
  if (!ok) failures += 1;
}

console.log("");
console.log("─".repeat(78));
if (failures === 0) {
  console.log(`All ${fixtures.length} fixtures passed.`);
  process.exit(0);
} else {
  console.log(`${failures} of ${fixtures.length} fixtures failed.`);
  process.exit(1);
}
