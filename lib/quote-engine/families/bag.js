// Paper bags, machine route: SOS, twisted handle (PTH), flat handle (FHB),
// V-bottom (gusseted or flat). Follows the aeros-bag-calculator skill, which
// is how Arjun actually quotes, not the old lib/calc/calculator.js defaults.
//
// Rules the engine enforces:
//   - the customer's size is never changed, except a gusset a few mm over 178
//     which is made at 178 and flagged;
//   - plates and setup are one-time charges, never inside the rate;
//   - every quote carries packing.

import { round, isNum, firstNum } from "../core/num.js";
import { applyMargin } from "../core/pricing.js";
import { bagCarton, cartonKindFor } from "../core/packing.js";
import { casesPerContainer, fobCharges } from "../core/export.js";

export const BAG_TYPES = {
  sos: { label: "SOS (no handle)", handle: false },
  twisted: { label: "Twisted handle", handle: true },
  flat: { label: "Flat handle", handle: true },
  vbottom: { label: "V-bottom / flat pouch", handle: false },
};

export const PRINT_SLABS = {
  none: { label: "Plain", colours: 0 },
  logo: { label: "1 colour small logo (~10%)", key: "bag.print.logo" },
  solid: { label: "1 colour solid / 2 colour line work (~30%)", key: "bag.print.solid" },
  p50: { label: "Half coverage, up to 2 colours", key: "bag.print.p50" },
  flood: { label: "Flood on white / white opaque on brown", key: "bag.print.flood" },
  p100: { label: "Full patch, up to 4 colours", key: "bag.print.p100" },
  metallic: { label: "Flood + metallic", key: "bag.print.metallic" },
};

export const HANDLE_KINDS = {
  brown_twisted: { label: "Brown twisted rope", key: "bag.handle.brown_twisted", weightKey: "bag.handle.twisted_g" },
  white_twisted: { label: "White twisted rope", key: "bag.handle.white_twisted", weightKey: "bag.handle.twisted_g" },
  black_twisted: { label: "Black twisted rope", key: "bag.handle.black_twisted", weightKey: "bag.handle.twisted_g" },
  flat: { label: "Flat paper handle", key: "bag.handle.flat", weightKey: "bag.handle.twisted_g" },
  cord: { label: "Cord (hand-fixed)", key: "bag.handle.cord", weightKey: "bag.handle.cord_g" },
};

export const BAG_DEFAULT_LADDER = [15000, 25000, 50000, 100000, 250000];

// Forming plates held: bag width each plate makes → actual plate mm.
export const FORMING_PLATES = { 130: 126, 150: 146, 230: 226, 240: 236, 254: 251, 280: 276, 295: 291, 300: 296, 305: 300 };

// ── Geometry ────────────────────────────────────────────────────────────────

export const pastingLap = (W) => (W <= 100 ? 15 : W <= 300 ? 20 : 25);

/**
 * Deckle (reel width) and cut-off (tube length per bag). A real print-file
 * blank wins over the formula: on a repeat job the cylinder sets the repeat.
 */
export function bagGeometry({ type, W, G, H, blank }) {
  const pw = pastingLap(W);
  const deckle = firstNum(blank?.deckle, 2 * W + 2 * G + pw);
  const cutoff = firstNum(blank?.cutoff, type === "vbottom" ? H + 15 : H + 0.75 * G);
  return { pastingLap: pw, deckle, cutoff, fromPrintFile: Boolean(blank?.deckle || blank?.cutoff) };
}

// ── Machine envelope (JianShe FJ11(13)S; derived from the chart photo) ──────

const ENV = { tubeMin: 270, tubeMax: 530, gMin: 70, gMax: 180, knee: 104, slope: 1.95 };
const tubeLength = (H, G) => H + G / 2 + 40;
const minTube = (G) => (G <= ENV.knee ? ENV.tubeMin : ENV.tubeMin + ENV.slope * (G - ENV.knee));

/** Does a square-bottom bag run on our machine? Returns problems and both fixes. */
export function envelopeCheck({ W, G, H }) {
  const tube = tubeLength(H, G);
  const min = minTube(G);
  const problems = [];
  if (G < ENV.gMin || G > ENV.gMax) problems.push(`gusset ${G} mm is outside ${ENV.gMin}–${ENV.gMax} mm`);
  if (tube < min) problems.push(`tube ${Math.round(tube)} mm is under the ${Math.round(min)} mm minimum for a ${G} mm gusset`);
  if (tube > ENV.tubeMax) problems.push(`tube ${Math.round(tube)} mm is over the ${ENV.tubeMax} mm maximum`);

  const fixes = [];
  if (tube < min) {
    fixes.push(`keep gusset ${G}: height ${Math.ceil(min - G / 2 - 40)} mm or more`);
    let g = null;
    for (let x = Math.min(G, ENV.gMax); x >= ENV.gMin; x--) {
      if (tubeLength(H, x) >= minTube(x)) { g = x; break; }
    }
    fixes.push(g ? `keep height ${H}: gusset ${g} mm or less` : `height ${H} mm is too short at any gusset (tube floor ${ENV.tubeMin} mm)`);
  }
  if (tube > ENV.tubeMax) {
    fixes.push(`keep gusset ${G}: height ${Math.floor(ENV.tubeMax - G / 2 - 40)} mm or less`);
  }

  const plates = Object.keys(FORMING_PLATES).map(Number);
  const nearest = plates.reduce((a, b) => (Math.abs(b - W) < Math.abs(a - W) ? b : a));
  return {
    ok: problems.length === 0,
    tube,
    minTube: min,
    problems,
    fixes,
    plate: { stocked: plates.includes(W), nearest, gapMm: nearest - W },
  };
}

/** Lightest GSM worth quoting on a handle bag of this width (judgement guide). */
export const minHandleBagGsm = (W) => (W < 230 ? 60 : W < 270 ? 70 : 80);

function defaultCasePack({ type, H, W, gsm }) {
  if (type === "sos") return 500;
  if (type === "vbottom") return 1000;
  return H >= 400 || (gsm >= 120 && W >= 300) ? 200 : 250;
}

// ── Pricing ─────────────────────────────────────────────────────────────────

/**
 * @param {object} spec
 *   type            "sos" | "twisted" | "flat" | "vbottom"
 *   W, G, H         mm, Aeros order (width × gusset × height)
 *   gsm, paperRate  paper weight and LANDED ₹/kg
 *   paper           { label, colour: "brown"|"white", supplier } (display + checks)
 *   blank           { deckle, cutoff } from a print file, optional
 *   print           { slab, ratePerKg, colours }
 *   handle          { kind, material, pasting, sizeMm }
 *   conversionPerKg, wastagePct, wastageBase ("paper_print_conv" | "paper")
 *   gluePerBag      fixed ₹/bag, replaces the glue formula
 *   casePack, carton { perCase } | { real: true }
 *   extras          [{ label, perBag }]   flap, base board, gumming, varnish…
 *   qty, ladder     quantity and optional ladder quantities
 *   marginPct, route ("auto" | "inhouse" | "vendor"), destination ("domestic" | "usa" | "export")
 *   export          { fx, palletised, unitsPerContainer, chargesPerContainer }
 * @param {ReturnType<import("../core/rates.js").createRates>} rates
 */
export function priceBag(spec, rates) {
  const errors = validate(spec);
  if (errors.length) return { ok: false, family: "bag", errors };

  const warnings = [];
  const warn = (level, code, message) => warnings.push({ level, code, message });
  const type = spec.type;
  const { W, H, gsm } = spec;

  // Gusset: the one size change Arjun allows is a few mm down to 178.
  const gMax = rates.get("bag.gusset.max");
  let G = spec.G;
  let route = spec.route && spec.route !== "auto" ? spec.route : "inhouse";
  if (type !== "vbottom" && spec.G > gMax) {
    if (spec.G <= rates.get("bag.gusset.clamp_to")) {
      G = gMax;
      warn("warn", "gusset_clamped", `Gusset ${spec.G} mm is made at ${gMax} mm to stay on our machine. Say so on the quote.`);
    } else if (spec.route !== "inhouse") {
      route = "vendor";
      warn("warn", "vendor_route", `Gusset ${spec.G} mm is well over ${gMax} mm, so this bag goes to a vendor (benchmark conversion, 15% margin).`);
    }
  }

  const geo = bagGeometry({ type, W, G, H, blank: spec.blank });
  const paperKg = (geo.deckle * geo.cutoff * gsm) / 1e9;

  // Machine envelope applies to square-bottom bags made in-house.
  let envelope = null;
  if (type !== "vbottom" && route === "inhouse") {
    envelope = envelopeCheck({ W, G, H });
    if (!envelope.ok) {
      warn("block", "outside_envelope", `Outside the machine envelope: ${envelope.problems.join("; ")}. Fix: ${envelope.fixes.join(", or ")}.`);
    }
  }

  const info = BAG_TYPES[type];
  if (info.handle && gsm < minHandleBagGsm(W)) {
    warn("warn", "gsm_too_light", `${gsm} GSM is too light for a ${W} mm wide handle bag; quote ${minHandleBagGsm(W)} GSM or heavier.`);
  }
  const supplier = (spec.paper?.supplier ?? "").toLowerCase();
  if (spec.destination === "usa" && supplier.includes("jodhani")) {
    warn("block", "no_jodhani_usa", "US-bound bags are never made on Jodhani paper. Pick another mill.");
  }

  // Print
  const slab = spec.print?.slab ?? "none";
  const printed = slab !== "none";
  const printRate = printed ? rates.pick(spec.print?.ratePerKg, PRINT_SLABS[slab].key) : 0;
  const colours = printed ? spec.print?.colours ?? 1 : 0;

  // Conversion
  const convKey = route === "vendor" ? "bag.conversion.vendor"
    : info.handle ? "bag.conversion.handle"
    : type === "vbottom" ? "bag.conversion.vbottom" : "bag.conversion.sos";
  const convRate = rates.pick(spec.conversionPerKg, convKey);

  // Handle
  let handle = null;
  if (info.handle) {
    const kind = spec.handle?.kind ?? (type === "flat" ? "flat" : spec.paper?.colour === "white" ? "white_twisted" : "brown_twisted");
    const def = HANDLE_KINDS[kind];
    const material = rates.pick(spec.handle?.material, def.key);
    const fixKey = kind === "cord" ? "bag.handle.cord_fixing" : "bag.handle.pasting";
    const pasting = rates.pick(spec.handle?.pasting, fixKey);
    handle = { kind, label: def.label, material, pasting, weightG: rates.get(def.weightKey), sizeMm: spec.handle?.sizeMm ?? 150 };
    if (rates.status(def.key) === "assumed" && !isNum(spec.handle?.material)) {
      warn("info", "handle_rate_assumed", `${def.label} rate is assumed; confirm it.`);
    }
  }

  // Glue: seam + bottom, at 30 g/m², unless a measured ₹/bag is given.
  let glue, glueBasis;
  if (isNum(spec.gluePerBag)) {
    glue = spec.gluePerBag;
    glueBasis = "fixed for this quote";
  } else {
    const gGsm = rates.get("bag.glue.gsm");
    const gRate = rates.get("bag.glue.rate_per_kg");
    const bottomMm2 = type === "vbottom" ? W * 15 : 0.25 * W * G;
    const glueKg = ((geo.cutoff * geo.pastingLap + bottomMm2) * gGsm) / 1e9;
    glue = glueKg * gRate;
    glueBasis = `${round(glueKg * 1000, 3)} g × ₹${gRate}/kg`;
  }

  // Packing
  const casePack = spec.casePack ?? defaultCasePack({ type, H, W, gsm });
  const cartonKind = cartonKindFor(type);
  const carton = cartonKind
    ? bagCarton(cartonKind, { W, G, H, gsm, casePack, handleMm: handle?.sizeMm, tarePerM2: rates.get("corrugated.tare_kg_per_m2") })
    : null;
  let cartonPerCase, cartonBasis;
  if (spec.carton?.real && carton) {
    const perKg = rates.get("corrugated.finished_per_kg");
    cartonPerCase = carton.tareKg * perKg;
    cartonBasis = `${round(carton.tareKg, 2)} kg × ₹${perKg}/kg ÷ ${casePack}`;
  } else {
    cartonPerCase = rates.pick(spec.carton?.perCase, "bag.carton.per_case");
    cartonBasis = `₹${cartonPerCase} ÷ ${casePack}`;
  }
  if (!cartonKind) warn("info", "no_carton_model", "No carton model for V-bottom / flat bags. Case pack and carton are assumptions; measure a packed case.");

  // Bag weight, for case weights and freight.
  const inkG = ["flood", "p100", "metallic"].includes(slab)
    ? ((2 * W * H + 2 * G * H) / 1e6) * colours * rates.get("bag.ink.g_per_m2_per_colour")
    : 0;
  const bagG = paperKg * 1000 + (handle?.weightG ?? 0) + inkG;
  const netKg = (casePack * bagG) / 1000;
  const grossKg = netKg + (carton?.tareKg ?? 0);
  const caseMax = rates.get("bag.case.max_kg");
  if (grossKg > caseMax) {
    warn("warn", "case_too_heavy", `A case of ${casePack} weighs about ${round(grossKg, 1)} kg, over the ${caseMax} kg ceiling. Drop the case pack.`);
  }

  // Cost at a quantity. Only wastage moves with quantity: plates and setup
  // sit outside the rate.
  const wasteBase = spec.wastageBase ?? "paper_print_conv";
  const extras = (spec.extras ?? []).filter((e) => isNum(e.perBag));

  function costAt(qty) {
    const longRun = qty >= rates.get("bag.wastage.long_run_qty");
    const wastePct = rates.pick(spec.wastagePct, longRun ? "bag.wastage.long_run_pct" : "bag.wastage.pct");
    const paper = paperKg * spec.paperRate;
    const print = paperKg * printRate;
    const conversion = paperKg * convRate;
    const wastage = (wastePct / 100) * (wasteBase === "paper" ? paper : paper + print + conversion);
    const g = round(paperKg * 1000, 2);

    const lines = [
      { key: "paper", label: "Paper", value: paper, basis: `${g} g × ₹${spec.paperRate}/kg` },
      printed && { key: "print", label: "Printing", value: print, basis: `${g} g × ₹${printRate}/kg` },
      { key: "conversion", label: "Conversion", value: conversion, basis: `${g} g × ₹${convRate}/kg` },
      { key: "wastage", label: "Wastage", value: wastage, basis: `${wastePct}% of ${wasteBase === "paper" ? "paper" : "paper + print + conversion"}` },
      handle && { key: "handle", label: handle.label, value: handle.material, basis: "per pair" },
      handle && { key: "handle_pasting", label: handle.kind === "cord" ? "Handle fixing" : "Handle pasting", value: handle.pasting, basis: "per bag" },
      { key: "glue", label: "Glue", value: glue, basis: glueBasis },
      type === "vbottom" && { key: "inner_poly", label: "Inner poly", value: rates.get("bag.inner_poly.per_100") / 100, basis: "per 100 bags" },
      { key: "carton", label: "Carton", value: cartonPerCase / casePack, basis: cartonBasis },
      ...extras.map((e, i) => ({ key: `extra_${i}`, label: e.label, value: e.perBag, basis: e.basis ?? "per bag" })),
    ].filter(Boolean);

    return { lines, cost: lines.reduce((s, l) => s + l.value, 0), wastePct };
  }

  // Quantity and MOQ
  const moq = type === "vbottom" && printed ? rates.get("bag.moq.printed_vbottom") : rates.get("bag.moq");
  const qty = spec.qty ?? moq;
  if (qty < moq && !spec.moqOverride) {
    warn("warn", "below_moq", `${qty.toLocaleString("en-IN")} pcs is under the ${moq.toLocaleString("en-IN")} pcs machine MOQ for this bag.`);
  }

  const marginMode = "markup";
  const marginPct = rates.pick(spec.marginPct, route === "vendor" ? "bag.margin.vendor" : "bag.margin.inhouse");
  const main = costAt(qty);
  const sell = applyMargin(main.cost, marginPct, marginMode);

  // One-time charges, always outside the rate.
  const oneTime = [
    { key: "setup", label: "Machine setup", value: rates.get("bag.setup.per_size"), status: rates.status("bag.setup.per_size"), note: "per size, once" },
  ];
  if (printed) {
    const perColour = rates.pick(spec.print?.platePerColour, "bag.plate.flexo_per_colour");
    oneTime.push({
      key: "plates", label: `Flexo plates (${colours} colour${colours > 1 ? "s" : ""})`, value: perColour * colours,
      status: isNum(spec.print?.platePerColour) ? "override" : rates.status("bag.plate.flexo_per_colour"),
      note: `₹${perColour.toLocaleString("en-IN")} per colour`,
    });
  }
  const oneTimeTotal = oneTime.reduce((s, o) => s + o.value, 0);

  // Reel the mill must supply.
  const reel = { min: geo.deckle, max: geo.deckle + rates.get("bag.reel.max_over_deckle") };

  // Export layer
  let exportOut = null;
  if (spec.export) {
    const us = spec.destination === "usa";
    const charges = firstNum(spec.export.chargesPerContainer, fobCharges(rates, { us, palletised: spec.export.palletised }));
    let units = spec.export.unitsPerContainer;
    let fill = null;
    if (!isNum(units) && carton) {
      fill = casesPerContainer(carton, { grossKg, payloadKg: rates.get("export.container.40hc_payload_kg") });
      units = fill.cases * casePack;
    }
    if (isNum(units) && units > 0) {
      const fx = rates.pick(spec.export.fx, "export.fx.usd");
      const fobAdd = charges / units;
      const fob = sell + fobAdd;
      exportOut = {
        chargesPerContainer: charges, unitsPerContainer: units, casesPerContainer: units / casePack, fill,
        fobAddPerBag: fobAdd, exw: sell, fob, fx,
        exwUsdPerCase: (sell * casePack) / fx, fobUsdPerCase: (fob * casePack) / fx,
      };
    } else {
      warn("warn", "no_container_fill", "Cannot work out FOB: no carton model for this bag. Enter units per container.");
    }
  }

  const ladder = (spec.ladder ?? BAG_DEFAULT_LADDER).map((q) => {
    const c = costAt(q);
    const s = applyMargin(c.cost, marginPct, marginMode);
    return {
      qty: q, cost: c.cost, sell: s, sellRounded: round(s), orderValue: round(s) * q,
      cases: Math.ceil(q / casePack), oneTimePerBag: oneTimeTotal / q, belowMoq: q < moq,
    };
  });

  return {
    ok: !warnings.some((w) => w.level === "block"),
    family: "bag",
    title: `${BAG_TYPES[type].label} bag ${W} × ${G} × ${H} mm, ${gsm} GSM`,
    size: { W, G, H, gussetAsked: spec.G },
    route,
    geometry: { ...geo, paperG: paperKg * 1000, bagG, reel, envelope },
    lines: main.lines,
    cost: main.cost,
    marginPct,
    marginMode,
    sell,
    sellRounded: round(sell),
    qty,
    moq,
    oneTime,
    packing: { casePack, carton, netKg, grossKg, cartonPerCase },
    ladder,
    export: exportOut,
    warnings,
    ratesUsed: rates.used(),
  };
}

function validate(spec) {
  const e = [];
  if (!BAG_TYPES[spec.type]) e.push("Pick a bag type.");
  for (const k of ["W", "H", "gsm", "paperRate"]) {
    if (!(isNum(spec[k]) && spec[k] > 0)) e.push(`${k} must be a number above zero.`);
  }
  if (!(isNum(spec.G) && spec.G >= 0)) e.push("G (gusset) must be zero or more.");
  if (spec.print?.slab && !PRINT_SLABS[spec.print.slab]) e.push("Unknown print slab.");
  if (spec.handle?.kind && !HANDLE_KINDS[spec.handle.kind]) e.push("Unknown handle type.");
  return e;
}
