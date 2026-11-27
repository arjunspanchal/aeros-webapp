// Wrap paper: flat food-wrap sheets (deli paper, burger and sandwich wraps,
// basket liners, butter paper). One flat sheet, no glue. Two ways to make it,
// both from Arjun's wrap workings of Oct–Nov 2026:
//
//   reel   slit and cut from a reel. Plain, or flexo printed on the reel
//          before sheeting. Paper is the wrap's own area.
//            paper → wastage 8% → slitting + cutting ₹/kg → flexo ₹/kg → packing
//
//   sheet  cut from stock sheets (20 × 30 or 25 × 36 in). Plain, or offset
//          printed on the sheet. Paper is the whole sheet ÷ wraps per sheet, so
//          the offcut is paid for.
//            paper → wastage 8% → cutting → printer's slab card → bundling → packing
//
// Packing is in every rate: 1,000 sheets a poly, polys in a 5-ply carton costed
// on its weight, tape and label, labour. Plates and run setup are one-time
// charges, never inside the rate (the old wrap calculator spread run setup
// into the rate; that was wrong and is not carried over).

import { round, isNum, firstNum } from "../core/num.js";
import { applyMargin } from "../core/pricing.js";
import { rscCartonKg } from "./box.js";

const IN = 25.4;
export const WRAP_SHEETS = {
  "20x30": { label: "20 × 30 in", w: 20 * IN, h: 30 * IN },
  "25x36": { label: "25 × 36 in", w: 25 * IN, h: 36 * IN },
};
export const WRAP_PRINT = {
  none: { label: "Plain" },
  flexo: { label: "Flexo, printed on the reel" },
  offset: { label: "Offset, printed on stock sheets" },
};
export const WRAP_DEFAULT_LADDER = [25000, 50000, 100000, 250000, 500000];

// The offset printer's card for thin wrap sheets: print per 1,000 sheets, by
// how many sheets the job runs. [up to this many sheets, rate key suffix]
const OFFSET_SLABS = [[1000, "1000"], [2000, "2000"], [5000, "5000"], [8000, "8000"], [12000, "12000"], [16000, "16000"], [20000, "20000"], [25000, "25000"], [Infinity, "max"]];
const CALIPER_MM_PER_GSM = 0.0015; // thickness of a thin wrap sheet, from three cartons on file
const POLY_HOLDS = 1000; // sheets in one poly bag

/** Wraps that cut from one stock sheet on a guillotine: straight cuts, no gap between pieces. */
export function wrapsPerSheet(W, L, sheet) {
  const fit = (a, b) => Math.floor((sheet.w + 0.5) / a) * Math.floor((sheet.h + 0.5) / b);
  return Math.max(fit(W, L), fit(L, W));
}

/** The largest whole number of 1,000-sheet polys that keeps a case at or under the weight ceiling. */
function standardCasePack(sheetG, maxKg) {
  const polys = Math.max(1, Math.min(5, Math.floor((maxKg * 1000) / (sheetG * POLY_HOLDS))));
  return polys * POLY_HOLDS;
}

/**
 * @param spec {
 *   family: "wrap", name,
 *   W, L (mm), gsm, paperRate (₹/kg landed), paper: { label, grade, supplier },
 *   source: "reel" | "sheet"   (flexo is always reel, offset always sheet)
 *   sheet: "20x30" | "25x36" | { w, h }, ups
 *   print: { mode: "none" | "flexo" | "offset", colours, ratePerKg, per1000 }
 *   qty, casePack, carton: { perCase }, marginPct, wastagePct, cuttingPerKg, ladder
 * }
 */
export function priceWrap(spec, rates) {
  const title = `${spec.name ? `${spec.name}, ` : ""}wrap sheet ${spec.W} × ${spec.L} mm, ${spec.gsm} GSM`;
  const errors = [];
  if (!(isNum(spec.W) && spec.W > 0 && isNum(spec.L) && spec.L > 0)) errors.push("Enter the sheet width and length.");
  else if (spec.W < 50 || spec.L < 50) errors.push(`A sheet of ${spec.W} × ${spec.L} mm is too small. Sizes are in mm.`);
  else if (spec.W > 1200 || spec.L > 1200) errors.push(`A sheet of ${spec.W} × ${spec.L} mm is too big for a wrap. Check the unit.`);
  if (!(isNum(spec.gsm) && spec.gsm >= 15 && spec.gsm <= 120)) errors.push("Enter the paper GSM (wrap papers run from about 20 to 80).");
  if (!(isNum(spec.paperRate) && spec.paperRate > 0)) errors.push("Pick a paper, or enter the paper rate per kg.");
  if (spec.qty !== undefined && !(isNum(spec.qty) && spec.qty >= 1)) errors.push("Quantity must be 1 or more.");
  if (spec.marginPct !== undefined && !(isNum(spec.marginPct) && spec.marginPct > -100)) errors.push("Margin must be above -100%.");
  const mode = spec.print?.mode ?? "none";
  if (!WRAP_PRINT[mode]) errors.push("Pick how it is printed.");
  if (errors.length) return { ok: false, family: "wrap", title: "Wrap paper", errors };

  const warnings = [];
  const warn = (level, code, message) => warnings.push({ level, code, message });
  const n = (v) => Number(v).toLocaleString("en-IN");
  const colours = mode === "none" ? 0 : Math.max(1, spec.print?.colours ?? 1);
  const source = mode === "flexo" ? "reel" : mode === "offset" ? "sheet" : spec.source === "sheet" ? "sheet" : "reel";
  const { W, L, gsm, paperRate } = spec;
  const netG = ((W * L) / 1e6) * gsm;

  // ── Sheet route: how many wraps a stock sheet gives ──
  let sheet = null, ups = null, sheetKey = null;
  if (source === "sheet") {
    sheetKey = typeof spec.sheet === "string" ? spec.sheet : spec.sheet ? "custom" : "20x30";
    sheet = sheetKey === "custom" ? { label: `${spec.sheet.w} × ${spec.sheet.h} mm`, w: spec.sheet.w, h: spec.sheet.h } : WRAP_SHEETS[sheetKey];
    if (!sheet || !(sheet.w > 0 && sheet.h > 0)) return { ok: false, family: "wrap", title, errors: ["Pick the stock sheet the wraps are cut from."] };
    const fits = wrapsPerSheet(W, L, sheet);
    ups = firstNum(spec.ups, fits);
    if (!(ups >= 1)) return { ok: false, family: "wrap", title, errors: [`A ${W} × ${L} mm wrap does not fit on a ${sheet.label} sheet. Pick a bigger sheet, or make it from a reel.`] };
    if (isNum(spec.ups) && spec.ups > fits) warn("block", "ups_impossible", `${spec.ups} wraps of ${W} × ${L} mm do not fit on a ${sheet.label} sheet (${fits} do). Check the wraps per sheet.`);
  }
  // Paper bought per wrap: the wrap itself from a reel, its share of the whole sheet from stock sheets.
  const boughtG = source === "sheet" ? ((sheet.w * sheet.h) / 1e6) * gsm / ups : netG;
  const utilisation = source === "sheet" ? (ups * W * L) / (sheet.w * sheet.h) : 1;
  if (source === "sheet" && utilisation < 0.7) {
    warn("warn", "low_utilisation", `Only ${Math.round(utilisation * 100)}% of the ${sheet.label} sheet is used: the offcut is paid for. A reel has no offcut.`);
  }
  if (mode === "offset" && gsm <= 40) {
    warn("warn", "thin_on_offset", `${gsm} GSM on a sheet-fed press can curl and double-feed. Run a 100-sheet trial before a full job, or print flexo on the reel.`);
  }
  if (mode !== "none" && colours > 1) {
    warn("warn", "multi_colour_assumed", mode === "flexo"
      ? "The flexo rate is confirmed for one colour. More colours are costed at the same rate per colour, which is assumed: check with the printer."
      : "The offset card is confirmed for one colour. More colours are costed at the card rate per colour, which is assumed: check with the printer.");
  }

  // ── Packing ──
  const maxKg = rates.get("wrap.case.max_kg");
  const casePack = firstNum(spec.casePack, standardCasePack(netG, maxKg));
  const polys = Math.max(1, Math.ceil(casePack / POLY_HOLDS));
  const carton = {
    w: Math.round(Math.min(W, L) + 10), l: Math.round(Math.max(W, L) + 10),
    h: Math.round(casePack * gsm * CALIPER_MM_PER_GSM + 10),
  };
  const cartonKg = rscCartonKg({ l: carton.l, b: carton.w, h: carton.h });
  const netKg = (casePack * netG) / 1000;
  const grossKg = netKg + cartonKg;
  if (netKg > maxKg + 0.05) {
    const fitsPack = standardCasePack(netG, maxKg);
    warn("warn", "case_too_heavy", `A case of ${n(casePack)} weighs about ${round(netKg, 1)} kg, over the ${maxKg} kg ceiling. Drop the case pack to ${n(fitsPack)}.`);
  }

  const wastePct = rates.pick(spec.wastagePct, "wrap.wastage.pct");

  function costAt(qty) {
    const lines = [];
    const add = (key, label, value, basis) => lines.push({ key, label, value, basis });

    const paper = (boughtG * paperRate) / 1000;
    add("paper", "Paper", paper, source === "sheet"
      ? `${round(boughtG, 3)} g (${sheet.label} sheet ÷ ${ups}) × ₹${paperRate}/kg`
      : `${round(boughtG, 3)} g × ₹${paperRate}/kg`);
    add("wastage", "Wastage", (paper * wastePct) / 100, `${wastePct}% of paper`);

    const sheets = source === "sheet" ? Math.ceil(qty / ups) : null;
    let underMin = false;
    if (mode === "offset") {
      // The printer cuts and bundles the sheets he prints, on his card.
      const cut = rates.get("wrap.offset.cutting_per_1000");
      add("cutting", "Cutting", cut / 1000 / ups, `₹${cut} per 1,000 sheets ÷ ${ups}`);
      const bundle = rates.get("wrap.offset.bundle");
      const bundleOf = rates.get("wrap.offset.bundle_sheets");
      add("bundling", "Bundling", bundle / bundleOf / ups, `₹${bundle} per ${n(bundleOf)} sheets ÷ ${ups}`);
      const minSheets = rates.get("wrap.offset.min_sheets");
      const billed = Math.max(sheets, minSheets);
      underMin = sheets < minSheets;
      const slab = OFFSET_SLABS.find(([upTo]) => billed <= upTo)[1];
      const card = sheetKey === "25x36" || (sheetKey === "custom" && sheet.w * sheet.h > WRAP_SHEETS["20x30"].w * WRAP_SHEETS["20x30"].h) ? "25x36" : "20x30";
      const per1000 = rates.pick(spec.print?.per1000, `wrap.print.offset.${card}.${slab}`);
      const print = underMin ? (per1000 * colours * minSheets) / 1000 / qty : (per1000 * colours) / 1000 / ups;
      add("print", "Printing, offset", print, `₹${n(per1000)} per 1,000 sheets${colours > 1 ? ` × ${colours} colours` : ""}${underMin ? `, ${n(minSheets)}-sheet minimum` : ` ÷ ${ups}`} (job of ${n(sheets)} sheets)`);
    } else {
      const cutRate = rates.pick(spec.cuttingPerKg, "wrap.cutting.per_kg");
      add("cutting", source === "reel" ? "Slitting and cutting" : "Cutting", (boughtG * cutRate) / 1000, `₹${cutRate}/kg`);
      if (mode === "flexo") {
        const rate = rates.pick(spec.print?.ratePerKg, "wrap.print.flexo_per_kg");
        add("print", "Printing, flexo", (boughtG * rate * colours) / 1000, `₹${rate}/kg${colours > 1 ? ` × ${colours} colours` : ""}`);
      }
    }

    // Packing, never wasted: a poly per 1,000 sheets, the carton, tape and label, labour.
    const poly = rates.get("wrap.pack.poly");
    const cartonPerCase = isNum(spec.carton?.perCase) ? spec.carton.perCase : cartonKg * rates.get("corrugated.finished_per_kg");
    const tape = rates.get("wrap.pack.tape_label");
    const labour = rates.get("wrap.pack.labour_per_sheet");
    add("packing", "Packing", (polys * poly + cartonPerCase + tape) / casePack + labour,
      `${polys} poly${polys > 1 ? "s" : ""} ₹${poly} + carton ₹${round(cartonPerCase, 2)} + tape and label ₹${tape}, ÷ ${n(casePack)}, plus labour ₹${labour}`);

    return { lines, cost: lines.reduce((s, l) => s + l.value, 0), sheets, underMin };
  }

  const qty = spec.qty ?? 50000;
  const main = costAt(qty);
  const marginMode = "markup";
  const marginPct = rates.pick(spec.marginPct, "wrap.margin.default");
  const sell = applyMargin(main.cost, marginPct, marginMode);

  if (main.underMin) {
    warn("info", "under_min_sheets", `This job is ${n(main.sheets)} sheets, under the printer's ${n(rates.get("wrap.offset.min_sheets"))}-sheet minimum, so the print charge is flat and the rate falls quickly with quantity.`);
  }
  // Reels come in mill minimums: say so when the order is far smaller than one.
  const paperKg = (qty * boughtG * (1 + wastePct / 100)) / 1000;
  const millMoq = rates.get("wrap.paper.mill_moq_kg");
  if (source === "reel" && paperKg < millMoq) {
    warn("info", "under_mill_moq", `This order needs about ${n(Math.ceil(paperKg))} kg of paper. A mill reel order is ${n(millMoq)} kg at least, so this runs on stock paper or with another order.`);
  }

  // One-time charges.
  const oneTime = [];
  if (mode === "flexo") {
    const perColour = rates.pick(spec.print?.platePerColour, "wrap.plate.flexo_per_colour");
    oneTime.push({ key: "plates", label: `Flexo plates (${colours} colour${colours > 1 ? "s" : ""})`, value: perColour * colours, status: rates.status("wrap.plate.flexo_per_colour"), note: `₹${n(perColour)} per colour` });
  } else if (mode === "offset") {
    const perColour = rates.pick(spec.print?.platePerColour, "box.plate.blueline");
    oneTime.push({ key: "plates", label: `Offset plates (${colours} colour${colours > 1 ? "s" : ""})`, value: perColour * colours, status: rates.status("box.plate.blueline"), note: `₹${n(perColour)} per colour` });
  }
  if (source === "reel") {
    const setup = rates.get("wrap.setup.per_run");
    oneTime.push({ key: "setup", label: "Run setup", value: setup, status: rates.status("wrap.setup.per_run"), note: "per production run" });
  }
  const oneTimeTotal = oneTime.reduce((s, o) => s + (o.value ?? 0), 0);

  const ladder = (spec.ladder ?? WRAP_DEFAULT_LADDER).map((q) => {
    const c = costAt(q);
    const s = applyMargin(c.cost, marginPct, marginMode);
    return { qty: q, cost: c.cost, sell: s, sellRounded: round(s), orderValue: round(s) * q, cases: Math.ceil(q / casePack), sheets: c.sheets, underMin: c.underMin, oneTimePerPc: oneTimeTotal / q };
  });

  return {
    ok: !warnings.some((w) => w.level === "block"),
    family: "wrap",
    title,
    route: source === "sheet" ? "sheet" : "reel",
    size: { W, L },
    geometry: {
      madeFrom: source, netG, boughtG, utilisation, sheet: sheet ? { label: sheet.label, w: sheet.w, h: sheet.h } : null, ups,
      sheets: main.sheets, order: { paperKg, cartons: Math.ceil(qty / casePack) },
    },
    lines: main.lines,
    cost: main.cost,
    marginPct,
    marginMode,
    sell,
    sellRounded: round(sell),
    sellOptions: [15, 20, 25].map((m) => ({ marginPct: m, sell: round(applyMargin(main.cost, m, marginMode)) })),
    qty,
    oneTime,
    packing: { casePack, carton, netKg, grossKg, perCase: sell * casePack },
    ladder,
    export: null,
    warnings,
    ratesUsed: rates.used(),
  };
}
