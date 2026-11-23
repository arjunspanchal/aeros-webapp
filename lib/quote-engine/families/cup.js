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
 *   polyRate        ₹/kg for PE-coated wall board, PE weight included
 *   innerPeGsm, outerPeGsm   PE g/m² when polyRate is used (18 / 15)
 *   outerRate       ₹/kg uncoated board for the DW outer + 1-side PE adder
 *   outerCoated, outerSheet {w,h,ups}, outerReel
 *   print           { mode: "none"|"flexo"|"offset", ratePerKg, colours, offsetSheetRate }
 *   punchPerKg, viana, scrapCredit
 *   sheet {w,h,ups}, glueG   a real die for a size with none on file
 *   casePack, carton (₹/case)
 *   vendorRate      bought-in sizes: the vendor's ₹/cup
 *   marginPct, qty, ladder
 *   export          { chargesPerContainer, unitsPerContainer, fx }
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

  // ── Paper bought per unit, g ──
  let swBought, btBought, ofBought = 0, glueG, btGsm, ups, trimPct = null, dieNote;
  if (isTub) {
    let die = TUB_DIES[size];
    if (!die) {
      if (!(spec.sheet && isNum(spec.glueG))) {
        return { ok: false, family: "cup", title, errors: [`We make ${size.replace("_", " ")} tubs but the die is not on file. Enter the real punch-line sheet (W × H, ups) and glue grams.`], warnings };
      }
      die = { ...spec.sheet, glueG: spec.glueG };
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
      const t = (trimPct ?? 22.0) / 100;
      const totalWalls = (spec.cupWeight - disc) / (1 - t);
      const paperFrac = gsm / (gsm + 18);
      if (isDw) {
        const of = OUTER_FANS[size];
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
        let of = { ...OUTER_FANS[size] };
        if (spec.outerSheet) of = { ...spec.outerSheet }; // offset outer: its own sheet
        if (isNum(spec.outerReel)) of.w = spec.outerReel; // cut from a wider reel: side trim is paid for
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
  if (isNum(spec.polyRate)) {
    const pe = spec.innerPeGsm ?? 18;
    add("sidewall", "Sidewall poly board", (swBought * (gsm + pe)) / gsm * spec.polyRate / 1000, `${gsm} + ${pe} PE GSM @ ₹${spec.polyRate}/kg`);
  } else {
    add("sidewall", "Sidewall paper", (swBought * paperRate) / 1000, `${round(swBought, 2)} g of ${gsm} GSM @ ₹${paperRate}/kg`);
    add("sidewall_coat", "Sidewall PE, 1 side", (swBought * coat1) / 1000, `₹${coat1}/kg on paper weight`);
  }
  if (ofBought) {
    const tag = wall === "RIPPLE" ? "Ripple wrap" : "Outer wall";
    if (isNum(spec.outerRate)) {
      add("outer", `${tag} paper`, (ofBought * spec.outerRate) / 1000, `${round(ofBought, 2)} g of ${og} GSM @ ₹${spec.outerRate}/kg`);
      add("outer_coat", `${tag} PE, 1 side`, (ofBought * coat1) / 1000, `₹${coat1}/kg on paper weight`);
    } else if (isNum(spec.polyRate)) {
      const pe = spec.outerPeGsm ?? 15;
      add("outer", `${tag} poly board`, (ofBought * (og + pe)) / og * spec.polyRate / 1000, `${og} + ${pe} PE GSM @ ₹${spec.polyRate}/kg`);
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
  const mode = spec.print?.mode ?? "none";
  const colours = mode === "none" ? 0 : spec.print?.colours ?? 1;
  if (mode === "flexo") {
    const rate = rates.pick(spec.print?.ratePerKg, "cup.print.flexo_per_kg");
    add("print", "Printing, flexo", printedKg * rate * colours, `₹${rate}/kg × ${colours} colour${colours > 1 ? "s" : ""}${fanFrac < 1 ? " on fan weight" : ""}`);
  } else if (mode === "offset") {
    const upsP = spec.outerSheet?.ups ?? ups;
    const perSheet = rates.pick(spec.print?.offsetSheetRate, "cup.print.offset_per_sheet_colour");
    add("print", "Printing, offset", (perSheet * colours) / upsP, `₹${perSheet}/sheet × ${colours} colour${colours > 1 ? "s" : ""} ÷ ${upsP}-up`);
  }
  if (isNum(spec.punchPerKg) && spec.punchPerKg > 0) {
    add("punch", "Punching", ((swBought + ofBought) * fanFrac) / 1000 * spec.punchPerKg, `₹${spec.punchPerKg}/kg${fanFrac < 1 ? " on fan weight" : ""}`);
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
  if (spec.export && isNum(spec.export.chargesPerContainer) && isNum(spec.export.unitsPerContainer)) {
    const fob = spec.export.chargesPerContainer / spec.export.unitsPerContainer;
    add("fob", "FOB charges", fob, `₹${spec.export.chargesPerContainer.toLocaleString("en-IN")} per container ÷ ${spec.export.unitsPerContainer.toLocaleString("en-IN")} cups`);
    cost = mfg + fob;
    exportOut = { fobAddPerUnit: fob, fx: rates.pick(spec.export.fx, "export.fx.usd"), unitsPerContainer: spec.export.unitsPerContainer };
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
  } else if (mode === "offset") {
    const perColour = rates.pick(spec.print?.platePerColour, "cup.plate.offset_per_colour");
    oneTime.push({ key: "plates", label: `Offset plates (${colours} colour${colours > 1 ? "s" : ""})`, value: perColour * colours, status: rates.status("cup.plate.offset_per_colour"), note: `₹${perColour} per colour` });
  }
  const oneTimeTotal = oneTime.reduce((s, o) => s + o.value, 0);

  const paperG = swBought + ofBought + btBought;
  const ladder = (spec.ladder ?? CUP_DEFAULT_LADDER).map((q) => ({
    qty: q, cost, sell, sellRounded: round(sell), orderValue: round(sell) * q,
    cases: Math.ceil(q / casePack), oneTimePerUnit: oneTimeTotal / q,
  }));

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
    qty: spec.qty ?? null,
    oneTime,
    packing: { casePack, cartonPerCase: cartonCost, cartonMeasured, perCase: sell * casePack },
    ladder,
    export: exportOut,
    warnings,
    ratesUsed: rates.used(),
  };
}
