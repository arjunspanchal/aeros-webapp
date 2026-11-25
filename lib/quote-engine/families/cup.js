// Paper cups (single wall, double wall, ripple) and Ø115 paper tubs.
//
// A line-for-line port of the cup skill's rate_calc.py, which is the method
// Arjun quotes from: cost the paper BOUGHT (die sheet ÷ ups), never a guessed
// blank, and let a measured cup weight override the GSM build. The old
// lib/calc/cup-calculator.js (Ø75 bottom, ×0.908 fudge, PE ₹13) is not used.
//
// __tests__/cup.diff.test.js checks this file against the Python script's
// output, case by case.

import { round, isNum, firstNum } from "../core/num.js";
import { applyMargin } from "../core/pricing.js";
import { fobCharges } from "../core/export.js";

// ── Dies. VERIFIED = traced from the production punch line. ──────────────────
// size: sheet w × h (mm), ups, verified, trim %
export const SIDEWALL_DIES = {
  "8oz": { w: 870, h: 378.0, ups: 12, verified: true, trimPct: 18.05 },
  "10oz": { w: 740, h: 410.0, ups: 9, verified: false, trimPct: null },
  "12oz": { w: 740, h: 318.59, ups: 6, verified: true, trimPct: 23.98 },
  "16oz": { w: 740, h: 360.0, ups: 6, verified: true, trimPct: 22.39 },
  "20oz": { w: 750, h: 406.0, ups: 6, verified: false, trimPct: null },
};

// DW outer wrap, flexo on the reel: reel width × repeat ÷ cups per repeat.
// 8/12/16oz are from the final plate files (24-Oct-2026); 10/20oz are old engine values.
export const OUTER_FANS = {
  "8oz": { w: 675, h: 368.3, ups: 12 },
  "10oz": { w: 745, h: 342, ups: 9 },
  "12oz": { w: 740, h: 457.2, ups: 12 },
  "16oz": { w: 750, h: 409.58, ups: 9 },
  "20oz": { w: 750, h: 400, ups: 6 },
};

// DW outer wall printed offset: its own sheet, not the flexo reel layout.
// 8oz and 12oz are measured from the Blueline layouts; 10oz and 16oz are assumed.
export const OFFSET_OUTERS = {
  "8oz": { w: 678, h: 415, ups: 12, measured: true },
  "10oz": { w: 740, h: 415, ups: 9, measured: false },
  "12oz": { w: 740, h: 380.5, ups: 9, measured: true },
  "16oz": { w: 750, h: 440, ups: 9, measured: false },
};

// Bottom disc punched from a roll: roll width × pitch, GSM.
export const BOTTOMS = {
  "8oz": { roll: 69, pitch: 66, gsm: 210 },
  "10oz": { roll: 78, pitch: 74, gsm: 230 },
  "12oz": { roll: 78, pitch: 74, gsm: 230 },
  "16oz": { roll: 78, pitch: 74, gsm: 230 },
  "20oz": { roll: 78, pitch: 74, gsm: 230 },
};

const TUB_BOTTOM = { mm2: 115 * 122.8, gsm: 260 }; // shared by the Ø115 family
export const TUB_DIES = {
  "350_ml": { w: 670, h: 380, ups: 8, glueG: 0.55 },
  "400_ml": { w: 670, h: 405, ups: 8, glueG: 0.65 },
  "750_ml": { w: 675, h: 439, ups: 6, glueG: 0.8 },
};

// ── Make or buy. A die on file does NOT mean we make the size. ───────────────
export const IN_HOUSE = {
  SW: ["8oz", "10oz", "12oz", "16oz"],
  DW: ["8oz", "10oz", "12oz", "16oz"],
  TUB: ["350_ml", "400_ml", "500_ml", "750_ml"],
  RIPPLE: [], // not confirmed whether we run ripple in-house
};
export const BOUGHT_IN = {
  "SW|20oz": "Carma Industries",
  "DW|20oz": "Carma Industries",
  "DW|4oz": "Carma Industries",
  "SW|24oz": null, // not made, not sourced
  "DW|24oz": null,
};

const GLUE_G = { "8oz": 0.3, "10oz": 0.35, "12oz": 0.4, "16oz": 0.5, "20oz": 0.6 };
const GLUE_FACTOR = { SW: 1.0, DW: 1.8, RIPPLE: 2.5 };
const FLUTE_TAKEUP = 1.43;

// Cartons: units per case, ₹ per case, measured?
const CARTONS = {
  "DW|8oz": [500, 54, true], "DW|12oz": [500, 61, true], "DW|16oz": [500, 68, true],
  "SW|8oz": [1000, 70, false], "SW|12oz": [1000, 70, false], "SW|16oz": [1000, 70, false],
  "TUB|350_ml": [1000, 78.44, true], "TUB|400_ml": [1000, 77.76, true],
  "TUB|500_ml": [1000, 97.6, true], "TUB|750_ml": [1000, 97.39, true],
};

export const CUP_WALLS = { SW: "Single wall", DW: "Double wall", RIPPLE: "Ripple", TUB: "Paper tub Ø115" };
export const CUP_DEFAULT_LADDER = [10000, 25000, 50000, 100000, 250000];

function conversionPerUnit(wall, rates) {
  if (wall === "DW") return rates.get("cup.conversion.dw");
  const pool = rates.get("cup.overhead.monthly_pool");
  return pool / (rates.get("cup.fleet.hours") * 60 * rates.get(`cup.cpm.${wall}`) * rates.get("cup.fleet.machines"));
}

/**
 * @param {object} spec
 *   wall            "SW" | "DW" | "RIPPLE" | "TUB"
 *   size            "8oz" … "20oz", or "350_ml" … "750_ml" for tubs
 *   gsm, outerGsm   wall board GSM (default 280)
 *   cupWeight       measured finished cup, g; overrides the GSM build
 *   paper           "APP" | "APP_VOLUME" | "TNPL";  paperRate overrides it
 *   polyBoard       true = walls are PE-coated board bought by the kg (rate book,
 *                   or polyRate to set it for this quote)
 *   polyRate        ₹/kg for PE-coated wall board, PE weight included
 *   innerPeGsm, outerPeGsm   PE g/m² when polyRate is used (18 / 15)
 *   outerPaper      "APP" | "APP_VOLUME" | "TNPL": uncoated board for the DW outer
 *   outerRate       ₹/kg for that outer board, set for this quote (+ 1-side PE adder)
 *   outerCoated, outerSheet {w,h,ups}, outerReel
 *   print           { mode: "none"|"flexo"|"offset", ratePerKg, colours, varnish,
 *                     offsetSheetRate }  offset with no offsetSheetRate is costed as
 *                   a Blueline job: Pantone card + varnish + punch over qty ÷ ups
 *                   + make-ready sheets
 *   punchPerKg, viana, scrapCredit
 *   sheet {w,h,ups}, glueG   a real die for a size with none on file
 *   casePack, carton (₹/case)
 *   vendorRate      bought-in sizes: the vendor's ₹/cup
 *   marginPct, qty, ladder
 *   export          { chargesPerContainer, unitsPerContainer, fx, us }
 */
export function priceCup(spec, rates) {
  const wall = String(spec.wall ?? "").toUpperCase();
  const size = spec.size;
  if (!CUP_WALLS[wall]) return { ok: false, family: "cup", errors: ["Pick a wall type."] };
  if (!size) return { ok: false, family: "cup", errors: ["Pick a size."] };

  const warnings = [];
  const warn = (level, code, message) => warnings.push({ level, code, message });
  const marginMode = "on_sell";
  const marginPct = rates.pick(spec.marginPct, "cup.margin.default");
  const title = `${CUP_WALLS[wall]} ${size.replace("_", " ")}`;

  const invalid = [];
  if (!(marginPct < 100)) invalid.push("Margin on the selling price must be under 100%.");
  if (spec.gsm !== undefined && !(isNum(spec.gsm) && spec.gsm > 0)) invalid.push("Wall GSM must be above zero.");
  if (spec.outerGsm !== undefined && !(isNum(spec.outerGsm) && spec.outerGsm > 0)) invalid.push("Outer wall GSM must be above zero.");
  if (spec.casePack !== undefined && !(isNum(spec.casePack) && spec.casePack >= 1)) invalid.push("Case pack must be 1 or more.");
  if (spec.qty !== undefined && spec.qty !== null && !(isNum(spec.qty) && spec.qty >= 1)) invalid.push("Quantity must be 1 or more.");
  if (spec.vendorRate !== undefined && !(isNum(spec.vendorRate) && spec.vendorRate > 0)) invalid.push("Vendor rate must be above zero.");
  for (const [name, sh] of [["Die sheet", spec.sheet], ["Outer sheet", spec.outerSheet]]) {
    if (sh && !(sh.w > 0 && sh.h > 0 && sh.ups >= 1)) invalid.push(`${name} needs a width, a height and at least 1 up.`);
  }
  if (invalid.length) return { ok: false, family: "cup", title, errors: invalid, warnings };

  // Make-or-buy guard: never cost a size we do not make.
  if (!IN_HOUSE[wall].includes(size)) {
    const key = `${wall}|${size}`;
    const source = BOUGHT_IN[key];
    if (source && isNum(spec.vendorRate)) {
      const uplift = rates.get("traded.uplift_pct");
      const cost = spec.vendorRate * (1 + uplift / 100);
      const sell = applyMargin(cost, marginPct, marginMode);
      return {
        ok: true, family: "cup", title, route: "bought_in", source,
        lines: [
          { key: "vendor", label: "Vendor rate", value: spec.vendorRate, basis: "bought-in size" },
          { key: "uplift", label: "Landing uplift", value: cost - spec.vendorRate, basis: `${uplift}% on the vendor rate` },
        ],
        cost, marginPct, marginMode, sell, sellRounded: round(sell), qty: spec.qty ?? null,
        oneTime: [], ladder: [], packing: null, export: null, warnings, ratesUsed: rates.used(),
      };
    }
    const msg = source
      ? `${title} is not made in-house. It is bought from a vendor: enter the vendor's rate to price it.`
      : key in BOUGHT_IN
        ? `${title} is not made and not sourced. Mark the line "Not offered".`
        : `${title} is not on the in-house list. Confirm we make it before costing; never estimate a die.`;
    return { ok: false, family: "cup", title, route: source ? "bought_in" : "not_offered", source: source ?? null, errors: [msg], warnings };
  }

  const isTub = wall === "TUB";
  const isDw = wall === "DW" || wall === "RIPPLE";
  const gsm = spec.gsm ?? 280;
  const paperName = spec.paper ?? "APP";
  const paperRate = rates.pick(spec.paperRate, `cup.paper.${paperName}`);
  const coat1 = rates.get("cup.coat.one_side");
  const coat2 = rates.get("cup.coat.two_side");
  const lines = [];
  const add = (key, label, value, basis) => lines.push({ key, label, value, basis });

  const mode = spec.print?.mode ?? "none";
  // The outer wall's layout: a sheet typed for this quote, else the offset
  // sheet on an offset job, else the flexo reel layout.
  const offsetOuter = wall === "DW" && mode === "offset" && !spec.outerSheet ? OFFSET_OUTERS[size] ?? null : null;
  const outerLayout = () => {
    let of = { ...(spec.outerSheet ?? offsetOuter ?? OUTER_FANS[size]) };
    if (isNum(spec.outerReel)) of.w = spec.outerReel; // cut from a wider reel: side trim is paid for
    return of;
  };

  // ── Paper bought per unit, g ──
  let swBought, btBought, ofBought = 0, glueG, btGsm, ups, trimPct = null, dieNote;
  if (isTub) {
    let die = TUB_DIES[size];
    if (!die) {
      if (!(spec.sheet && isNum(spec.glueG))) {
        return { ok: false, family: "cup", title, errors: [`We make ${size.replace("_", " ")} tubs but the die is not on file. Enter the real punch-line sheet (W × H, ups) and glue grams.`], warnings };
      }
      die = { ...spec.sheet, glueG: spec.glueG };
    } else if (spec.sheet || isNum(spec.glueG)) {
      // A real die typed in for this quote replaces the one on file.
      die = { ...die, ...(spec.sheet ?? {}), glueG: firstNum(spec.glueG, die.glueG) };
      if (spec.sheet) warn("warn", "die_unverified", `Costed on the sheet entered (${die.w} × ${die.h} @ ${die.ups}-up), not the die on file.`);
    }
    ups = die.ups;
    swBought = ((die.w * die.h) / die.ups / 1e6) * gsm;
    btGsm = TUB_BOTTOM.gsm;
    btBought = (TUB_BOTTOM.mm2 / 1e6) * btGsm;
    glueG = die.glueG;
    dieNote = `tub sheet ${die.w} × ${die.h} @ ${die.ups}-up`;
  } else {
    let die;
    if (spec.sheet) die = { ...spec.sheet, verified: false, trimPct: null };
    else die = SIDEWALL_DIES[size];
    if (!die) return { ok: false, family: "cup", title, errors: [`No die on file for ${size}. Enter the real sheet (W × H, ups).`], warnings };
    ups = die.ups;
    trimPct = die.trimPct;
    const swArea = (die.w * die.h) / die.ups;
    const bottom = BOTTOMS[size] ?? BOTTOMS["16oz"];
    btGsm = bottom.gsm;
    btBought = ((bottom.roll * bottom.pitch) / 1e6) * btGsm;

    if (isNum(spec.cupWeight)) {
      // A measured cup wins. Take off the bottom disc, gross up by the trim,
      // then split the wall paper by fan area.
      const disc = ((Math.PI * (bottom.pitch / 2) ** 2) / 1e6) * (btGsm + 30);
      if (!(spec.cupWeight > disc * 2)) {
        return { ok: false, family: "cup", title, errors: [`A weighed cup of ${spec.cupWeight} g is too light to be a ${size} cup (the bottom disc alone is ${round(disc, 2)} g). Check the weight.`], warnings };
      }
      if (!die.verified) warn("warn", "die_unverified", `The ${size} die is not verified, so the trim used to gross up the weighed cup (${trimPct ?? 22}%) is an estimate.`);
      const t = (trimPct ?? 22.0) / 100;
      const totalWalls = (spec.cupWeight - disc) / (1 - t);
      const paperFrac = gsm / (gsm + 18);
      if (isDw) {
        const of = outerLayout();
        const share = swArea / (swArea + (of.w * of.h) / of.ups);
        swBought = totalWalls * share * paperFrac;
        ofBought = totalWalls * (1 - share) * paperFrac;
      } else {
        swBought = totalWalls * paperFrac;
      }
      dieNote = `from a measured cup of ${spec.cupWeight} g, grossed up by ${round(t * 100, 1)}% trim`;
    } else {
      swBought = (swArea / 1e6) * gsm;
      if (isDw) {
        const of = outerLayout();
        const og = spec.outerGsm ?? gsm;
        ofBought = ((of.w * of.h) / of.ups / 1e6) * (wall === "RIPPLE" ? og * FLUTE_TAKEUP + og : og);
      }
      dieNote = `die ${die.w} × ${die.h} @ ${die.ups}-up`;
      if (!die.verified) warn("warn", "die_unverified", `The ${size} die (${die.w} × ${die.h} @ ${die.ups}-up) is not verified against the punch line.`);
    }
    glueG = firstNum(spec.glueG, GLUE_G[size], 0.7);
  }

  // ── Raw material ──
  const og = spec.outerGsm ?? gsm;
  const polyRate = isNum(spec.polyRate) || (spec.polyBoard && !isTub) ? rates.pick(spec.polyRate, "cup.paper.poly_board") : undefined;
  const outerRate = isNum(spec.outerRate) || spec.outerPaper ? rates.pick(spec.outerRate, `cup.paper.${spec.outerPaper ?? "TNPL"}`) : undefined;
  if (isNum(polyRate)) {
    const pe = spec.innerPeGsm ?? 18;
    add("sidewall", "Sidewall poly board", (swBought * (gsm + pe)) / gsm * polyRate / 1000, `${gsm} + ${pe} PE GSM @ ₹${polyRate}/kg`);
  } else {
    add("sidewall", "Sidewall paper", (swBought * paperRate) / 1000, `${round(swBought, 2)} g of ${gsm} GSM @ ₹${paperRate}/kg`);
    add("sidewall_coat", "Sidewall PE, 1 side", (swBought * coat1) / 1000, `₹${coat1}/kg on paper weight`);
  }
  if (ofBought) {
    const tag = wall === "RIPPLE" ? "Ripple wrap" : "Outer wall";
    if (isNum(outerRate)) {
      add("outer", `${tag} paper`, (ofBought * outerRate) / 1000, `${round(ofBought, 2)} g of ${og} GSM @ ₹${outerRate}/kg`);
      add("outer_coat", `${tag} PE, 1 side`, (ofBought * coat1) / 1000, `₹${coat1}/kg on paper weight`);
    } else if (isNum(polyRate)) {
      const pe = spec.outerPeGsm ?? 15;
      add("outer", `${tag} poly board`, (ofBought * (og + pe)) / og * polyRate / 1000, `${og} + ${pe} PE GSM @ ₹${polyRate}/kg`);
    } else {
      add("outer", `${tag} paper`, (ofBought * paperRate) / 1000, `${round(ofBought, 2)} g @ ₹${paperRate}/kg`);
      if (spec.outerCoated) add("outer_coat", `${tag} PE, 1 side`, (ofBought * coat1) / 1000, `₹${coat1}/kg on paper weight`);
    }
  }
  add("bottom", "Bottom paper", (btBought * paperRate) / 1000, `${round(btBought, 3)} g of ${btGsm} GSM @ ₹${paperRate}/kg`);
  add("bottom_coat", "Bottom PE, 2 sides", (btBought * coat2) / 1000, `₹${coat2}/kg on paper weight`);
  const rawMaterial = lines.reduce((s, l) => s + l.value, 0);

  // ── Print and punch (on the outer wall for DW / ripple) ──
  let printedKg = (ofBought || swBought) / 1000;
  let fanFrac = 1;
  if (spec.viana && !isTub) {
    // Viana bills print + punch on FAN weight and returns the skeleton scrap.
    fanFrac = 1 - (trimPct ?? 22.0) / 100;
    printedKg *= fanFrac;
  }
  const colours = mode === "none" ? 0 : Math.max(1, spec.print?.colours ?? 1);
  let offsetJob = false; // offset costed as a printer's job, which punches the printed wall itself
  if (mode === "flexo") {
    const rate = rates.pick(spec.print?.ratePerKg, "cup.print.flexo_per_kg");
    add("print", "Printing, flexo", printedKg * rate * colours, `₹${rate}/kg × ${colours} colour${colours > 1 ? "s" : ""}${fanFrac < 1 ? " on fan weight" : ""}`);
  } else if (mode === "offset") {
    // The printed sheet: the outer wall's own sheet on a DW cup, else the die sheet.
    let upsP = spec.outerSheet?.ups ?? offsetOuter?.ups ?? ups;
    if (isDw && !spec.outerSheet && !offsetOuter) {
      upsP = OUTER_FANS[size].ups;
      warn("warn", "offset_outer_sheet", `An offset-printed outer wall runs on its own sheet. Costed at ${upsP}-up from the flexo layout: enter the real outer sheet and ups.`);
    } else if (offsetOuter && !offsetOuter.measured) {
      warn("info", "offset_outer_assumed", `The ${size} offset outer sheet (${offsetOuter.w} × ${offsetOuter.h} @ ${offsetOuter.ups}-up) is assumed, not measured from a layout.`);
    }
    if (isNum(spec.print?.offsetSheetRate)) {
      // A printer's per-sheet, per-colour rate typed for this quote.
      add("print", "Printing, offset", (spec.print.offsetSheetRate * colours) / upsP, `₹${spec.print.offsetSheetRate}/sheet × ${colours} colour${colours > 1 ? "s" : ""} ÷ ${upsP}-up`);
    } else {
      // A printer's job (Blueline, locked 7-Nov-2026): the Pantone card is
      // flat up to 1,000 sheets, punching has a job minimum, and the
      // make-ready sheets cost their board and varnish. Spread over the order.
      const jobQty = spec.qty ?? rates.get("cup.print.offset_max_qty");
      const makeReady = rates.get("cup.offset.makeready_sheets");
      const sheetsRun = Math.ceil(jobQty / upsP) + makeReady;
      const minSheets = rates.get("cup.offset.min_sheets");
      const billed = Math.max(sheetsRun, minSheets);
      const perPc = (jobCost) => jobCost / jobQty;
      const pantone = (rates.get("cup.offset.pantone_first") + rates.get("cup.offset.pantone_extra") * (colours - 1)) / 1000;
      const n = (v) => v.toLocaleString("en-IN");
      const runNote = `${n(sheetsRun)} sheets (${upsP}-up + ${makeReady} make-ready) over ${n(jobQty)} cups`;
      add("print", "Printing, offset Pantone", perPc(pantone * billed),
        sheetsRun < minSheets ? `₹${n(round(pantone * minSheets, 0))} flat up to ${n(minSheets)} sheets; the job is ${runNote}` : `₹${round(pantone, 2)}/sheet × ${runNote}`);
      if (spec.print?.varnish !== false) {
        const v = rates.get("cup.offset.varnish_per_sheet");
        add("varnish", "Varnish", perPc(v * sheetsRun), `₹${v}/sheet over the same sheets`);
      }
      const pu = rates.get("cup.offset.punch_per_sheet");
      const puMin = rates.get("cup.offset.punch_min_job");
      const punchJob = Math.max(puMin, pu * sheetsRun);
      add("offset_punch", "Punching, offset sheets", perPc(punchJob), punchJob === puMin ? `₹${puMin} a job (minimum)` : `₹${pu}/sheet over the same sheets`);
      // The make-ready sheets are board we bought and cannot sell.
      const wallKeys = isDw ? ["outer", "outer_coat"] : ["sidewall", "sidewall_coat"];
      const wallPerCup = lines.filter((l) => wallKeys.includes(l.key)).reduce((t, l) => t + l.value, 0);
      add("makeready", "Make-ready board", perPc(makeReady * wallPerCup * upsP), `${makeReady} waste sheets of the printed wall, ₹${round(wallPerCup * upsP, 2)} a sheet`);
      if (sheetsRun < minSheets) {
        warn("info", "under_min_sheets", `This job is ${n(sheetsRun)} sheets, under the printer's ${n(minSheets)}-sheet minimum, so the print charge is flat and the rate falls quickly with quantity.`);
      }
      offsetJob = true;
    }
    const printMoq = rates.get("cup.print.moq");
    if (isNum(spec.qty) && spec.qty < printMoq && !spec.genericDesign) {
      warn("warn", "below_print_moq", `${spec.qty.toLocaleString("en-IN")} cups is under the ${printMoq.toLocaleString("en-IN")} cup minimum for a printed job.`);
    }
  }
  if (isNum(spec.punchPerKg) && spec.punchPerKg > 0) {
    // On an offset job the printer punches the printed wall; a DW cup's inner wall is still punched by us.
    const punchedG = offsetJob ? (isDw ? swBought : 0) : swBought + ofBought;
    if (punchedG > 0) add("punch", offsetJob ? "Punching, inner wall" : "Punching", (punchedG * fanFrac) / 1000 * spec.punchPerKg, `₹${spec.punchPerKg}/kg${fanFrac < 1 ? " on fan weight" : ""}`);
  }
  if (fanFrac < 1) {
    const credit = spec.scrapCredit ?? rates.get("cup.viana.scrap_credit");
    if (credit) {
      const scrapKg = ((swBought + ofBought) * (1 - fanFrac)) / 1000;
      add("scrap_credit", "Scrap back from printer", -scrapKg * credit, `${round(scrapKg * 1000, 2)} g @ ₹${credit}/kg`);
    }
  }

  // ── Conversion, glue, packing ──
  add("conversion", "Conversion", conversionPerUnit(wall, rates), wall === "DW" ? "forming + jacketing, flat per cup" : `${rates.get(`cup.cpm.${wall}`)} per minute, overhead pool ÷ fleet`);
  const glueRate = rates.get("cup.glue.rate_per_kg");
  const glueGrams = glueG * (GLUE_FACTOR[wall] ?? 1);
  add("glue", "Glue", (glueGrams * glueRate) / 1000, `${round(glueGrams, 2)} g @ ₹${glueRate}/kg`);

  let [casePack, cartonCost, cartonMeasured] = CARTONS[`${wall}|${size}`] ?? [wall === "SW" ? 1000 : 500, 70, false];
  if (isNum(spec.casePack)) casePack = spec.casePack;
  if (isNum(spec.carton)) { cartonCost = spec.carton; cartonMeasured = true; }
  const packLabour = rates.get("cup.pack.labour_monthly") / (rates.get("cup.fleet.hours") * 60 * rates.get(`cup.cpm.${wall}`) * rates.get("cup.fleet.machines"));
  const consumables = rates.get("cup.pack.consumables_per_case");
  add("packing", "Packing", (cartonCost + consumables) / casePack + packLabour, `carton ₹${cartonCost} + ₹${consumables} poly/tape/label ÷ ${casePack}, plus labour`);
  if (!cartonMeasured) warn("info", "carton_assumed", `Carton cost ₹${cartonCost} for this size is assumed, not measured.`);

  const mfg = lines.reduce((s, l) => s + l.value, 0);

  // ── Export: for cups the container charge goes INTO the cost before margin ──
  let exportOut = null;
  let cost = mfg;
  if (spec.export) {
    const units = spec.export.unitsPerContainer;
    if (isNum(units) && units >= 1) {
      const charges = firstNum(spec.export.chargesPerContainer, fobCharges(rates, { us: Boolean(spec.export.us) }));
      const fob = charges / units;
      add("fob", "FOB charges", fob, `₹${charges.toLocaleString("en-IN")} per container ÷ ${units.toLocaleString("en-IN")} cups`);
      cost = mfg + fob;
      exportOut = { fobAddPerUnit: fob, fx: rates.pick(spec.export.fx, "export.fx.usd"), unitsPerContainer: units, chargesPerContainer: charges };
    } else {
      warn("warn", "no_container_fill", "FOB is not in this price yet: enter the cups per container.");
    }
  }

  const sell = applyMargin(cost, marginPct, marginMode);
  if (exportOut) {
    exportOut.usdPer1000 = (sell * 1000) / exportOut.fx;
    exportOut.usdPerCase = (sell * casePack) / exportOut.fx;
  }

  if (mode === "flexo" && isNum(spec.qty) && spec.qty <= rates.get("cup.print.offset_max_qty") && !spec.genericDesign) {
    warn("info", "offset_better", `Runs of ${rates.get("cup.print.offset_max_qty").toLocaleString("en-IN")} cups or fewer are normally printed offset, not flexo.`);
  }

  const oneTime = [];
  if (mode === "flexo" && !spec.genericDesign) {
    const perColour = rates.pick(spec.print?.platePerColour, "cup.plate.flexo_per_colour");
    oneTime.push({ key: "plates", label: `Flexo plates (${colours} colour${colours > 1 ? "s" : ""})`, value: perColour * colours, status: rates.status("cup.plate.flexo_per_colour"), note: `₹${perColour.toLocaleString("en-IN")} per colour per size` });
  } else if (mode === "offset" && !spec.genericDesign) {
    const perColour = rates.pick(spec.print?.platePerColour, "cup.plate.offset_per_colour");
    oneTime.push({ key: "plates", label: `Offset plates (${colours} colour${colours > 1 ? "s" : ""})`, value: perColour * colours, status: rates.status("cup.plate.offset_per_colour"), note: `₹${perColour} per colour` });
  }
  const oneTimeTotal = oneTime.reduce((s, o) => s + o.value, 0);

  const paperG = swBought + ofBought + btBought;
  // The rate is the same at every quantity, except on an offset job, where the
  // make-ready sheets are spread over the order.
  const ladder = (spec.ladder ?? CUP_DEFAULT_LADDER).map((q) => {
    const at = offsetJob && q !== spec.qty ? priceCup({ ...spec, qty: q, ladder: [] }, rates) : { cost, sell };
    return {
      qty: q, cost: at.cost, sell: at.sell, sellRounded: round(at.sell), orderValue: round(at.sell) * q,
      cases: Math.ceil(q / casePack), oneTimePerUnit: oneTimeTotal / q,
    };
  });

  return {
    ok: true,
    family: "cup",
    title,
    route: "inhouse",
    geometry: { dieNote, swBought, ofBought, btBought, paperG, trimPct, perKgOfPaper: cost / (paperG / 1000) },
    lines,
    rawMaterial,
    mfg,
    cost,
    marginPct,
    marginMode,
    sell,
    sellRounded: round(sell),
    // an offset job is costed at a quantity even when none was typed, so the result says which
    qty: spec.qty ?? (offsetJob ? rates.get("cup.print.offset_max_qty") : null),
    oneTime,
    packing: { casePack, cartonPerCase: cartonCost, cartonMeasured, perCase: sell * casePack },
    ladder,
    export: exportOut,
    warnings,
    ratesUsed: rates.used(),
  };
}
