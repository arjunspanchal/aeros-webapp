// Aeros Paper Tub Rate Calculator — standalone tub engine.
//
// Tubs share the same fleet + overhead pool + packing-material structure as
// cups, but use single-wall sidewall paper only (no outer fan), a larger
// bottom disc roll, and a slower machine speed because the tub form is wider
// and deeper than a cup.
//
// Lives in its own file so cup-calculator.js stays untouched.

import {
  COATING_RATES, DEFAULTS, WEIGHT_CORRECTION,
  CONVERSION_DEFAULT_COMPONENTS, MONTHLY_HOURS_DEFAULT,
  MACHINE_COUNT_SW_DEFAULT, MACHINE_COUNT_DW_DEFAULT,
  PACKING_DEFAULT_MATERIALS, PACKING_DEFAULT_LABOUR_MONTHLY,
  GLUE_DEFAULT_RATE, ORDER_RUN_SETUP_DEFAULT,
} from "@/lib/calc/cup-calculator";

// ---------- Tub geometry ----------
// Geometry taken from Aeros's internal tub costing sheet. Inner-paper rates
// remain pulled from the Paper RM Master (via the admin's brand picker) —
// NOT from the costing sheet. Conversion, packing, glue all stay on our
// fleet-pool / per-cup formulas. Margin is admin-entered.

export const TUB_SIZE_OPTS = ["350_ml", "400_ml", "750_ml"];
export const TUB_SIZE_LABELS = {
  "350_ml": "350 mL",
  "400_ml": "400 mL",
  "750_ml": "750 mL",
};

// Per-size geometry. All Aeros tubs run on a 670 mm wide roll with 8 fans per
// sheet; height varies by tub volume. Bottom is a rectangular blank
// 115 × 122.8 mm (not an inscribed circle) at 260 GSM + 2PE coating.
export const TUB_DIMS = {
  "350_ml": { sw: [670, 380], fans: 8, bottomBlank: [115, 122.8], bottomGsm: 260, td: 115, bd: 95, h: 70 },
  "400_ml": { sw: [670, 405], fans: 8, bottomBlank: [115, 122.8], bottomGsm: 260, td: 115, bd: 95, h: 80 },
  "750_ml": { sw: [670, 405], fans: 8, bottomBlank: [115, 122.8], bottomGsm: 260, td: 130, bd: 110, h: 110 },
};

export const TUB_CPM_DEFAULT = 50;
export const TUB_CASE_PACK_DEFAULT = 500;
export const TUB_GLUE_GRAMS_BY_SIZE = {
  "350_ml": 0.55,
  "400_ml": 0.65,
  "750_ml": 0.80,
};

// Bottom paper stays 2PE-coated (sealing). GSM is 260 for tubs (per Aeros
// costing sheet) — heavier than the cup's locked 230.
const LOCKED_BT_COATING = "2PE";

// ---------- Cost helpers ----------

function effectiveCoatingRate(coating, manualRate) {
  if (!coating || coating === "None") return 0;
  return COATING_RATES[coating] ?? (parseFloat(manualRate) || 0);
}

export function computeTubConversionCostPerUnit({
  components = CONVERSION_DEFAULT_COMPONENTS,
  monthlyHours = MONTHLY_HOURS_DEFAULT,
  machineCountSw = MACHINE_COUNT_SW_DEFAULT,
  machineCountDw = MACHINE_COUNT_DW_DEFAULT,
  cpm = TUB_CPM_DEFAULT,
} = {}) {
  const total = Object.values(components).reduce((s, v) => s + (Number(v) || 0), 0);
  const totalMachines = (Number(machineCountSw) || 0) + (Number(machineCountDw) || 0);
  const units = monthlyHours * 60 * cpm * totalMachines;
  return units > 0 ? total / units : 0;
}

export function computeTubPackingCostPerUnit({
  casePack = TUB_CASE_PACK_DEFAULT,
  materials = PACKING_DEFAULT_MATERIALS,
  monthlyLabour = PACKING_DEFAULT_LABOUR_MONTHLY,
  monthlyHours = MONTHLY_HOURS_DEFAULT,
  machineCountSw = MACHINE_COUNT_SW_DEFAULT,
  machineCountDw = MACHINE_COUNT_DW_DEFAULT,
  cpm = TUB_CPM_DEFAULT,
} = {}) {
  const materialTotal = Object.values(materials).reduce((s, v) => s + (Number(v) || 0), 0);
  const materialPerUnit = casePack > 0 ? materialTotal / casePack : 0;
  const totalMachines = (Number(machineCountSw) || 0) + (Number(machineCountDw) || 0);
  const fleetUnits = monthlyHours * 60 * cpm * totalMachines;
  const labourPerUnit = fleetUnits > 0 ? (Number(monthlyLabour) || 0) / fleetUnits : 0;
  return { materialPerUnit, labourPerUnit, total: materialPerUnit + labourPerUnit };
}

export function computeTubGlueCostPerUnit({ size, rate = GLUE_DEFAULT_RATE } = {}) {
  const grams = Number(TUB_GLUE_GRAMS_BY_SIZE[size]) || 0;
  return (grams * (Number(rate) || 0)) / 1000;
}

// ---------- Core tub calc ----------

// Mirrors the cup `calculate()` shape so the existing result-rendering code
// works without special-casing — sets ofTotal=0, isTub=true.
export function calculateTub(f) {
  const size = f.size;
  const dims = TUB_DIMS[size];
  if (!dims) return null;

  const swInnerGsm = parseFloat(f.swGSM) || 0;
  const swPaperRate = (parseFloat(f.swRate) || 0) + effectiveCoatingRate(f.swCoating, f.swCoatingRate);
  const swSheetKg = (dims.sw[0] / 1000) * (dims.sw[1] / 1000) * (swInnerGsm / 1000);
  const swRM = (swSheetKg * swPaperRate) / dims.fans;
  const swWeight = (swSheetKg * 1000 * WEIGHT_CORRECTION) / dims.fans;

  let swPrintCost = 0;
  if (f.swPrint === "Flexo") {
    const c = parseInt(f.swColors) || 1;
    const r1 = parseFloat(f.swRate1) || 0;
    const rN = parseFloat(f.swRateN) || 0;
    swPrintCost = (swSheetKg * (r1 + (c - 1) * rN)) / dims.fans;
  } else if (f.swPrint === "Offset") {
    const c = parseInt(f.swColors) || 0;
    swPrintCost = (c * DEFAULTS.offsetRate) / dims.fans;
  }

  // Bottom disc — rectangular blank per Aeros's tub costing sheet
  // (115 × 122.8 mm), 260 GSM + 2PE coating.
  const [btL, btW] = dims.bottomBlank;
  const btGsm = dims.bottomGsm;
  const btBlankKg = (btL / 1000) * (btW / 1000) * (btGsm / 1000);
  const btTotalRate = (parseFloat(f.btRate) || 0) + effectiveCoatingRate(LOCKED_BT_COATING, f.btCoatingRate);
  const btCost = btBlankKg * btTotalRate;
  const btWeightG = btBlankKg * 1000 * WEIGHT_CORRECTION;

  const conv = parseFloat(f.conv) || 0;
  const pack = parseFloat(f.pack) || 0;
  const glue = parseFloat(f.glue) || 0;
  const other = parseFloat(f.otherCost) || 0;
  const mfg = swRM + swPrintCost + btCost + conv + pack + glue + other;

  const mp = parseFloat(f.margin) || 0;
  const marginAmt = mp >= 100 ? 0 : (mfg * mp) / (100 - mp);
  const sp = mfg + marginAmt;
  const spCase = sp * (parseInt(f.casePack) || 1);

  const swPlate = f.swPrint === "Flexo" ? (parseInt(f.swColors) || 0) * DEFAULTS.flexoPlate : null;
  const swDie   = f.swPrint === "Offset" ? (parseInt(f.swColors) || 0) * DEFAULTS.offsetDie : null;

  return {
    swRM, swPrintCost, ofTotal: 0, btCost,
    conv, pack, glue, other,
    mfg, marginAmt, sp, spCase, mp,
    swPlate, swDie, ofPlate: null, ofDie: null,
    swWeightG: swWeight, btWeightG, ofWeightG: 0,
    cupWeightG: swWeight + btWeightG,
    swDims: dims.sw, isDW: false, isTub: true,
    tubDims: { td: dims.td, bd: dims.bd, h: dims.h },
  };
}

export { ORDER_RUN_SETUP_DEFAULT };
