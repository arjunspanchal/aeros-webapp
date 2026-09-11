// Aeros Custom Box Rate Calculator — pure calculation engine.
// Sibling of lib/calc/calculator.js (paper bags). Shares the Airtable Calculator
// base, the /calculator/* auth flow, and the QTY_TIERS / margin conventions.
//
// Box construction differs from bags: open-size blank die-cut from a sheet, then
// (for clam/boat/burger) corner/side pasting. Conversion rates are shop-floor
// rates confirmed 2026-04-21 — see memory/aeros_box_types.md for the story.

// --- Shop-floor rates (2026-04-21) ---
export const DIE_CUT_PER_1000 = 350;        // ₹ per 1000 pieces, applies to all box types
export const DIE_CUT_PER_1000_SHEETS = 300; // ₹ per 1000 MASTER SHEETS (confirmed 2026-07-24)
export const PASTING_PER_KG = 15;           // ₹/kg, 4-corner (clam/boat) and 8-side (burger) are the same rate
// Offset plates: ₹700/colour per side, from the real vendor quote (Zepto job via
// Rahul, TPC Accounts — cortex shop_floor.offset_printing). The old ₹5,000 here
// was 7.1x the quoted cost and sat on the cortex disputed list until 2026-08-03.
export const PLATE_COST_PER_COLOUR = 700;   // ₹ per colour PER SIDE, amortised over qty
// Offset printing is priced per impression: ₹400 per 1000 sheets, per colour,
// per side (cortex confirmed, ~20x30-32in sheet class). Used whenever a master
// sheet is selected. Coverage is irrelevant on offset — you buy impressions.
export const OFFSET_PRINT_PER_1000_SHEETS_PER_COLOUR = 400;
// Legacy ₹/kg-by-coverage table — FALLBACK ONLY for quotes with no master sheet
// (it is really a flexo-style ink table; see cortex disputed.box_print_rate_per_kg).
export const PRINTING_RATES = { 10: 7, 30: 10, 100: 15 };

// --- Master sheet catalogue + nesting -------------------------------------
// Sheet-fed die-cutting is priced off SHEETS CONSUMED, not the net area of the
// blank. A 250x170 blank yields 8-up on 20"x30" (87.8% yield) but only 10-up on
// 25"x36" (73.2%) — a 20% swing in board cost for an identical part. Selecting a
// master sheet switches `calculate()` from the net-area model to sheet consumption.
const IN_MM = 25.4;
export const GRIPPER_MM = 10;               // leading edge only; blanks are butt-cut by the die

export const MASTER_SHEETS = {
  "20x30": { label: '20" x 30"', w: 20 * IN_MM, h: 30 * IN_MM },
  "24.5x35.5": { label: '24.5" x 35.5" (Blueline offset)', w: 24.5 * IN_MM, h: 35.5 * IN_MM },
  "25x36": { label: '25" x 36"', w: 25 * IN_MM, h: 36 * IN_MM },
  "23x36": { label: '23" x 36"', w: 23 * IN_MM, h: 36 * IN_MM },
  // 674 x 1014 mm (26.5 x 40") — cut to a 329 mm-square blank at 6-up (fries box,
  // Aug 2026). Confirmed runnable by Arjun 2026-08-18. Spec ≥674 mm across, or
  // stock 27x40" (686 mm); never 26x40" (660 mm) which drops 2 columns to 1.
  "26.5x40": { label: '26.5" x 40" (674 x 1014 mm)', w: 674, h: 1014 },
  "custom": { label: "Custom (mm)", w: 0, h: 0 },
};

// --- Lamination / surface finishes -----------------------------------------
// Rate basis (Blueline offset, confirmed 2026-08-03): ₹ per SHEET per side
// = sheet L(in) x B(in) x factor / 100, then ÷ ups per box. The whole printed
// sheet is laminated before die-cutting, so trim is laminated too — never cost
// on the net blank.
// House convention: OUTSIDE is usually matt. INSIDE is one of: nothing, plain
// lamination, or a blister layer with lamination over it.
export const FINISH_RATES = {
  gloss_bopp: { label: "Gloss BOPP", factor: 0.45 },
  matt:       { label: "Matt",       factor: 0.55 },
  pvc:        { label: "PVC (non-food)", factor: 0.35, nonFoodGrade: true },
};
export const BLISTER_FACTOR = 0.25;   // inside base layer, optional, under lamination

// ₹ per sheet for one application of a finish on the resolved sheet.
export function finishSheetCost(layout, factor) {
  if (!layout || !factor) return 0;
  return (layout.sheetW / IN_MM) * (layout.sheetH / IN_MM) * factor / 100;
}

// Grid nesting: try each sheet axis as the feed direction (gripper comes off it)
// and both blank orientations. Returns the best of the four, or null if nothing fits.
export function bestUps(sheetW, sheetH, blankL, blankW, gripper = GRIPPER_MM) {
  const S = [Number(sheetW) || 0, Number(sheetH) || 0];
  const B = [Number(blankL) || 0, Number(blankW) || 0];
  if (!S[0] || !S[1] || !B[0] || !B[1]) return null;
  let best = null;
  for (let feed = 0; feed < 2; feed++) {
    const avail = [S[0], S[1]];
    avail[feed] -= gripper;
    for (let rot = 0; rot < 2; rot++) {
      const w = rot ? B[1] : B[0];
      const h = rot ? B[0] : B[1];
      const nx = Math.floor(avail[0] / w);
      const ny = Math.floor(avail[1] / h);
      const ups = nx * ny;
      if (ups > 0 && (!best || ups > best.ups)) {
        best = {
          ups, nx, ny, blankW: w, blankH: h, rotated: !!rot, feedAxis: feed,
          spareX: round4(avail[0] - nx * w), spareY: round4(avail[1] - ny * h),
        };
      }
    }
  }
  if (best) best.yieldPct = round4((100 * best.ups * B[0] * B[1]) / (S[0] * S[1]));
  return best;
}

// Resolve the selected master sheet to {w, h} in mm. "custom" reads the overrides.
export function resolveSheet(f) {
  if (!f?.masterSheet) return null;
  const preset = MASTER_SHEETS[f.masterSheet];
  if (!preset) return null;
  if (f.masterSheet === "custom") {
    const w = Number(f.customSheetW) || 0;
    const h = Number(f.customSheetH) || 0;
    return w && h ? { w, h, label: `${w} x ${h} mm` } : null;
  }
  return preset;
}

// Full nesting result for the current form, or null when no sheet is selected.
export function sheetLayout(f) {
  const s = resolveSheet(f);
  if (!s) return null;
  const best = bestUps(s.w, s.h, f.openLength, f.openWidth, f.gripperMm ?? GRIPPER_MM);
  if (!best) return null;
  return { ...best, sheetW: s.w, sheetH: s.h, sheetLabel: s.label };
}

// Box-type catalogue. Extending this is the main path for adding new box styles.
// `pasted` drives whether PASTING_PER_KG is applied. `corrugated` switches the
// weight+conversion model to multi-ply BOM + user-supplied ₹/kg (no die-cut / pasting).
// `defaultWastage` is the fallback when the admin leaves the override blank.
export const BOX_TYPES = {
  cake:       { label: "Cake Box (flat)",     pasted: false, defaultWastage: 5 },
  clam:       { label: "Clam Food Box",       pasted: true,  defaultWastage: 7 },
  boat:       { label: "Boat Tray",           pasted: true,  defaultWastage: 7 },
  burger:     { label: "Burger Box",          pasted: true,  defaultWastage: 7 },
  corrugated: { label: "Corrugated Carton",   pasted: false, defaultWastage: 10, corrugated: true },
  // `bespoke` keeps a type out of the self-serve client calculator: the rate
  // depends on tape spec and strap layout that a customer can't supply, and the
  // client API would silently price it without tape.
  sealer:     { label: "Bag Sealer / Topper", pasted: false, defaultWastage: 7, taped: true, bespoke: true },
  custom:     { label: "Custom",              pasted: true,  defaultWastage: 7 },
};

// Double-sided tape straps (bag sealers / toppers). The strap is a bought-in
// component priced per metre, NOT a paste line — pasting ₹/kg does not apply.
// Reference: Stick Tapes PO-03195 (27-05-2026), 10mm x 50m tissue tape @ ₹40/roll
// = ₹0.80/m ex-GST. See memory/aeros_bag_sealer_costing.md.
export const TAPE_ROLL_LENGTH_M = 50;       // standard roll length
export const TAPE_SPLICE_WASTAGE = 5;       // % — roll changeover / start-end loss

export function isTaped(boxType) {
  return !!BOX_TYPES[boxType]?.taped;
}

// Box types a client may self-serve. Bespoke types are admin-only.
export const CLIENT_BOX_TYPES = Object.fromEntries(
  Object.entries(BOX_TYPES).filter(([, cfg]) => !cfg.bespoke)
);

// Flute take-up: the corrugated medium is longer than the flat liner by this factor.
// Values are industry-standard for single-wall flute profiles.
export const FLUTE_PROFILES = {
  A: { label: "A-flute (~5mm)",   takeUp: 1.54 },
  B: { label: "B-flute (~3mm)",   takeUp: 1.36 },
  C: { label: "C-flute (~4mm)",   takeUp: 1.43 },
  E: { label: "E-flute (~1.5mm)", takeUp: 1.27 },
};

export const PLY_OPTIONS = [2, 3, 5];

// RSC shipper mode (Sep 2026, vendor-validated on the 14oz-tub master carton):
// blank = 2(L+B) + glue lap wide × H+B tall, from the box OUTER dimensions.
// Starch (corrugation adhesive) adds ~18 GSM of weight across the blank but is
// not a paper line. The weight model reproduced three vendor-weighed boxes
// (180/120, 150/120, 120/120 5-ply) within ~1.2% using C-flute take-up 1.43.
export const RSC_GLUE_LAP_MM = 40;
export const RSC_STARCH_GSM = 18;
// Confirmed market rate for finished 5-ply brown kraft shippers: vendor ladder
// priced flat at ₹52.6/kg regardless of GSM mix, matching the ₹53-54/kg measured
// on DW cup cartons from a second vendor. Use as a sanity band, not a price.
export const SHIPPER_BENCHMARK_PER_KG = 52.6;

// Derived RSC blank when the admin enters box OD instead of a flat blank.
// Returns null unless rscMode is on and all three dims are present, so legacy
// manual-blank corrugated quotes compute exactly as before.
export function rscBlank(f) {
  if (!f.rscMode) return null;
  const L = Number(f.boxL) || 0;
  const B = Number(f.boxB) || 0;
  const H = Number(f.boxH) || 0;
  if (!L || !B || !H) return null;
  return { blankW: 2 * (L + B) + RSC_GLUE_LAP_MM, blankH: H + B };
}

// Seed layer BOM when ply changes. Positions are fixed per ply count.
// `kind: "flute"` applies FLUTE_PROFILES[flute].takeUp to that layer's area.
// Rates seeded from the Sep-2026 bottom-up that reproduced real vendor pricing
// (liner ₹42 / flute-and-inner ₹38, conversion ₹12/kg → ≈₹52.6/kg finished).
export function defaultCorrugatedLayers(ply) {
  const liner = () => ({ kind: "liner", paperId: "", paperName: "", gsm: 150, paperRate: 42 });
  const flute = () => ({ kind: "flute", paperId: "", paperName: "", gsm: 120, paperRate: 38 });
  if (ply === 2) return [{ ...liner(), position: "Liner" }, { ...flute(), position: "Flute" }];
  if (ply === 5) return [
    { ...liner(), position: "Top liner" },
    { ...flute(), position: "Flute 1" },
    { ...liner(), position: "Middle liner" },
    { ...flute(), position: "Flute 2" },
    { ...liner(), position: "Bottom liner" },
  ];
  return [
    { ...liner(), position: "Top liner" },
    { ...flute(), position: "Flute" },
    { ...liner(), position: "Bottom liner" },
  ];
}

export function isCorrugated(boxType) {
  return !!BOX_TYPES[boxType]?.corrugated;
}

export const BOX_TYPE_LABEL = Object.fromEntries(
  Object.entries(BOX_TYPES).map(([k, v]) => [k, v.label])
);

export const QTY_TIERS = [5000, 10000, 25000, 50000, 100000];

const round4 = (v) => Math.round(v * 10000) / 10000;

export function getDefaultWastage(boxType) {
  return BOX_TYPES[boxType]?.defaultWastage ?? 5;
}

export function isPasted(boxType) {
  return !!BOX_TYPES[boxType]?.pasted;
}

// Core per-box calculation. Geometry is flat open-size (L × W × GSM) for SBS
// box types; for corrugated, weight is summed across the layer BOM with flute
// take-up applied to fluting layers. `qty` amortises plate + punching die costs;
// computeRateCurve() re-runs the amortisation across QTY_TIERS.
export function calculate(f) {
  const corrugated = isCorrugated(f.boxType);
  // RSC mode derives the flat blank from box OD; otherwise the admin-entered
  // open size is used directly (legacy behaviour, all non-corrugated types).
  const rsc = corrugated ? rscBlank(f) : null;
  const L = rsc ? rsc.blankW : Number(f.openLength) || 0;
  const W = rsc ? rsc.blankH : Number(f.openWidth) || 0;
  const qty = Number(f.qty) || 1;

  // Weight + paper cost. Corrugated sums per-layer contributions (flute layers
  // take up more medium per the flute profile); SBS uses a single GSM/rate.
  let wkg = 0;
  let paperCost = 0;
  if (corrugated) {
    const takeUp = FLUTE_PROFILES[f.flute]?.takeUp ?? FLUTE_PROFILES.B.takeUp;
    for (const layer of (f.layers || [])) {
      const g = Number(layer.gsm) || 0;
      const r = Number(layer.paperRate) || 0;
      const factor = layer.kind === "flute" ? takeUp : 1;
      const layerKg = (L * W * g * factor) / 1_000_000_000;
      wkg += layerKg;
      paperCost += layerKg * r;
    }
    // Starch weight (RSC mode only, to keep legacy manual-blank quotes
    // bit-identical). Weight only — adhesive isn't a paper cost line.
    if (rsc) wkg += (L * W * RSC_STARCH_GSM) / 1_000_000_000;
  } else {
    const gsm = Number(f.gsm) || 0;
    const paperRate = Number(f.paperRate) || 0;
    // Sheet-consumption model when a master sheet is selected: the job pays for
    // the whole sheet, so trim waste is priced in via ups. Falls back to net
    // blank area (legacy behaviour) when no sheet is chosen.
    const layout = sheetLayout(f);
    wkg = layout
      ? (layout.sheetW * layout.sheetH * gsm) / 1_000_000_000 / layout.ups
      : (L * W * gsm) / 1_000_000_000;
    paperCost = wkg * paperRate;
  }

  const layout = corrugated ? null : sheetLayout(f);
  const netKg = (L * W * (Number(f.gsm) || 0)) / 1_000_000_000;

  // Conversion differs by construction:
  //  - SBS: fixed die-cut ₹350/1000 + optional pasting ₹15/kg.
  //  - Corrugated: admin-supplied ₹/kg (board-making) + ₹/carton (stitching/glueing);
  //    no die-cut or pasting line. Shop-floor rates aren't fixed yet (2026-04-24).
  //  - Sheet basis: ₹300/1000 master sheets ÷ ups. On an 8-up blank that is
  //    ₹0.0375/pc vs ₹0.35/pc on the per-piece basis — a 10x difference, so the
  //    basis must match how the punching vendor actually quotes.
  const sheetBasis = !corrugated && f.dieCutBasis === "sheet" && layout;
  const dieCutCost = corrugated
    ? 0
    : sheetBasis
    ? DIE_CUT_PER_1000_SHEETS / 1000 / layout.ups
    : DIE_CUT_PER_1000 / 1000;
  const corrugationRate = Number(f.corrugationRate) || 0;
  const corrugationCost = corrugated ? wkg * corrugationRate : 0;
  const stitchingCost = corrugated ? (Number(f.stitchingPerCarton) || 0) : 0;

  // Pasting (clam-forming / 8-side / none). Not applied to corrugated cartons.
  const pastingCost = !corrugated && isPasted(f.boxType) ? wkg * PASTING_PER_KG : 0;

  // Double-sided tape straps. Bought-in per metre; application is a separate
  // labour/machine line per piece. `tapeStraps` x `tapeStrapLength` is the run
  // length consumed per blank, plus splice loss at roll changeover.
  const taping = f.taping ?? isTaped(f.boxType);
  const tapeStraps = Number(f.tapeStraps) || 0;
  const tapeStrapLengthM = (Number(f.tapeStrapLength) || 0) / 1000;
  const tapeWastagePct = f.tapeWastagePct !== "" && f.tapeWastagePct !== undefined && f.tapeWastagePct !== null
    ? parseFloat(f.tapeWastagePct)
    : TAPE_SPLICE_WASTAGE;
  const tapeMetresPerPc = taping ? tapeStraps * tapeStrapLengthM * (1 + tapeWastagePct / 100) : 0;
  const tapeCost = tapeMetresPerPc * (Number(f.tapeRatePerM) || 0);
  const tapeApplyCost = taping ? Number(f.tapeApplyPerPc) || 0 : 0;

  // Lamination / finishes. Sheet-basis rates, so a master sheet + layout is
  // required — without one the finish silently costs 0, which optimizationTips
  // flags. Outside and inside are independent; blister is an inside base layer
  // that can sit under (or without) an inside lamination.
  const upsForFinish = layout?.ups || 0;
  const outsideFinishCost = !corrugated && upsForFinish && FINISH_RATES[f.outsideFinish]
    ? finishSheetCost(layout, FINISH_RATES[f.outsideFinish].factor) / upsForFinish : 0;
  const insideFinishCost = !corrugated && upsForFinish && FINISH_RATES[f.insideFinish]
    ? finishSheetCost(layout, FINISH_RATES[f.insideFinish].factor) / upsForFinish : 0;
  const blisterCost = !corrugated && upsForFinish && f.insideBlister
    ? finishSheetCost(layout, BLISTER_FACTOR) / upsForFinish : 0;
  const finishCost = outsideFinishCost + insideFinishCost + blisterCost;

  // Printing — ₹/kg by coverage. Plate cost amortised over qty.
  // Printing. Impressions = colours x printed sides (a 2-col both-sides job is
  // 4 impressions and 4 plates). With a master sheet selected the confirmed
  // offset basis applies: ₹400/1000 sheets per impression ÷ ups. Without a
  // sheet there is no ups, so the legacy ₹/kg table is the fallback.
  const printSides = Math.min(2, Math.max(1, Number(f.printSides) || 1));
  const impressions = f.printing ? (Number(f.colours) || 0) * printSides : 0;
  const offsetBasis = !corrugated && !!layout && f.printing;
  const printRate = !offsetBasis && f.printing && f.coverage ? (PRINTING_RATES[f.coverage] ?? 0) : 0;
  const printCost = offsetBasis
    ? (impressions * OFFSET_PRINT_PER_1000_SHEETS_PER_COLOUR) / 1000 / layout.ups
    : wkg * printRate;
  const plateCostTotal = impressions * PLATE_COST_PER_COLOUR;
  const plateCostPerBox = plateCostTotal / qty;

  // Punching (optional, separate from die-cut). Die cost amortised; per-piece rate added.
  const punchingDieTotal = f.punching ? (Number(f.punchingDieCost) || 0) : 0;
  const punchingDiePerBox = punchingDieTotal / qty;
  const punchingPerPiece = f.punching ? (Number(f.punchingPerPiece) || 0) : 0;
  const punchingCost = punchingDiePerBox + punchingPerPiece;

  // Inner packing (poly / strapping). `innerPackQty` is boxes per inner pack.
  const innerPackRate = Number(f.innerPackRate) || 0;
  const innerPackQty = Number(f.innerPackQty) || 0;
  const innerPackCost = innerPackQty > 0 ? innerPackRate / innerPackQty : 0;

  // Outer carton. `boxesPerCarton` is how many boxes fit per carton.
  const outerCartonRate = Number(f.outerCartonRate) || 0;
  const boxesPerCarton = Number(f.boxesPerCarton) || 0;
  const outerCartonCost = boxesPerCarton > 0 ? outerCartonRate / boxesPerCarton : 0;

  // Wastage — % of paper cost (same pattern as lib/calc/calculator.js)
  const wastagePct = f.customWastage !== "" && f.customWastage !== undefined && f.customWastage !== null
    ? parseFloat(f.customWastage)
    : getDefaultWastage(f.boxType);
  const wastageCost = (wastagePct / 100) * paperCost;

  const totalMfg =
    paperCost + dieCutCost + corrugationCost + stitchingCost + pastingCost + printCost +
    plateCostPerBox + punchingCost + innerPackCost + outerCartonCost + wastageCost +
    tapeCost + tapeApplyCost + finishCost;

  const profitPct = f.profitPercent > 0 ? f.profitPercent : 10;
  const profit = (profitPct / 100) * totalMfg;
  const sellingPrice = totalMfg + profit;

  return {
    wkg: round4(wkg), paperCost: round4(paperCost),
    rscBlank: rsc,
    // Finished ₹/kg — the number corrugators actually price on. Only meaningful
    // for corrugated cartons; compare against SHIPPER_BENCHMARK_PER_KG.
    perKgFinished: corrugated && wkg > 0 ? round4(sellingPrice / wkg) : 0,
    perKgMfg: corrugated && wkg > 0 ? round4(totalMfg / wkg) : 0,
    layout, netKg: round4(netKg), sheetBasis: !!sheetBasis,
    tapeCost: round4(tapeCost), tapeApplyCost: round4(tapeApplyCost),
    tapeMetresPerPc: round4(tapeMetresPerPc), tapeWastagePct: round4(tapeWastagePct),
    outsideFinishCost: round4(outsideFinishCost), insideFinishCost: round4(insideFinishCost),
    blisterCost: round4(blisterCost), finishCost: round4(finishCost),
    dieCutCost: round4(dieCutCost),
    corrugationCost: round4(corrugationCost),
    stitchingCost: round4(stitchingCost),
    pastingCost: round4(pastingCost),
    printRate, printCost: round4(printCost),
    offsetBasis, printSides, impressions,
    plateCostTotal, plateCostPerBox: round4(plateCostPerBox),
    punchingCost: round4(punchingCost), punchingDieTotal, punchingPerPiece,
    innerPackCost: round4(innerPackCost),
    outerCartonCost: round4(outerCartonCost),
    wastagePct: round4(wastagePct), wastageCost: round4(wastageCost),
    totalMfg: round4(totalMfg),
    profitPct: round4(profitPct), profit: round4(profit),
    sellingPrice: round4(sellingPrice),
  };
}

// Re-amortise plate + punching die across each qty tier. Paper/pasting/print/
// inner-pack/outer-carton/die-cut are all per-piece so they don't change with qty.
export function computeRateCurve(inputs, tiers = QTY_TIERS) {
  const anchorQty = inputs.qty || tiers[0];
  const base = calculate({ ...inputs, qty: anchorQty });
  return tiers.map((qty) => {
    const plateAmortised = base.plateCostTotal / qty;
    const punchDieAmortised = (base.punchingDieTotal || 0) / qty;
    const baseWithoutAmort =
      base.totalMfg - base.plateCostPerBox - ((base.punchingDieTotal || 0) / anchorQty);
    const mfgPerBox = baseWithoutAmort + plateAmortised + punchDieAmortised;
    const profit = (inputs.profitPercent / 100) * mfgPerBox;
    const ratePerBox = mfgPerBox + profit;
    return {
      qty,
      mfgPerBox: round4(mfgPerBox),
      plateAmortised: round4(plateAmortised),
      punchDieAmortised: round4(punchDieAmortised),
      ratePerBox: round4(ratePerBox),
      orderTotal: Math.round(ratePerBox * qty * 100) / 100,
    };
  });
}

export function optimizationTips(f, result) {
  const tips = [];
  if (isCorrugated(f.boxType)) {
    if (!f.corrugationRate) tips.push("Corrugation rate (₹/kg) not entered — mfg cost excludes board conversion.");
    if (!f.stitchingPerCarton) tips.push("Stitching/glueing rate not entered — finishing cost missing.");
    const hasEmptyLayer = (f.layers || []).some((l) => !l.gsm || !l.paperRate);
    if (hasEmptyLayer) tips.push("One or more layers have no GSM or rate — weight will be understated.");
    // Market sanity band: vendor-confirmed ₹52.6/kg finished (Sep 2026), second
    // vendor measured at ₹53-54/kg. Well outside that band means an input is off.
    const perKg = result?.perKgFinished;
    if (perKg > 0) {
      if (perKg > SHIPPER_BENCHMARK_PER_KG * 1.15) {
        tips.push(`Sell works out to ₹${perKg.toFixed(1)}/kg finished — the confirmed market band is ₹52-55/kg. Check paper rates / conversion / margin.`);
      } else if (perKg < SHIPPER_BENCHMARK_PER_KG * 0.9) {
        tips.push(`Sell works out to ₹${perKg.toFixed(1)}/kg finished — below the ₹52-55/kg market band. A vendor can't match this; an input is likely understated.`);
      }
    }
    if (f.rscMode && !result?.rscBlank) {
      tips.push("RSC mode is on but box L/B/H are incomplete — falling back to the manual open-size blank.");
    }
  } else {
    if (f.gsm > 350) tips.push("GSM above 350 may be over-spec — review carton/food safety requirements.");
    const layout = result?.layout;
    if (!f.masterSheet) {
      tips.push("No master sheet selected — paper is costed on net blank area, which understates board spend. Pick a sheet to price actual consumption.");
    } else if (!layout) {
      tips.push("Blank does not fit the selected master sheet, even rotated. Check open size or pick a larger sheet.");
    } else {
      // Compare every preset sheet; a bad sheet choice is the single biggest
      // avoidable cost on a die-cut blank (20-25% of board spend).
      const alts = Object.entries(MASTER_SHEETS)
        .filter(([k]) => k !== "custom" && k !== f.masterSheet)
        .map(([k, s]) => {
          const b = bestUps(s.w, s.h, f.openLength, f.openWidth, f.gripperMm ?? GRIPPER_MM);
          return b ? { key: k, label: s.label, kgPerPc: (s.w * s.h) / b.ups, yieldPct: b.yieldPct, ups: b.ups } : null;
        })
        .filter(Boolean);
      const currentPerPc = (layout.sheetW * layout.sheetH) / layout.ups;
      const better = alts.filter((a) => a.kgPerPc < currentPerPc * 0.99)
        .sort((a, b) => a.kgPerPc - b.kgPerPc)[0];
      if (better) {
        const saving = (1 - better.kgPerPc / currentPerPc) * 100;
        tips.push(`${better.label} yields ${better.ups}-up at ${better.yieldPct.toFixed(1)}% — ${saving.toFixed(0)}% less board per piece than the selected sheet.`);
      } else if (layout.yieldPct < 80) {
        tips.push(`Sheet yield is only ${layout.yieldPct.toFixed(1)}% (${layout.ups}-up) — ${(100 - layout.yieldPct).toFixed(0)}% of the board is trim. A mill-cut sheet sized to the blank would recover most of it.`);
      }
      if (layout.spareX < 5 || layout.spareY < 5) {
        tips.push(`Only ${Math.min(layout.spareX, layout.spareY).toFixed(0)}mm spare across the layout — the sheet must be squarely trimmed, no side-trim allowance available.`);
      }
    }
    if (f.dieCutBasis === "sheet" && !f.masterSheet) {
      tips.push("Die-cutting is set to per-sheet but no master sheet is selected — falling back to ₹350/1000 pieces.");
    }
    if ((FINISH_RATES[f.outsideFinish] || FINISH_RATES[f.insideFinish] || f.insideBlister) && !result?.layout) {
      tips.push("A finish is selected but no master sheet is set — lamination is sheet-priced, so it's costing ₹0. Pick a master sheet.");
    }
    if (f.outsideFinish === "pvc" || f.insideFinish === "pvc") {
      tips.push("PVC lamination is NOT food grade — do not use on food-contact surfaces.");
    }
    if (f.insideBlister && !FINISH_RATES[f.insideFinish]) {
      tips.push("Blister layer inside with no lamination over it — confirm that's intended (usual build is blister + matt over).");
    }
    if (result?.tapeCost > 0) {
      const tapeShare = (100 * (result.tapeCost + result.tapeApplyCost)) / result.totalMfg;
      if (tapeShare > 30) tips.push(`Tape + application is ${tapeShare.toFixed(0)}% of mfg cost — worth pricing jumbo logs and slitting in-house.`);
      if (!f.tapeApplyPerPc) tips.push("Tape application rate is ₹0 — labour/machine time for applying the strap is missing.");
    }
  }
  if (f.printing && !result?.offsetBasis && !isCorrugated(f.boxType))
    tips.push("Printing is on the legacy ₹/kg fallback — select a master sheet to price offset per-impression (₹400/1000 sheets/colour-side).");
  if (f.printing && result?.offsetBasis && f.coverage === 100)
    tips.push("Coverage doesn't change offset cost — impressions do. 100% and 10% coverage price the same.");
  if (f.printing && (result?.impressions || 0) > 4)
    tips.push(`${result.impressions} impressions (colours x sides) = ₹${(result.impressions * PLATE_COST_PER_COLOUR).toLocaleString("en-IN")} in plate costs.`);
  if (!f.outerCartonRate && !isCorrugated(f.boxType)) tips.push("Outer carton cost not entered — per-box logistics will be missing.");
  if (!tips.length) tips.push("Inputs look reasonable. Main savings: paper GSM, coverage %, and outer carton economy.");
  return tips;
}
