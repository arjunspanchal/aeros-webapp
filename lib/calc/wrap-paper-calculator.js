// Aeros Wrap-Paper Rate Calculator — pure calculation engine.
//
// Wrap paper = flat printed/plain food-wrap sheets (burger wraps, basket
// liners, sandwich / greaseproof wraps). One flat sheet — no glue, no bottom
// disc, no outer fan. Cost = paper RM + wastage + conversion + printing +
// packing, then a qty-tier cost ladder with margin. Same shape as the cup/bag
// engines; no framework deps.
//
// Paper rate is resolved server-side from master_papers (mills Pudumjee / BILT,
// stocks OGR or Bleach Kraft White) and passed in as `paperRate` (₹/kg). The
// engine itself stays pure — it never touches the DB.

// Mills + stocks offered for wrap paper. Used by the UI dropdowns and the
// rate route's Master lookup.
export const WRAP_MILLS = ["Pudumjee", "BILT"];
export const WRAP_PAPER_TYPES = ["OGR", "Bleach Kraft White"];

// Wrap stock GSM options (food-grade greaseproof / MG poster / butter paper).
export const WRAP_GSM_OPTS = [30, 35, 40, 45, 50, 60];

// Case pack — wrap sheets ship in 1000s or 5000s.
export const CASE_PACK_OPTS = [1000, 5000];
export const CASE_PACK_DEFAULT = 1000;

export const PRINT_OPTS = ["Plain", "Flexo", "Offset"];

// Conversion / overhead constants (tunable master rates).
export const WASTAGE_PCT = 8.0;             // flat-sheet conversion wastage
export const CONVERSION_RATE_PER_KG = 8.0;  // sheeting / cutting / rewind, ₹/kg

// Printing — Flexo (roll-fed): cheap per-unit, expensive plates → wins at volume.
export const FLEXO_PLATE_COST = 9000;       // ₹ per colour, one-time
export const COVERAGE_FLEXO_RATES = { 10: 7, 30: 10, 100: 15 }; // ₹/kg of paper
export const COVERAGE_OPTS = [10, 30, 100];

// Printing — Offset (sheet-fed): cheap dies, pricier impressions → wins at low volume.
export const OFFSET_DIE_COST = 700;         // ₹ per colour, one-time
export const OFFSET_PRINT_PER_1000 = 90;    // ₹ per 1000 sheets, per colour

// Packing (per case) + per-sheet labour.
export const PACKING_MATERIALS = { poly: 1.25, carton: 70, tape: 3, label: 1 };
export const PACKING_LABOUR_PER_SHEET = 0.01;

// Per-production-run setup, amortised across order qty.
export const ORDER_RUN_SETUP = 2000;

export const WRAP_QTY_TIERS = [25000, 50000, 100000, 250000, 500000];

const round4 = (v) => Math.round(v * 10000) / 10000;
const round2 = (v) => Math.round(v * 100) / 100;

// Core calc. Input is a plain object; output is the per-sheet breakdown the
// UI renders. `paperRate` is the already-resolved ₹/kg (Master + transport).
export function calculate(f) {
  const printing = f.printing || "Plain";
  const printed = (printing === "Flexo" || printing === "Offset")
    && Number(f.colours) > 0;
  const colours = Math.max(0, parseInt(f.colours) || 0);

  const width = parseFloat(f.width) || 0;   // mm
  const length = parseFloat(f.length) || 0; // mm
  const gsm = parseFloat(f.gsm) || 0;
  const paperRate = parseFloat(f.paperRate) || 0;
  const casePack = parseInt(f.casePack) || CASE_PACK_DEFAULT;

  // Paper RM
  const areaM2 = (width / 1000) * (length / 1000);
  const weightKg = areaM2 * (gsm / 1000);
  const weightG = weightKg * 1000;
  const paperRM = weightKg * paperRate;

  // Wastage (paper only)
  const wastage = (WASTAGE_PCT / 100) * paperRM;

  // Conversion (cutting / sheeting)
  const conversion = CONVERSION_RATE_PER_KG * weightKg;

  // Printing
  let printCost = 0;
  let plateDie = 0;
  if (printed) {
    if (printing === "Flexo") {
      const covRate = COVERAGE_FLEXO_RATES[Number(f.coverage)] || 0;
      printCost = weightKg * covRate * colours;
      plateDie = colours * FLEXO_PLATE_COST;
    } else {
      printCost = (OFFSET_PRINT_PER_1000 / 1000) * colours;
      plateDie = colours * OFFSET_DIE_COST;
    }
  }

  // Packing
  const materialTotal = Object.values(PACKING_MATERIALS).reduce((s, v) => s + v, 0);
  const packMaterial = casePack > 0 ? materialTotal / casePack : 0;
  const packLabour = PACKING_LABOUR_PER_SHEET;
  const packing = packMaterial + packLabour;

  const mfg = paperRM + wastage + conversion + printCost + packing;

  const mp = parseFloat(f.margin) || 0;
  const marginAmt = mp >= 100 ? 0 : (mfg * mp) / (100 - mp);
  const sp = mfg + marginAmt;

  return {
    weightG: round4(weightG),
    paperRate: round2(paperRate),
    paperRM: round4(paperRM),
    wastage: round4(wastage),
    conversion: round4(conversion),
    printCost: round4(printCost),
    packMaterial: round4(packMaterial),
    packLabour: round4(packLabour),
    mfg: round4(mfg),
    mp,
    marginAmt: round4(marginAmt),
    sp: round4(sp),
    spCase: round2(sp * casePack),
    plateDie,
    printing: printed ? printing : "Plain",
    colours: printed ? colours : 0,
  };
}

// Rate curve across qty tiers. Plate/die + production-run setup amortise, so
// rate per sheet drops as qty grows — visible ladder even on plain orders.
export function computeWrapRateCurve(inputs, tiers = WRAP_QTY_TIERS) {
  const base = calculate(inputs);
  const oneTime = (base.plateDie || 0) + ORDER_RUN_SETUP;
  const casePack = parseInt(inputs.casePack) || CASE_PACK_DEFAULT;
  const mp = parseFloat(inputs.margin) || 0;

  const curve = tiers.map((qty) => {
    const oneTimePerSheet = qty > 0 ? oneTime / qty : 0;
    const mfgPerSheet = base.mfg + oneTimePerSheet;
    const marginAmt = mp >= 100 ? 0 : (mfgPerSheet * mp) / (100 - mp);
    const ratePerSheet = mfgPerSheet + marginAmt;
    return {
      qty,
      mfgPerSheet: round4(mfgPerSheet),
      oneTimePerSheet: round4(oneTimePerSheet),
      marginAmt: round4(marginAmt),
      ratePerSheet: round4(ratePerSheet),
      ratePerCase: round2(ratePerSheet * casePack),
      orderTotal: round2(ratePerSheet * qty),
    };
  });

  return {
    curve,
    marginPct: mp,
    mfgPerSheetBase: base.mfg,
    weightG: base.weightG,
    paperRate: base.paperRate,
    // Plate/die billed separately; setup is baked into the rate.
    plateDieTotal: base.plateDie || 0,
    runSetup: ORDER_RUN_SETUP,
    printing: base.printing,
    colours: base.colours,
  };
}

export function tierForMargin(mp) {
  const tiers = { 20: "Premium", 15: "Standard", 10: "Enterprise", 7: "Strategic" };
  if (tiers[mp]) return tiers[mp];
  const best = Object.keys(tiers).map(Number).sort((a, b) => Math.abs(a - mp) - Math.abs(b - mp))[0];
  return `~${tiers[best]}`;
}
