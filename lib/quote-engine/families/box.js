// Folding cartons and boxes: cup holders and carriers, food and burger boxes,
// cake and tuck boxes, mailers, trays, sleeves. Follows the aeros-custom-costing
// skill:
//
//   board (whole sheet ÷ ups) → sheet wastage → print → punching → lamination
//   → pasting → forming wastage → packing → cost → markup
//
// Board is costed on the sheet we buy, not the blank. Print and punching are
// billed per 1,000 sheets with a 1,000-sheet minimum, so the price is flat above
// that minimum. Plates and dies are one-time and never inside the rate.

import { round, isNum, firstNum } from "../core/num.js";
import { applyMargin } from "../core/pricing.js";

const IN = 25.4;
export const STANDARD_SHEETS = {
  "20x30": { label: "20 × 30 in", w: 20 * IN, h: 30 * IN },
  "23x36": { label: "23 × 36 in", w: 23 * IN, h: 36 * IN },
  "25x36": { label: "25 × 36 in (Blueline max)", w: 25 * IN, h: 36 * IN },
  "27.5x38": { label: "27.5 × 38 in (Lucky max)", w: 27.5 * IN, h: 38 * IN },
};

// Largest sheet each press takes, mm (short side × long side).
export const PRESS_MAX = {
  blueline: { w: 25 * IN, h: 36 * IN, label: "Blueline 25 × 36 in" },
  lucky: { w: 27.5 * IN, h: 38 * IN, label: "Lucky 27.5 × 38 in" },
};

export const PRINTERS = {
  blueline_walkin: { label: "Blueline, walk-in card", press: "blueline" },
  blueline_locked: { label: "Blueline, locked rate (25,000+ sheets)", press: "blueline" },
  lucky: { label: "Lucky Offset, walk-in card", press: "lucky" },
};

export const CONSTRUCTIONS = {
  four_corner: { label: "4-corner pasted (clam machine)", pasted: true, formed: true, pasteKey: "box.pasting.four_corner" },
  seam: { label: "Straight side seam (folder-gluer)", pasted: true, formed: false, pasteKey: "box.pasting.seam" },
  cross_tray: { label: "Cross / tray with glued end tabs", pasted: true, formed: false, pasteKey: "box.pasting.cross_tray" },
  flat: { label: "Die-cut only, ships flat (lock-corner, tuck, sling)", pasted: false, formed: false, pasteKey: null },
};

export const FINISHES = {
  none: { label: "None" },
  gloss: { label: "Gloss lamination", key: "box.lam.gloss" },
  matt: { label: "Matt lamination", key: "box.lam.matt" },
  pvc: { label: "PVC lamination (not food grade)", key: "box.lam.pvc" },
};

export const BOX_DEFAULT_LADDER = [3000, 5000, 10000, 25000, 50000, 100000];

// ── Nesting ─────────────────────────────────────────────────────────────────

/**
 * Straight grid fit of a rectangular blank on a sheet: both blank
 * orientations, gripper on either edge. A floor, not the answer: rows of
 * straight-edged blanks can butt on a common cut, and gable or cross blanks
 * interlock. Always check against the printer's layout.
 */
export function gridNest(blank, sheet, { gap = 3, gripper = 12, sideLay = 6, butted = false } = {}) {
  const g = butted ? 0 : gap;
  const fit = (len, size) => Math.max(0, Math.floor((len + g + 1e-6) / (size + g)));
  let best = { ups: 0 };
  // gripper on the w edge (eats into h) or on the h edge (eats into w)
  for (const [uw, uh, gripOn] of [[sheet.w - 2 * sideLay, sheet.h - gripper, "short"], [sheet.w - gripper, sheet.h - 2 * sideLay, "long"]]) {
    for (const [bw, bh, rotated] of [[blank.w, blank.h, false], [blank.h, blank.w, true]]) {
      const across = fit(uw, bw);
      const down = fit(uh, bh);
      if (across * down > best.ups) best = { ups: across * down, across, down, rotated, gripperEdge: gripOn };
    }
  }
  const use = best.ups ? (best.ups * blank.w * blank.h) / (sheet.w * sheet.h) : 0;
  return { ...best, utilisation: use };
}

/** Board per piece on each standard sheet, for the "is there a better sheet" check. */
export function sheetOptions(blank, gsm, opts) {
  return Object.entries(STANDARD_SHEETS).map(([key, s]) => {
    const n = gridNest(blank, s, opts);
    return { key, label: s.label, ups: n.ups, utilisation: n.utilisation, boardG: n.ups ? ((s.w * s.h) / 1e6) * gsm / n.ups : null };
  });
}

// ── Print and punch cards, ₹ per 1,000 sheets ───────────────────────────────

function printPer1000(printer, colours, sides, rates) {
  if (!colours) return 0;
  if (printer === "lucky") return rates.get("box.print.lucky.per_colour") * colours * sides;
  const k = printer === "blueline_locked" ? "box.print.blueline_locked" : "box.print.blueline_walkin";
  return (rates.get(`${k}.first`) + rates.get(`${k}.extra`) * (colours - 1)) * sides;
}

const punchPer1000 = (printer, rates) =>
  rates.get(printer === "lucky" ? "box.punch.lucky" : printer === "blueline_locked" ? "box.punch.blueline_locked" : "box.punch.blueline_walkin");

/** 5-ply RSC shipper weight, kg: blank [2(L+B)+40] × (H+B) at 718.8 g/m² (120/120). */
export function rscCartonKg({ l, b, h }, gsmSqm = 718.8) {
  return ((2 * (l + b) + 40) * (h + b)) / 1e6 * gsmSqm / 1000;
}

/**
 * @param {object} spec
 *   name            what the item is, for the title
 *   sheet           { w, h } mm, or a key of STANDARD_SHEETS
 *   ups             pieces per sheet, from the printer's layout
 *   blank           { w, h } mm; used to estimate ups when none is given
 *   boardGPerPc     board per piece, g, when already known (replaces sheet ÷ ups)
 *   board           { label, gsm, ratePerKg, pePerKg }
 *   construction    key of CONSTRUCTIONS
 *   print           { mode: "none"|"card"|"ink_flat", printer, colours, sides }
 *   conversionAllIn ₹/pc all-in from the converter (plate + print + punch + paste)
 *   finish          { outside, inside, insideBlister }
 *   wastagePct, pastingPerPc, formingWastage (false to switch off)
 *   packing         { casePack, carton: { perCase } | { l, b, h }, poly: { cost, per }, perPc }
 *   scrapCreditPerPc
 *   qty, ladder, marginPct, dieCost
 */
export function priceBox(spec, rates) {
  const errors = [];
  const sheet = typeof spec.sheet === "string" ? STANDARD_SHEETS[spec.sheet] : spec.sheet;
  const cons = CONSTRUCTIONS[spec.construction ?? "flat"];
  if (!cons) errors.push("Pick a construction.");
  if (!(isNum(spec.board?.gsm) && spec.board.gsm > 0)) errors.push("Board GSM must be above zero.");
  if (!(isNum(spec.board?.ratePerKg) && spec.board.ratePerKg > 0)) errors.push("Board rate must be above zero.");
  if (!isNum(spec.boardGPerPc) && !sheet) errors.push("Give the sheet size, or the board weight per piece.");
  if (errors.length) return { ok: false, family: "box", errors };

  const warnings = [];
  const warn = (level, code, message) => warnings.push({ level, code, message });
  const printer = spec.print?.printer ?? "blueline_walkin";
  const mode = spec.print?.mode ?? "none";
  const colours = mode === "none" ? 0 : spec.print?.colours ?? 1;
  const sides = spec.print?.sides ?? 1;
  const printed = mode !== "none";
  const gsm = spec.board.gsm;

  // Ups: the printer's layout wins; otherwise a grid estimate, flagged.
  let ups = spec.ups;
  let nest = null;
  if (!isNum(ups) && sheet && spec.blank) {
    nest = gridNest(spec.blank, sheet);
    ups = nest.ups;
    if (ups > 0) warn("warn", "ups_estimated", `${ups}-up is a straight-grid estimate. Butted rows or an interlock may fit more: check the printer's layout.`);
  }
  if (!isNum(spec.boardGPerPc) && !(ups > 0)) {
    const why = spec.blank
      ? "The blank does not fit this sheet. Pick a bigger sheet or split the blank."
      : "Enter the pieces per sheet from the printer's layout, or the blank size to estimate it.";
    return { ok: false, family: "box", title: spec.name ?? "Box", errors: [why], warnings };
  }

  // Board per piece, on the purchased sheet.
  const sheetAreaM2 = sheet ? (sheet.w * sheet.h) / 1e6 : null;
  const boardG = firstNum(spec.boardGPerPc, sheet ? (sheetAreaM2 * gsm) / ups : undefined);
  const utilisation = sheet && spec.blank && ups ? (ups * (spec.netAreaMm2 ?? spec.blank.w * spec.blank.h)) / (sheet.w * sheet.h) : nest?.utilisation ?? null;
  if (utilisation !== null && utilisation < 0.7) {
    warn("warn", "low_utilisation", `Only ${Math.round(utilisation * 100)}% of the sheet is used. Check a cut-to-size sheet or a different nest.`);
  }

  // Press limits.
  if (sheet && !isNum(spec.conversionAllIn)) {
    const max = PRESS_MAX[PRINTERS[printer].press];
    const [short, long] = [Math.min(sheet.w, sheet.h), Math.max(sheet.w, sheet.h)];
    if (short > max.w + 0.5 || long > max.h + 0.5) {
      warn("block", "over_press", `A ${Math.round(short)} × ${Math.round(long)} mm sheet is over the ${max.label} press.`);
    }
  }

  const constructionKey = spec.construction ?? "flat";
  const wastePct = rates.pick(spec.wastagePct, cons.pasted ? "box.wastage.pasted" : "box.wastage.flat");
  const laminated = (spec.finish?.outside && spec.finish.outside !== "none") || (spec.finish?.inside && spec.finish.inside !== "none");
  const casePack = spec.packing?.casePack ?? 250;

  function costAt(qty) {
    const lines = [];
    const add = (key, label, value, basis) => lines.push({ key, label, value, basis });

    const boardRate = spec.board.ratePerKg + (spec.board.pePerKg ?? 0);
    const board = (boardG * boardRate) / 1000;
    add("board", `Board${spec.board.label ? `, ${spec.board.label}` : ""}`, board,
      `${round(boardG, 2)} g${isNum(spec.boardGPerPc) ? "" : ` (sheet ÷ ${ups})`} × ₹${boardRate}/kg`);
    add("wastage", "Sheet wastage", (board * wastePct) / 100, `${wastePct}% of board`);

    // Print and punch: per 1,000 sheets, 1,000-sheet minimum billing.
    const sheets = ups ? Math.ceil(qty / ups) : null;
    const minSheets = rates.get("box.min_sheets");
    const underMin = sheets !== null && sheets < minSheets;
    const perPc = (per1000) => (underMin ? (per1000 * minSheets) / 1000 / qty : per1000 / 1000 / ups);

    if (isNum(spec.conversionAllIn)) {
      add("conversion", "Converter, all-in", spec.conversionAllIn, "plate + print + punching + pasting");
    } else {
      if (mode === "card") {
        const p = printPer1000(printer, colours, sides, rates);
        add("print", "Printing, offset", perPc(p), `₹${p.toLocaleString("en-IN")} per 1,000 sheets${underMin ? ", 1,000-sheet minimum" : ` ÷ ${ups}-up`}`);
      } else if (mode === "ink_flat") {
        const ink = rates.pick(spec.print?.inkPerPc, "box.ink.cmyk_flat");
        add("print", "CMYK ink", ink, "flat per box");
      }
      const pu = punchPer1000(printer, rates);
      add("punch", "Punching", perPc(pu), `₹${pu} per 1,000 sheets${underMin ? ", 1,000-sheet minimum" : ` ÷ ${ups}-up`}`);
    }

    // Lamination: the whole sheet is laminated before die-cutting.
    if (laminated && sheet) {
      const in2 = (sheet.w / IN) * (sheet.h / IN);
      for (const [side, f] of [["outside", spec.finish?.outside], ["inside", spec.finish?.inside]]) {
        if (!f || f === "none") continue;
        const factor = rates.get(FINISHES[f].key);
        add(`lam_${side}`, `${FINISHES[f].label}, ${side}`, (in2 * factor) / 100 / ups, `${round(in2, 0)} sq in × ${factor} ÷ 100 ÷ ${ups}-up`);
      }
      if (spec.finish?.insideBlister) {
        const factor = rates.get("box.lam.blister");
        add("lam_blister", "Blister coat, inside", (in2 * factor) / 100 / ups, `${round(in2, 0)} sq in × ${factor} ÷ 100 ÷ ${ups}-up`);
      }
    }

    if (!isNum(spec.conversionAllIn) && cons.pasted) {
      const paste = rates.pick(spec.pastingPerPc, cons.pasteKey);
      add("pasting", "Pasting", paste, CONSTRUCTIONS[constructionKey].label);
    }

    // Forming wastage on the erection machine: rejects out of the formed box.
    if (cons.formed && spec.formingWastage !== false) {
      const pct = rates.get(printed ? "box.forming.printed" : "box.forming.plain");
      const formed = lines.reduce((s, l) => s + l.value, 0);
      add("forming", "Forming wastage", formed * (1 / (1 - pct / 100) - 1), `${pct}% rejects on the formed box`);
    }

    // Packing: poly + shipper + labour, never wasted.
    let packing, packBasis;
    if (isNum(spec.packing?.perPc)) {
      packing = spec.packing.perPc;
      packBasis = "fixed for this quote";
    } else {
      const c = spec.packing?.carton;
      const cartonPerCase = isNum(c?.perCase) ? c.perCase
        : c && isNum(c.l) ? rscCartonKg(c) * rates.get("corrugated.finished_per_kg")
        : rates.get("box.pack.carton_per_case");
      const poly = spec.packing?.poly ?? { cost: rates.get("box.pack.poly_per_case"), per: casePack };
      const labour = rates.get("box.pack.labour_per_pc");
      packing = cartonPerCase / casePack + poly.cost / poly.per + labour;
      packBasis = `carton ₹${round(cartonPerCase, 2)} ÷ ${casePack} + poly ₹${poly.cost} per ${poly.per} + labour ₹${labour}`;
    }
    add("packing", "Packing", packing, packBasis);

    if (isNum(spec.scrapCreditPerPc) && spec.scrapCreditPerPc > 0) {
      add("scrap_credit", "Scrap credit", -spec.scrapCreditPerPc, "skeleton returned to us");
    }

    return { lines, cost: lines.reduce((s, l) => s + l.value, 0), sheets, underMin };
  }

  const qty = spec.qty ?? 5000;
  const main = costAt(qty);
  const marginMode = "markup";
  const marginPct = rates.pick(spec.marginPct, "box.margin.default");
  const sell = applyMargin(main.cost, marginPct, marginMode);

  if (main.underMin) {
    warn("info", "under_min_sheets", `${main.sheets} sheets is under the printer's 1,000-sheet minimum, so print and punching are spread over ${qty.toLocaleString("en-IN")} pcs.`);
  }
  if (main.sheets >= rates.get("box.locked_min_sheets") && printer === "blueline_walkin") {
    warn("info", "locked_band", "This run is 25,000 sheets or more. The locked Blueline rate may apply; check the last invoice.");
  }
  if (printed && laminated === false && spec.finish?.requireVarnish) {
    warn("info", "no_varnish_rate", "No gloss varnish rate is on file. It is not in this cost.");
  }

  // One-time charges.
  const oneTime = [];
  if (mode !== "none" && !isNum(spec.conversionAllIn)) {
    const perPlate = rates.get(printer === "lucky" ? "box.plate.lucky" : "box.plate.blueline");
    const n = colours * sides;
    oneTime.push({ key: "plates", label: `Offset plates (${n})`, value: perPlate * n, status: "confirmed", note: `₹${perPlate} per colour per side` });
  }
  oneTime.push(isNum(spec.dieCost)
    ? { key: "die", label: "Cutting die", value: spec.dieCost, status: "confirmed", note: "at actuals" }
    : { key: "die", label: "Cutting die", value: null, status: "assumed", note: "at actuals, not yet quoted" });
  const oneTimeTotal = oneTime.reduce((s, o) => s + (o.value ?? 0), 0);

  const ladder = (spec.ladder ?? BOX_DEFAULT_LADDER).map((q) => {
    const c = costAt(q);
    const s = applyMargin(c.cost, marginPct, marginMode);
    return { qty: q, cost: c.cost, sell: s, sellRounded: round(s), orderValue: round(s) * q, sheets: c.sheets, underMin: c.underMin, cases: Math.ceil(q / casePack), oneTimePerPc: oneTimeTotal / q };
  });

  const sheetsToBuy = ups ? Math.ceil((qty / ups) * (1 + wastePct / 100)) : null;

  return {
    ok: !warnings.some((w) => w.level === "block"),
    family: "box",
    title: `${spec.name ?? "Box"}, ${spec.board.label ?? "board"} ${gsm} GSM`,
    route: isNum(spec.conversionAllIn) ? "converter" : "inhouse",
    geometry: {
      sheet: sheet ? { w: sheet.w, h: sheet.h } : null, ups: ups ?? null, nest, boardG, utilisation,
      sheets: main.sheets, sheetsToBuy, boardKg: sheetsToBuy && sheet ? (sheetsToBuy * sheetAreaM2 * gsm) / 1000 : null,
      options: spec.blank ? sheetOptions(spec.blank, gsm) : null,
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
    packing: { casePack },
    ladder,
    export: null,
    warnings,
    ratesUsed: rates.used(),
  };
}
