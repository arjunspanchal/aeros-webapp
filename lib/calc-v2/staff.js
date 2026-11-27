// Who sees what in the calculator. Pure: no database, so it can be tested.
//
//   admin  the full working: cost build-up, margin, paper and print rates, the rate book
//   staff  the selling price only: rate, quantity ladder, packing, one-time charges
//
// A staff browser is never sent a cost. Two filters do that, both on the server:
//   staffSpec()    keeps only what describes the product, so a staff user cannot
//                  set a rate or a margin (a 0% margin would show the cost)
//   staffResult()  keeps only the price side of a priced result
//
// Rule: Arjun, 27-Nov-2026 ("those details are fine for admin but not for staff").

import { DEFAULT_RATES } from "../quote-engine/rates/defaults.js";

export const calcRole = (session) => session?.modules?.calculator ?? null;
/** The calculator is for our own team: admins and staff. Customers are not let in. */
export const canUseCalc = (session) => calcRole(session) === "admin" || calcRole(session) === "staff";
/** Cost, margin and rates: admins only. */
export const seesWorking = (session) => calcRole(session) === "admin";

/** The cookie an admin sets to look at the calculator the way staff see it. */
export const VIEW_COOKIE = "calc_view";

/**
 * An admin previewing the staff view is treated as staff for the whole
 * request, so what they see is exactly what staff are sent. It only ever
 * lowers what an admin sees: for anyone else the cookie does nothing.
 */
export function viewAs(session, cookieValue) {
  if (!seesWorking(session) || cookieValue !== "staff") return session;
  return { ...session, modules: { ...session.modules, calculator: "staff" }, previewingStaff: true };
}

const pick = (obj, keys) => {
  if (!obj || typeof obj !== "object") return undefined;
  const out = {};
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
};
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

/** The paper a staff quote is costed on: the row picked, or the same mill and grade at the bag's GSM. */
export function staffPaper(spec, papers) {
  const chosen = papers.find((p) => p.id === spec.paper?.id);
  if (!chosen) return null;
  if (chosen.gsm === null || chosen.gsm === undefined || chosen.gsm === spec.gsm) return chosen;
  const same = papers.find((p) => p.supplier === chosen.supplier && p.type === chosen.type && (p.bf ?? null) === (chosen.bf ?? null) && p.gsm === spec.gsm);
  return same ?? chosen;
}

/**
 * A staff user's spec, rebuilt from the fields that describe the product. Rates
 * come from the paper master and the rate book, never from the request.
 * Returns { spec } or { error }.
 */
export function staffSpec(spec, { papers = [] } = {}) {
  if (!spec || typeof spec !== "object") return { error: "Nothing to price." };
  if (spec.family === "bag") {
    const paper = staffPaper(spec, papers);
    if (!paper) return { error: "Pick a paper from the list." };
    return {
      spec: {
        ...pick(spec, ["family", "type", "W", "G", "H", "gsm", "qty", "casePack", "destination"]),
        paper: { id: paper.id, label: paper.label, colour: paper.colour, supplier: paper.supplier, grade: paper.type },
        paperRate: paper.landed,
        print: { slab: spec.print?.slab ?? "none", ...pick(spec.print, ["colours", "process"]) },
        handle: spec.handle ? pick(spec.handle, ["kind", "sizeMm"]) : undefined,
        route: oneOf(spec.route, ["auto", "handmade"], "auto"),
        packing: oneOf(spec.packing, ["auto", "carton", "bale"], "auto"),
        export: spec.export && spec.destination !== "domestic" ? pick(spec.export, ["unitsPerContainer"]) : undefined,
      },
    };
  }
  if (spec.family === "cup") {
    const printed = spec.print?.mode && spec.print.mode !== "none";
    return {
      spec: {
        ...pick(spec, ["family", "wall", "size", "gsm", "outerGsm", "cupWeight", "qty", "casePack", "genericDesign"]),
        // board is bought the standard way: PE-coated board for cups, paper + PE for tubs
        polyBoard: spec.wall !== "TUB",
        print: printed ? { mode: spec.print.mode, ...pick(spec.print, ["colours", "varnish"]) } : { mode: "none" },
        punchPerKg: printed ? 5 : undefined,
        export: spec.export ? pick(spec.export, ["unitsPerContainer", "us"]) : undefined,
      },
    };
  }
  if (spec.family === "box") {
    const rateKey = spec.board?.rateKey;
    if (!rateKey || !/^box\.board\./.test(rateKey) || !DEFAULT_RATES[rateKey]) return { error: "Pick a board from the list." };
    return {
      spec: {
        ...pick(spec, ["family", "name", "size", "ups", "construction", "qty"]),
        sheet: typeof spec.sheet === "string" ? spec.sheet : pick(spec.sheet, ["w", "h"]),
        blank: pick(spec.blank, ["w", "h"]),
        board: { ...pick(spec.board, ["label", "gsm", "pe"]), rateKey },
        printer: oneOf(spec.printer, ["blueline_walkin", "lucky"], "blueline_walkin"),
        print: spec.print?.mode === "card" ? { mode: "card", ...pick(spec.print, ["colours", "sides"]) } : { mode: oneOf(spec.print?.mode, ["none", "ink_flat"], "none") },
        finish: pick(spec.finish, ["outside", "inside"]),
        packing: { ...pick(spec.packing, ["casePack"]), carton: pick(spec.packing?.carton, ["l", "b", "h"]) },
      },
    };
  }
  if (spec.family === "wrap") {
    const paper = staffPaper(spec, papers);
    if (!paper) return { error: "Pick a paper from the list." };
    const mode = oneOf(spec.print?.mode, ["none", "flexo", "offset"], "none");
    return {
      spec: {
        ...pick(spec, ["family", "name", "W", "L", "gsm", "qty", "casePack"]),
        paper: { id: paper.id, label: paper.label, grade: paper.type, supplier: paper.supplier },
        paperRate: paper.landed,
        source: oneOf(spec.source, ["reel", "sheet"], "reel"),
        sheet: typeof spec.sheet === "string" ? spec.sheet : pick(spec.sheet, ["w", "h"]),
        print: mode === "none" ? { mode } : { mode, ...pick(spec.print, ["colours"]) },
      },
    };
  }
  return { error: "This product is priced by an admin." };
}

/** The spec as a staff browser may hold it: no rate filled in by the server. */
export function staffVisibleSpec(spec) {
  const { paperRate: _rate, ...rest } = spec;
  return rest;
}

// Warnings that talk about cost, rates or margin, or about how we buy.
const INTERNAL_WARNINGS = new Set([
  "vendor_route", "handle_rate_assumed", "carton_assumed", "packing_assumed", "long_run_lever", "below_cost", "margin_high",
  "die_unverified", "offset_outer_assumed", "offset_outer_sheet", "locked_band", "locked_under_band", "handmade_ignores",
]);
const tellsCost = (message) => /₹|margin|benchmark|rate book/i.test(String(message));

/** A priced result with the cost side taken out. `lines` stays as an empty list so the screens still read it as priced. */
export function staffResult(result) {
  if (!result || typeof result !== "object") return result;
  if (!result.lines) return { ok: false, family: result.family, title: result.title, errors: result.errors ?? ["This could not be priced."], staff: true };
  const warnings = (result.warnings ?? [])
    .filter((w) => w.level === "block" || (!INTERNAL_WARNINGS.has(w.code) && !tellsCost(w.message)))
    .map((w) => (w.level === "block" && tellsCost(w.message) ? { ...w, message: "This item cannot be quoted as specified. Ask an admin." } : w));
  const e = result.export;
  const { perKgOfPaper: _perKg, ...geometry } = result.geometry ?? {};
  return {
    staff: true,
    engineVersion: result.engineVersion,
    ok: result.ok,
    family: result.family,
    title: result.title,
    route: result.route,
    qty: result.qty,
    moq: result.moq,
    sell: result.sell,
    sellRounded: result.sellRounded,
    lines: [],
    ratesUsed: [],
    warnings,
    oneTime: (result.oneTime ?? []).map((o) => ({ key: o.key, label: o.label, value: o.value, note: o.value === null ? o.note : undefined })),
    ladder: (result.ladder ?? []).map((row) => ({
      qty: row.qty, sell: row.sell, sellRounded: row.sellRounded, orderValue: row.orderValue, cases: row.cases,
      belowMoq: row.belowMoq, underMin: row.underMin, oneTimePerBag: row.oneTimePerBag, oneTimePerUnit: row.oneTimePerUnit, oneTimePerPc: row.oneTimePerPc,
    })),
    packing: result.packing ? { casePack: result.packing.casePack, carton: result.packing.carton, netKg: result.packing.netKg, grossKg: result.packing.grossKg, baled: result.packing.baled, perCase: result.packing.perCase } : undefined,
    export: e ? {
      fob: e.fob, fobUsdPerCase: e.fobUsdPerCase, exwUsdPerCase: e.exwUsdPerCase, casesPerContainer: e.casesPerContainer,
      unitsPerContainer: e.unitsPerContainer, fx: e.fx, usdPer1000: e.usdPer1000, usdPerCase: e.usdPerCase,
    } : null,
    machineAtMoq: result.machineAtMoq ?? null,
    geometry,
  };
}
