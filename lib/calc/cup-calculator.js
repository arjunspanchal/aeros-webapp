// Aeros Paper Cup Rate Calculator — pure calculation engine.
// Ported from the internal cup pricing sheet. No framework deps.

// Aqueous calibrated against Olive's Aeros quote (June 2026): at ₹20/kg
// our prices ran 10–25% under Olive across SW/DW/Ripple. Implied real premium is
// ₹40–55/kg (aqueous dispersion costs more than PE film despite the recyclable
// marketing). ₹45/kg lands SW within ±5% and DW within ±3% of Olive.
export const COATING_RATES = { PE: 13, "2PE": 26, PLA: 35, Aqueous: 45 };

export const DEFAULTS = {
  bottomRollWidth: 75,      // mm — fixed bottom disc roll width
  sidewallFans: 6,          // default; 10oz uses 9 (see getSidewallFanCount)
  outerFansDW_small: 9,     // 8/10/12 oz outer fan
  outerFansDW_large: 6,     // 16/20 oz outer fan
  offsetRate: 0.25,         // ₹ per cup per offset colour
  flexoPlate: 9000,         // ₹ per flexo colour (one-time)
  offsetDie: 700,           // ₹ per offset colour (one-time)
};

export const WEIGHT_CORRECTION = 0.908;
// Legacy flat capacity — retained for backwards-compat with PACK_LABOUR_PER_CUP
// below. New conversion math uses monthly hours × cups-per-minute so small
// sizes get a cheaper conversion cost than large.
export const MONTHLY_CAPACITY = 1_080_000;
export const PACK_LABOUR_MONTHLY = 30_000;
export const PACK_LABOUR_PER_CUP = PACK_LABOUR_MONTHLY / MONTHLY_CAPACITY;

// Production hours per MACHINE per month: two 10h shifts (9am–7pm + 7pm–5am)
// × 25 days = 500 hrs. This is max theoretical capacity — admin can drop to
// 300 for single-shift weeks.
export const MONTHLY_HOURS_DEFAULT = 500;

// Current Aeros cup-forming fleet: 1 SW machine + 2 DW machines (Ripple runs
// on the DW machines). Fixed monthly overheads (rent, salary, electricity,
// maintenance, QC) are pooled across the whole fleet — cost/cup drops as we
// add machines because the same overhead is spread over more output.
export const MACHINE_COUNT_SW_DEFAULT = 1;
export const MACHINE_COUNT_DW_DEFAULT = 2;

// Cups per minute by size. Single-wall baseline is a flat 70 cpm across the
// current Aeros line; double-wall and ripple run at 60 cpm (DW_SPEED_FACTOR
// 60/70). Admin form exposes these for tuning against actual production.
export const CPM_DEFAULTS_BY_SIZE = {
  "8oz":  70,
  "10oz": 70,
  "12oz": 70,
  "16oz": 70,
  "20oz": 70,
};
export const DW_SPEED_FACTOR = 60 / 70;

// Monthly overheads that roll into conversion. Admin can edit each and the
// engine recomputes ₹/cup = sum(components) / (monthlyHours × cpm × 60).
export const CONVERSION_DEFAULT_COMPONENTS = {
  salary:      185000,   // 2 ops × ₹70k + 3 labour × ₹15k
  electricity: 100000,   // Torrent Power, Bhiwandi
  rent:        112500,   // 7,500 sq ft × ₹15/sq ft
  maintenance:  15000,   // forming dies, heating elements, grease, spares
  qc:           10000,   // wastage buffer + incoming QC
};

// Per-carton consumables for packing. Used by computePackingCostPerCup —
// total material per cup = Σ / casePack, so DW (500/case) absorbs 2× the
// carton cost per cup vs SW (1000/case).
export const PACKING_DEFAULT_MATERIALS = {
  poly:   1.25,   // food-grade poly sleeve / liner per case
  carton: 70,     // 5-ply brown corrugated box per case
  tape:   3,      // strapping + BOPP tape per case
  label:  1,      // carton label / sticker per case
};

// Monthly packing-labour salary — pooled across fleet output like conversion.
export const PACKING_DEFAULT_LABOUR_MONTHLY = 30000;

// Glue application. Hot-melt EVA adhesive is dosed per seam — larger cups
// have longer seams, DW/Ripple forming adds an outer-fan seam on top.
export const GLUE_GRAMS_PER_CUP_BY_SIZE = {
  "8oz":  0.30,
  "10oz": 0.35,    // interpolated between 8oz (0.30) and 12oz (0.40)
  "12oz": 0.40,
  "16oz": 0.50,
  "20oz": 0.60,
};
export const GLUE_DW_FACTOR = 1.8;
export const GLUE_DEFAULT_RATE = 250; // ₹/kg, hot-melt EVA

// Per-production-run setup cost (machine changeover, paper loading, QC
// approval, startup wastage). Amortised across order qty, so small runs
// pay more per cup than large — gives a visible cost ladder even when
// there's no printing.
export const ORDER_RUN_SETUP_DEFAULT = 2000;

export function computeGlueCostPerCup({
  size,
  wallType,
  gramsBySize = GLUE_GRAMS_PER_CUP_BY_SIZE,
  rate = GLUE_DEFAULT_RATE,
  dwFactor = GLUE_DW_FACTOR,
} = {}) {
  const base = Number(gramsBySize[size]) || 0;
  const isDW = wallType === "Double Wall" || wallType === "Ripple";
  const grams = isDW ? base * dwFactor : base;
  return (grams * (Number(rate) || 0)) / 1000;
}

export function effectiveCpm(size, wallType, cpmBySize = CPM_DEFAULTS_BY_SIZE) {
  const base = cpmBySize[size] || 60;
  const isDW = wallType === "Double Wall" || wallType === "Ripple";
  return isDW ? Math.round(base * DW_SPEED_FACTOR) : base;
}

// Conversion cost per cup. Fixed monthly overheads are pooled across the
// whole fleet; each cup absorbs a share equal to its machine-time fraction:
//
//   cost/cup = total_overhead / (total_machines × monthlyHours × 60 × cpm)
//
// With 3 machines at 500 hrs each, that's 1500 machine-hours/month of
// capacity. A 70-cpm SW cup uses 1/4200 of an hour, a 60-cpm DW cup uses
// 1/3600 — so DW cups absorb proportionally more of the pool.
export function computeConversionCostPerCup({
  size,
  wallType,
  components = CONVERSION_DEFAULT_COMPONENTS,
  monthlyHours = MONTHLY_HOURS_DEFAULT,
  cpmBySize = CPM_DEFAULTS_BY_SIZE,
  machineCountSw = MACHINE_COUNT_SW_DEFAULT,
  machineCountDw = MACHINE_COUNT_DW_DEFAULT,
} = {}) {
  const total = Object.values(components).reduce((s, v) => s + (Number(v) || 0), 0);
  const cpm = effectiveCpm(size, wallType, cpmBySize);
  const totalMachines = (Number(machineCountSw) || 0) + (Number(machineCountDw) || 0);
  const cupsPerMonth = monthlyHours * 60 * cpm * totalMachines;
  if (cupsPerMonth <= 0) return 0;
  return total / cupsPerMonth;
}

// Packing cost per cup = per-carton materials / casePack + packing-labour
// pooled across fleet output. Returns the breakdown so UI can show both
// parts; total is what the engine uses for `pack`.
export function computePackingCostPerCup({
  size,
  wallType,
  casePack,
  materials = PACKING_DEFAULT_MATERIALS,
  monthlyLabour = PACKING_DEFAULT_LABOUR_MONTHLY,
  monthlyHours = MONTHLY_HOURS_DEFAULT,
  cpmBySize = CPM_DEFAULTS_BY_SIZE,
  machineCountSw = MACHINE_COUNT_SW_DEFAULT,
  machineCountDw = MACHINE_COUNT_DW_DEFAULT,
} = {}) {
  const cp = Number(casePack) || CASE_PACK_DEFAULTS[wallType]?.[size] || 500;
  const materialTotal = Object.values(materials).reduce((s, v) => s + (Number(v) || 0), 0);
  const materialPerCup = cp > 0 ? materialTotal / cp : 0;

  const cpm = effectiveCpm(size, wallType, cpmBySize);
  const totalMachines = (Number(machineCountSw) || 0) + (Number(machineCountDw) || 0);
  const fleetCupsPerMonth = monthlyHours * 60 * cpm * totalMachines;
  const labourPerCup = fleetCupsPerMonth > 0 ? (Number(monthlyLabour) || 0) / fleetCupsPerMonth : 0;

  return {
    materialPerCup,
    labourPerCup,
    total: materialPerCup + labourPerCup,
  };
}

// Sidewall fan dimensions [length_mm, width_mm] by size and print method.
// 10oz uniquely uses 9 sidewall fans per sheet (3×3 layout) vs 6 for the
// other sizes — see getSidewallFanCount() below.
export const SW_DIMS = {
  "8oz":  { Flexo: [665, 260], Offset: [675, 305] },
  "10oz": { Flexo: [740, 410], Offset: [740, 415] },  // 9 fans (3×3)
  "12oz": { Flexo: [740, 310], Offset: [745, 370] },
  "16oz": { Flexo: [740, 365], Offset: [750, 300] },
  "20oz": { Flexo: [750, 406], Offset: [750, 400] },
};

// Outer fan dimensions for DW / Ripple. 10oz uses Flexo sheet sizing
// (Offset only ~3mm different — within die-cut tolerance).
export const OF_DIMS = {
  "8oz":  [675, 305],
  "10oz": [745, 342],   // 9 fans (3×3)
  "12oz": [745, 370],
  "16oz": [750, 300],
  "20oz": [750, 400],
};

export const CASE_PACK_DEFAULTS = {
  "Single Wall": { "8oz": 1000, "10oz": 1000, "12oz": 1000, "16oz": 1000, "20oz": 1000 },
  "Double Wall": { "8oz": 500,  "10oz": 500,  "12oz": 500,  "16oz": 500,  "20oz": 500 },
  "Ripple":      { "8oz": 500,  "10oz": 500,  "12oz": 500,  "16oz": 500,  "20oz": 500 },
};

// Standard cup dimensions offered in the customer dropdown. Per size, any
// number of { td, bd, h } sets (mm). Seeded from DW Export; extend as we
// add more SKUs. Empty array = no standards → UI hides the dropdown.
export const STANDARD_CUP_DIMS = {
  "8oz":  [{ td: 80, bd: 56, h: 93 }],
  "10oz": [{ td: 90, bd: 60, h: 96 }],
  "12oz": [{ td: 90, bd: 60, h: 111 }],
  "16oz": [{ td: 90, bd: 60, h: 135 }],
  "20oz": [],
};

export function formatCupDim(d) {
  if (!d || !d.td || !d.bd || !d.h) return "";
  return `${d.td} × ${d.bd} × ${d.h} mm`;
}

export const CUP_PRESETS = {
  "DW Export": {
    label: "DW Export", wallType: "Double Wall", sizes: ["8oz", "10oz", "12oz", "16oz", "20oz"],
    sw: { "8oz": { gsm: 280, coating: "PE" }, "10oz": { gsm: 280, coating: "PE" }, "12oz": { gsm: 280, coating: "PE" }, "16oz": { gsm: 280, coating: "PE" }, "20oz": { gsm: 280, coating: "PE" } },
    bt: { "8oz": { gsm: 230, coating: "2PE" }, "10oz": { gsm: 230, coating: "2PE" }, "12oz": { gsm: 230, coating: "2PE" }, "16oz": { gsm: 230, coating: "2PE" }, "20oz": { gsm: 230, coating: "2PE" } },
    of: { "8oz": { gsm: 280, coating: "PE" }, "10oz": { gsm: 260, coating: "PE" }, "12oz": { gsm: 280, coating: "PE" }, "16oz": { gsm: 280, coating: "PE" }, "20oz": { gsm: 300, coating: "PE" } },
    codes: {
      "8oz":  { code: "C100001", td: 80, bd: 56, h: 93 },
      "10oz": { code: "", td: 90, bd: 60, h: 96 },
      "12oz": { code: "C100002", td: 90, bd: 60, h: 111 },
      "16oz": { code: "C100003", td: 90, bd: 60, h: 135 },
      "20oz": { code: "", td: null, bd: null, h: null },
    },
  },
  "DW Standard": {
    label: "DW Standard", wallType: "Double Wall", sizes: ["8oz", "10oz", "12oz", "16oz", "20oz"],
    sw: { "8oz": { gsm: 280, coating: "PE" }, "10oz": { gsm: 280, coating: "PE" }, "12oz": { gsm: 280, coating: "PE" }, "16oz": { gsm: 280, coating: "PE" }, "20oz": { gsm: 280, coating: "PE" } },
    bt: { "8oz": { gsm: 230, coating: "2PE" }, "10oz": { gsm: 230, coating: "2PE" }, "12oz": { gsm: 230, coating: "2PE" }, "16oz": { gsm: 230, coating: "2PE" }, "20oz": { gsm: 230, coating: "2PE" } },
    of: { "8oz": { gsm: 260, coating: "PE" }, "10oz": { gsm: 260, coating: "PE" }, "12oz": { gsm: 260, coating: "PE" }, "16oz": { gsm: 280, coating: "PE" }, "20oz": { gsm: 280, coating: "PE" } },
    codes: {
      "8oz":  { code: "", td: null, bd: null, h: null },
      "10oz": { code: "", td: null, bd: null, h: null },
      "12oz": { code: "", td: null, bd: null, h: null },
      "16oz": { code: "", td: null, bd: null, h: null },
      "20oz": { code: "", td: null, bd: null, h: null },
    },
  },
  "SW Standard": {
    label: "SW Standard", wallType: "Single Wall", sizes: ["8oz", "10oz", "12oz", "16oz", "20oz"],
    sw: { "8oz": { gsm: 280, coating: "PE" }, "10oz": { gsm: 280, coating: "PE" }, "12oz": { gsm: 280, coating: "PE" }, "16oz": { gsm: 280, coating: "PE" }, "20oz": { gsm: 280, coating: "PE" } },
    bt: { "8oz": { gsm: 230, coating: "2PE" }, "10oz": { gsm: 230, coating: "2PE" }, "12oz": { gsm: 230, coating: "2PE" }, "16oz": { gsm: 230, coating: "2PE" }, "20oz": { gsm: 230, coating: "2PE" } },
    of: null,
    codes: {
      "8oz":  { code: "", td: null, bd: null, h: null },
      "10oz": { code: "", td: null, bd: null, h: null },
      "12oz": { code: "", td: null, bd: null, h: null },
      "16oz": { code: "", td: null, bd: null, h: null },
      "20oz": { code: "", td: null, bd: null, h: null },
    },
  },
  "Ripple Standard": {
    label: "Ripple Standard", wallType: "Ripple", sizes: ["8oz", "10oz", "12oz", "16oz", "20oz"],
    sw: { "8oz": { gsm: 280, coating: "PE" }, "10oz": { gsm: 280, coating: "PE" }, "12oz": { gsm: 280, coating: "PE" }, "16oz": { gsm: 280, coating: "PE" }, "20oz": { gsm: 280, coating: "PE" } },
    bt: { "8oz": { gsm: 230, coating: "2PE" }, "10oz": { gsm: 230, coating: "2PE" }, "12oz": { gsm: 230, coating: "2PE" }, "16oz": { gsm: 230, coating: "2PE" }, "20oz": { gsm: 230, coating: "2PE" } },
    of: { "8oz": { gsm: 280, coating: "PE" }, "10oz": { gsm: 280, coating: "PE" }, "12oz": { gsm: 280, coating: "PE" }, "16oz": { gsm: 280, coating: "PE" }, "20oz": { gsm: 300, coating: "PE" } },
    codes: {
      "8oz":  { code: "", td: null, bd: null, h: null },
      "10oz": { code: "", td: null, bd: null, h: null },
      "12oz": { code: "", td: null, bd: null, h: null },
      "16oz": { code: "", td: null, bd: null, h: null },
      "20oz": { code: "", td: null, bd: null, h: null },
    },
  },
};

export const PACKING_PRESETS = {
  "SW Standard":     { "8oz": { poly: 1.23, carton: 70 }, "10oz": { poly: "", carton: "" }, "12oz": { poly: "", carton: "" }, "16oz": { poly: "", carton: "" }, "20oz": { poly: "", carton: "" } },
  "DW Standard":     { "8oz": { poly: "", carton: "" }, "10oz": { poly: "", carton: "" }, "12oz": { poly: "", carton: "" }, "16oz": { poly: "", carton: "" }, "20oz": { poly: "", carton: "" } },
  "DW Export":       { "8oz": { poly: "", carton: "" }, "10oz": { poly: "", carton: "" }, "12oz": { poly: "", carton: "" }, "16oz": { poly: "", carton: "" }, "20oz": { poly: "", carton: "" } },
  "Ripple Standard": { "8oz": { poly: "", carton: "" }, "10oz": { poly: "", carton: "" }, "12oz": { poly: "", carton: "" }, "16oz": { poly: "", carton: "" }, "20oz": { poly: "", carton: "" } },
};

export const SIZE_OPTS = ["8oz", "10oz", "12oz", "16oz", "20oz"];
export const PRINT_OPTS = ["No printing", "Flexo", "Offset"];
export const COATING_OPTS = ["None", "PE", "2PE", "PLA", "Aqueous"];

// Customer-facing defaults — the customer form does not surface paper rates,
// conversion, packing, glue or margin. Admin view stays fully manual.
// Conversion/packing/glue are modeled as a single weight-scaled overhead
// (see customerOverheadPerCup) rather than flat per-cup values, so small
// cups don't inherit 20oz overhead.
export const CUSTOMER_DEFAULTS = {
  innerPaperRate: 95,   // ₹/kg sidewall stock
  outerPaperRate: 85,   // ₹/kg outer-fan stock
  bottomPaperRate: 90,  // ₹/kg bottom roll
  other: 0,
  margin: 15,           // %
};

// Per-cup overhead (conversion + packing + glue) as a function of cup
// weight (g). Fitted against Aeros's internal rate card across SW/DW/
// Ripple × 8/12/16/20oz — lands within ±5% of the reference on every
// supported size. Linear in the middle, clamped at both ends so small
// cups don't over-charge and large cups don't under-charge.
export const CUSTOMER_OVERHEAD = {
  ratePerG: 0.06,   // ₹ per gram of cup weight
  subtract: 0.40,   // flat subtract (negative intercept) keeps small cups light
  min: 0.10,        // ₹/cup floor (plate change, handling, minimal packing)
  max: 0.55,        // ₹/cup ceiling (large cups don't need proportionally more conversion)
};

export function customerOverheadPerCup(cupWeightG) {
  const raw = CUSTOMER_OVERHEAD.ratePerG * cupWeightG - CUSTOMER_OVERHEAD.subtract;
  return Math.max(CUSTOMER_OVERHEAD.min, Math.min(CUSTOMER_OVERHEAD.max, raw));
}

// Flexo colour ₹/kg by coverage tier — mirrors paper-bag PRINTING_RATES.
export const COVERAGE_FLEXO_RATES = { 10: 7, 30: 10, 100: 15 };

// Qty tiers for the customer rate curve. Plate + die cost amortise across
// qty, so higher qty = lower per-cup rate when printing is on.
export const CUP_QTY_TIERS = [25000, 50000, 100000, 250000, 500000];

export function getOuterFanCount(size) {
  // Small cups (8/10/12 oz) cut 9 outer fans per sheet; 16/20 oz cut 6.
  return size === "8oz" || size === "10oz" || size === "12oz"
    ? DEFAULTS.outerFansDW_small
    : DEFAULTS.outerFansDW_large;
}

// Sidewall fan count per sheet. Most cups cut 6 sidewall fans (2×3 layout),
// but 10oz uses a 3×3 layout that yields 9 fans per sheet. Per-cup paper
// consumption = sheet_weight / fan_count, so 10oz divides by 9 not 6.
export function getSidewallFanCount(size) {
  return size === "10oz" ? 9 : DEFAULTS.sidewallFans;
}

export function getSidewallDims(size, printMethod) {
  if (!size || !SW_DIMS[size]) return null;
  if (printMethod && printMethod !== "No printing" && SW_DIMS[size][printMethod]) return SW_DIMS[size][printMethod];
  return SW_DIMS[size]["Flexo"];
}

function effectiveCoatingRate(coating, manual) {
  if (!coating || coating === "None") return 0;
  return COATING_RATES[coating] ?? (parseFloat(manual) || 0);
}

// Core calc. Input is a plain object with string/number fields. Output is the
// breakdown used by the UI.
export function calculate(f) {
  const isDW = f.wallType === "Double Wall" || f.wallType === "Ripple";
  const swDims = getSidewallDims(f.size, f.swPrint) || [0, 0];
  const swF = getSidewallFanCount(f.size);

  // Sidewall RM
  const swTotalRate = (parseFloat(f.swRate) || 0) + effectiveCoatingRate(f.swCoating, f.swCoatingRate);
  const swWeight = (swDims[0] / 1000) * (swDims[1] / 1000) * ((parseFloat(f.swGSM) || 0) / 1000);
  const swRM = (swWeight * swTotalRate) / swF;

  // Sidewall printing
  let swPrintCost = 0;
  if (f.swPrint === "Flexo") {
    const c = parseInt(f.swColors) || 1;
    const r1 = parseFloat(f.swRate1) || 0;
    const rn = parseFloat(f.swRateN) || 0;
    swPrintCost = (swWeight * (r1 + (c - 1) * rn)) / swF;
  } else if (f.swPrint === "Offset") {
    const c = parseInt(f.swColors) || 0;
    swPrintCost = (c * DEFAULTS.offsetRate) / swF;
  }

  // Bottom disc — circle of dia = bottomRollWidth
  const btR = DEFAULTS.bottomRollWidth / 2 / 1000;
  const btTotalRate = (parseFloat(f.btRate) || 0) + effectiveCoatingRate(f.btCoating, f.btCoatingRate);
  const btCost = Math.PI * btR * btR * ((parseFloat(f.btGSM) || 0) / 1000) * btTotalRate;

  // Outer fan (DW / Ripple only)
  let ofRM = 0, ofPrintCost = 0, ofWeight = 0, ofWeightG_val = 0;
  if (isDW) {
    const ofDims = OF_DIMS[f.size];
    if (ofDims) {
      const ofFans = getOuterFanCount(f.size);
      const ofTotalRate = (parseFloat(f.ofRate) || 0) + effectiveCoatingRate(f.ofCoating, f.ofCoatingRate);
      ofWeight = (ofDims[0] / 1000) * (ofDims[1] / 1000) * ((parseFloat(f.ofGSM) || 0) / 1000);
      // Sheet weight covers `ofFans` cups, so per-cup weight divides by fans.
      ofWeightG_val = (ofWeight * 1000 * WEIGHT_CORRECTION) / ofFans;
      ofRM = (ofWeight * ofTotalRate) / ofFans;
      if (f.ofPrint === "Flexo") {
        const c = parseInt(f.ofColors) || 1;
        const r1 = parseFloat(f.ofRate1) || 0;
        const rn = parseFloat(f.ofRateN) || 0;
        ofPrintCost = (ofWeight * (r1 + (c - 1) * rn)) / ofFans;
      } else if (f.ofPrint === "Offset") {
        const c = parseInt(f.ofColors) || 0;
        ofPrintCost = (c * DEFAULTS.offsetRate) / ofFans;
      }
    }
  }
  const ofTotal = ofRM + ofPrintCost;

  // Weights (for display / per-cup)
  // Sidewall sheet covers `swF` (6) cups, so per-cup weight divides by fans.
  const swWeightG = (swWeight * 1000 * WEIGHT_CORRECTION) / swF;
  const btWeightG = Math.PI * btR * btR * ((parseFloat(f.btGSM) || 0) / 1000) * 1000 * WEIGHT_CORRECTION;
  const cupWeightG = swWeightG + btWeightG + ofWeightG_val;

  const conv = parseFloat(f.conv) || 0;
  const pack = parseFloat(f.pack) || 0;
  const glue = parseFloat(f.glue) || 0;
  const other = parseFloat(f.otherCost) || 0;
  const mfg = swRM + swPrintCost + ofTotal + btCost + conv + pack + glue + other;

  const mp = parseFloat(f.margin) || 0;
  const marginAmt = mp >= 100 ? 0 : (mfg * mp) / (100 - mp);
  const sp = mfg + marginAmt;
  const spCase = sp * (parseInt(f.casePack) || 1);

  const swPlate = f.swPrint === "Flexo" ? (parseInt(f.swColors) || 0) * DEFAULTS.flexoPlate : null;
  const swDie   = f.swPrint === "Offset" ? (parseInt(f.swColors) || 0) * DEFAULTS.offsetDie : null;
  const ofPlate = f.ofPrint === "Flexo" ? (parseInt(f.ofColors) || 0) * DEFAULTS.flexoPlate : null;
  const ofDie   = f.ofPrint === "Offset" ? (parseInt(f.ofColors) || 0) * DEFAULTS.offsetDie : null;

  return {
    swRM, swPrintCost, ofTotal, btCost,
    conv, pack, glue, other,
    mfg, marginAmt, sp, spCase, mp,
    swPlate, swDie, ofPlate, ofDie,
    swWeightG, btWeightG, ofWeightG: ofWeightG_val, cupWeightG,
    swDims, isDW,
  };
}

// Estimated per-cup weight (grams) from the customer form inputs. Mirrors
// the math inside calculate() but returns a single number we can feed into
// the overhead formula before running the full engine. Matches
// calculate().cupWeightG / fans, not the sheet weight the engine currently
// exposes in its result object.
export function estimateCupWeightG({ wallType, size, innerGsm, outerGsm, bottomGsm }) {
  const swDims = getSidewallDims(size, "No printing") || [0, 0];
  const swPerCupKg = ((swDims[0] / 1000) * (swDims[1] / 1000) * ((innerGsm || 0) / 1000)) / getSidewallFanCount(size);
  const btR = DEFAULTS.bottomRollWidth / 2 / 1000;
  const btPerCupKg = Math.PI * btR * btR * ((bottomGsm || 0) / 1000);
  let ofPerCupKg = 0;
  const isDW = wallType === "Double Wall" || wallType === "Ripple";
  if (isDW && outerGsm) {
    const ofDims = OF_DIMS[size];
    if (ofDims) {
      const fans = getOuterFanCount(size);
      ofPerCupKg = ((ofDims[0] / 1000) * (ofDims[1] / 1000) * (outerGsm / 1000)) / fans;
    }
  }
  return (swPerCupKg + btPerCupKg + ofPerCupKg) * 1000 * WEIGHT_CORRECTION;
}

// Customer-form inputs → full engine inputs, with defaults filled in. Returns
// the object you can pass to `calculate(...)` or `computeCupRateCurve(...)`.
// Customer form fields: wallType, size, casePack, dims (td/bd/h),
// inner { gsm, coating, print: "Flexo"|"No printing", colours, coverage },
// outer { gsm, coating, print, colours, coverage }, orderQty.
export function customerFormToEngineInputs(cf) {
  const innerCoverage = cf.inner?.coverage ? parseInt(cf.inner.coverage) : null;
  const outerCoverage = cf.outer?.coverage ? parseInt(cf.outer.coverage) : null;
  const innerRate = innerCoverage ? (COVERAGE_FLEXO_RATES[innerCoverage] ?? 0) : 0;
  const outerRate = outerCoverage ? (COVERAGE_FLEXO_RATES[outerCoverage] ?? 0) : 0;
  const autoCasePack = CASE_PACK_DEFAULTS[cf.wallType]?.[cf.size] || 500;

  const bottomGsm = 230;
  // Conversion: fleet-pooled overheads ÷ (machines × hours × 60 × cpm).
  // Packing: per-carton materials ÷ casePack + fleet-pooled labour.
  // Glue: small flat rate. All three track the admin defaults so the client
  // rate stays in sync with tuning done in the admin form.
  const conv = computeConversionCostPerCup({ size: cf.size, wallType: cf.wallType });
  const clientCasePack = Number(cf.casePack) || CASE_PACK_DEFAULTS[cf.wallType]?.[cf.size] || 500;
  const packing = computePackingCostPerCup({
    size: cf.size,
    wallType: cf.wallType,
    casePack: clientCasePack,
  });
  const clientPack = packing.total;
  const clientGlue = computeGlueCostPerCup({ size: cf.size, wallType: cf.wallType });

  const effectiveMargin = cf.margin !== undefined && cf.margin !== null && cf.margin !== ""
    ? Number(cf.margin)
    : CUSTOMER_DEFAULTS.margin;

  return {
    wallType: cf.wallType,
    size: cf.size,
    casePack: String(cf.casePack || autoCasePack),
    margin: String(effectiveMargin),

    swGSM: String(cf.inner?.gsm || ""),
    swRate: String(CUSTOMER_DEFAULTS.innerPaperRate),
    swCoating: cf.inner?.coating || "None",
    swCoatingRate: "",
    swPrint: cf.inner?.print ? "Flexo" : "No printing",
    swColors: cf.inner?.print ? String(cf.inner.colours || 1) : "",
    swRate1: cf.inner?.print ? String(innerRate) : "",
    swRateN: cf.inner?.print ? String(innerRate) : "",

    btGSM: String(bottomGsm),
    btRate: String(CUSTOMER_DEFAULTS.bottomPaperRate),
    btCoating: "2PE",
    btCoatingRate: "",

    ofGSM: String(cf.outer?.gsm || ""),
    ofRate: String(CUSTOMER_DEFAULTS.outerPaperRate),
    ofCoating: cf.outer?.coating || "None",
    ofCoatingRate: "",
    ofPrint: cf.outer?.print ? "Flexo" : "No printing",
    ofColors: cf.outer?.print ? String(cf.outer.colours || 1) : "",
    ofRate1: cf.outer?.print ? String(outerRate) : "",
    ofRateN: cf.outer?.print ? String(outerRate) : "",

    // Conversion/packing/glue are computed from admin's monthly overheads +
    // machine speed so the client rate stays in sync with the admin form.
    conv: String(conv),
    pack: String(clientPack),
    glue: String(clientGlue),
    otherCost: String(CUSTOMER_DEFAULTS.other),
  };
}

// Rate curve across qty tiers. Plate + die + production-run setup all
// amortise, so rate drops as qty grows — including on plain orders where
// the setup cost alone drives the ladder.
export function computeCupRateCurve(customerInputs, tiers = CUP_QTY_TIERS) {
  const engineInputs = customerFormToEngineInputs(customerInputs);
  const base = calculate(engineInputs);
  const plateDie = (base.swPlate || 0) + (base.swDie || 0) + (base.ofPlate || 0) + (base.ofDie || 0);
  const oneTime = plateDie + ORDER_RUN_SETUP_DEFAULT;
  const casePack = parseInt(engineInputs.casePack) || 1;
  const mp = Number(engineInputs.margin) || CUSTOMER_DEFAULTS.margin;

  const curve = tiers.map((qty) => {
    const oneTimePerCup = qty > 0 ? oneTime / qty : 0;
    const mfgPerCup = base.mfg + oneTimePerCup;
    const marginAmt = mp >= 100 ? 0 : (mfgPerCup * mp) / (100 - mp);
    const ratePerCup = mfgPerCup + marginAmt;
    return {
      qty,
      mfgPerCup: Math.round(mfgPerCup * 10000) / 10000,
      oneTimePerCup: Math.round(oneTimePerCup * 10000) / 10000,
      marginAmt: Math.round(marginAmt * 10000) / 10000,
      ratePerCup: Math.round(ratePerCup * 10000) / 10000,
      ratePerCase: Math.round(ratePerCup * casePack * 100) / 100,
      orderTotal: Math.round(ratePerCup * qty * 100) / 100,
    };
  });

  return {
    curve,
    marginPct: mp,
    mfgPerCupBase: Math.round(base.mfg * 10000) / 10000,
    // Only plate/die are billed separately. Setup is baked into the rate.
    oneTimeTotal: Math.round(plateDie * 100) / 100,
    runSetup: ORDER_RUN_SETUP_DEFAULT,
    plateFlexo: (base.swPlate || 0) + (base.ofPlate || 0),
    dieOffset: (base.swDie || 0) + (base.ofDie || 0),
  };
}
