// PP items made on an injection-moulding line: cups and lids. A should-cost
// model, carried over from the old PP calculator (deleted 28-Nov-2026) and
// checked against it and against the three quotes saved from it:
//
//   resin (item + its share of the runner) − regrind credit
//   → labour → electricity → mould recovery → forming rejects
//   → dry-offset print and print rejects (cups only)
//   → sleeve and carton → cost → markup
//
// Print plates are a one-time charge, never inside the rate. (The old
// calculator spread them into the rate by default; that is not carried over.)
// PP lids are never printed.
//
// Every shared rate here is an assumption from the old calculator, not a
// measured line: the rate book marks them so, and the result says it.

import { round, isNum, firstNum } from "../core/num.js";
import { applyMargin } from "../core/pricing.js";

// What differs by item. Cycle time, cavities, runner and machine power are
// the old calculator's figures for a cold-runner thin-wall line.
export const PP_ITEMS = {
  "350_cup": { label: "350 ml PP cup", kind: "cup", itemWeightG: 10.87, cycleTimeS: 5.8, cavities: 4, runnerGPerShot: 6, powerKw: 55, sleeveCost: 2, sleevePackLabour: 0.15 },
  "600_cup": { label: "600 ml PP cup", kind: "cup", itemWeightG: 17.54, cycleTimeS: 8, cavities: 4, runnerGPerShot: 8, powerKw: 60, sleeveCost: 2, sleevePackLabour: 0.15 },
  "85_lid": { label: "85 mm PP lid", kind: "lid", itemWeightG: 6, cycleTimeS: 8, cavities: 8, runnerGPerShot: 3, powerKw: 35, sleeveCost: 0.75, sleevePackLabour: 0.15 },
  "115_lid": { label: "115 mm PP lid", kind: "lid", itemWeightG: 7, cycleTimeS: 8, cavities: 8, runnerGPerShot: 4, powerKw: 35, sleeveCost: 0.75, sleevePackLabour: 0.15 },
  custom: { label: "Other PP item", kind: "cup", itemWeightG: undefined, cycleTimeS: 8, cavities: 4, runnerGPerShot: 4, powerKw: 50, sleeveCost: 0, sleevePackLabour: 0 },
};
export const PP_DEFAULT_LADDER = [25000, 50000, 100000, 250000, 500000];

/**
 * @param spec {
 *   family: "pp", item: key of PP_ITEMS, kind: "cup" | "lid" (custom items), name,
 *   itemWeightG, rmRate,
 *   cycleTimeS, cavities, shiftHrs, shiftsPerDay, labourPerDay,
 *   runnerGPerShot, regrindPct, powerKw, powerRate, mouldCost, mouldLifeShots, rejectPct,
 *   print: { colours, ratePerColour, platePerColour, rejectPct },
 *   sleeveCost, sleevePackLabour, unitsPerSleeve, cartonPerCase, casePack,
 *   qty, marginPct, ladder
 * }
 */
export function pricePp(spec, rates) {
  const item = PP_ITEMS[spec.item ?? "custom"];
  if (!item) return { ok: false, family: "pp", title: "PP item", errors: ["Pick the PP item."] };
  const kind = spec.item && spec.item !== "custom" ? item.kind : spec.kind === "lid" ? "lid" : "cup";
  const label = spec.name || item.label;

  const itemWeightG = firstNum(spec.itemWeightG, item.itemWeightG);
  const cycleTimeS = firstNum(spec.cycleTimeS, item.cycleTimeS);
  const cavities = firstNum(spec.cavities, item.cavities);
  const errors = [];
  if (!(itemWeightG > 0)) errors.push("Enter the item weight in grams.");
  else if (itemWeightG > 500) errors.push(`${itemWeightG} g is too heavy for a cup or lid. Weights are in grams.`);
  if (!(cycleTimeS > 0)) errors.push("Enter the cycle time in seconds.");
  if (!(Number.isInteger(cavities) && cavities >= 1)) errors.push("Cavities must be a whole number, 1 or more.");
  if (spec.qty !== undefined && !(isNum(spec.qty) && spec.qty >= 1)) errors.push("Quantity must be 1 or more.");
  if (spec.marginPct !== undefined && !(isNum(spec.marginPct) && spec.marginPct > -100)) errors.push("Margin must be above -100%.");
  for (const [v, what] of [[spec.rejectPct, "Forming rejects"], [spec.print?.rejectPct, "Print rejects"], [spec.regrindPct, "Regrind recovered"]]) {
    if (v !== undefined && !(isNum(v) && v >= 0 && v < 100)) errors.push(`${what} must be from 0 to under 100%.`);
  }
  if (errors.length) return { ok: false, family: "pp", title: label, errors };

  const warnings = [];
  const warn = (level, code, message) => warnings.push({ level, code, message });
  const n = (v) => Number(v).toLocaleString("en-IN");
  const colours = spec.print?.colours ?? 0;
  if (colours > 0 && kind === "lid") {
    warn("block", "lid_never_printed", "PP lids are never printed. Quote the lid plain.");
  }

  const rmRate = rates.pick(spec.rmRate, "pp.rm.rate_per_kg");
  const shiftHrs = rates.pick(spec.shiftHrs, "pp.shift.hours");
  const shiftsPerDay = rates.pick(spec.shiftsPerDay, "pp.shift.per_day");
  const labourPerDay = rates.pick(spec.labourPerDay, "pp.labour.per_day");
  const regrindPct = rates.pick(spec.regrindPct, "pp.regrind.capture_pct");
  const powerRate = rates.pick(spec.powerRate, "pp.power.rate");
  const rejectPct = rates.pick(spec.rejectPct, "pp.reject.pct");
  const runnerGPerShot = firstNum(spec.runnerGPerShot, item.runnerGPerShot);
  const powerKw = firstNum(spec.powerKw, item.powerKw);
  const mouldCost = firstNum(spec.mouldCost, 0);
  const sleeveCost = firstNum(spec.sleeveCost, item.sleeveCost);
  const sleevePackLabour = firstNum(spec.sleevePackLabour, item.sleevePackLabour);
  const unitsPerSleeve = rates.pick(spec.unitsPerSleeve, "pp.pack.units_per_sleeve");
  const cartonPerCase = rates.pick(spec.cartonPerCase, "pp.pack.carton_per_case");
  const casePack = rates.pick(spec.casePack, "pp.pack.case_pack");

  const lines = [];
  const add = (key, label2, value, basis) => lines.push({ key, label: label2, value, basis });

  // Resin: each shot uses the items plus the runner. The runner is shared
  // across the cavities and most of it comes back as regrind.
  const runnerShareG = runnerGPerShot / cavities;
  const grossG = itemWeightG + runnerShareG;
  const regrindG = runnerShareG * (regrindPct / 100);
  add("resin", "PP resin", (grossG * rmRate) / 1000, `${round(grossG, 3)} g (item ${itemWeightG} g + runner ${round(runnerShareG, 3)} g) × ₹${rmRate}/kg`);
  if (regrindG > 0) add("regrind", "Regrind credit", -(regrindG * rmRate) / 1000, `${regrindPct}% of the runner comes back, ${round(regrindG, 3)} g`);

  // Throughput.
  const perHour = (3600 / cycleTimeS) * cavities;
  const perDay = perHour * shiftHrs * shiftsPerDay;
  add("labour", "Labour", labourPerDay / perDay, `₹${n(labourPerDay)} a day ÷ ${n(Math.round(perDay))} pcs a day`);
  if (powerKw > 0 && powerRate > 0) add("power", "Electricity", (powerKw * powerRate) / perHour, `${powerKw} kW × ₹${powerRate}/unit ÷ ${n(Math.round(perHour))} pcs an hour`);
  if (mouldCost > 0) {
    const life = rates.pick(spec.mouldLifeShots, "pp.mould.life_shots");
    add("mould", "Mould recovery", mouldCost / (life * cavities), `₹${n(mouldCost)} over ${n(life)} shots × ${cavities} cavities`);
  }

  // A rejected part has used its resin, labour and power: the good ones carry it.
  const formed = lines.reduce((s, l) => s + l.value, 0);
  if (rejectPct > 0) add("rejects", "Forming rejects", formed * (100 / (100 - rejectPct) - 1), `${rejectPct}% of parts moulded`);

  // Dry-offset print on the formed cup. A spoiled print scraps a cup that is
  // already moulded, so print rejects carry the forming cost too.
  if (colours > 0) {
    const perColour = rates.pick(spec.print?.ratePerColour, "pp.print.rate_per_colour");
    add("print", "Printing, dry offset", colours * perColour, `₹${perColour} × ${colours} colour${colours > 1 ? "s" : ""}`);
    const printRejectPct = rates.pick(spec.print?.rejectPct, "pp.print.reject_pct");
    const printed = lines.reduce((s, l) => s + l.value, 0);
    if (printRejectPct > 0) add("print_rejects", "Print rejects", printed * (100 / (100 - printRejectPct) - 1), `${printRejectPct}% of cups printed`);
  }

  // Packing: a sleeve of pieces, then the carton. Never wasted.
  add("sleeve", "Sleeve and sleeving", (sleeveCost + sleevePackLabour) / unitsPerSleeve, `(sleeve ₹${sleeveCost} + labour ₹${sleevePackLabour}) ÷ ${unitsPerSleeve}`);
  add("carton", "Carton", cartonPerCase / casePack, `₹${cartonPerCase} ÷ ${n(casePack)}`);

  const cost = lines.reduce((s, l) => s + l.value, 0);
  const marginMode = "markup";
  const marginPct = rates.pick(spec.marginPct, kind === "lid" ? "pp.margin.lid" : "pp.margin.cup");
  const sell = applyMargin(cost, marginPct, marginMode);
  const qty = spec.qty ?? 100000;

  warn("info", "should_cost", "This is a should-cost estimate from line assumptions (cycle time, labour, power, rejects), not a rate from a moulder. Check it against a supplier's price before quoting.");

  const oneTime = [];
  if (colours > 0) {
    const plate = rates.pick(spec.print?.platePerColour, "pp.print.plate_per_colour");
    oneTime.push({ key: "plates", label: `Print plates (${colours} colour${colours > 1 ? "s" : ""})`, value: plate * colours, status: rates.status("pp.print.plate_per_colour"), note: `₹${n(plate)} per colour` });
  }
  const oneTimeTotal = oneTime.reduce((s, o) => s + (o.value ?? 0), 0);

  // The rate does not move with quantity: nothing one-time is inside it.
  const ladder = (spec.ladder ?? PP_DEFAULT_LADDER).map((q) => ({
    qty: q, cost, sell, sellRounded: round(sell), orderValue: round(sell) * q, cases: Math.ceil(q / casePack), oneTimePerPc: oneTimeTotal / q,
  }));

  return {
    ok: !warnings.some((w) => w.level === "block"),
    family: "pp",
    title: `${label}, ${itemWeightG} g`,
    route: "inhouse",
    item: { key: spec.item ?? "custom", kind, label, weightG: itemWeightG },
    geometry: {
      grossG, netG: grossG - regrindG, perHour, perDay, cavities, cycleTimeS,
      order: { resinKg: (qty * (grossG - regrindG) * (100 / (100 - rejectPct))) / 1000, days: qty / perDay, cartons: Math.ceil(qty / casePack) },
    },
    lines,
    cost,
    marginPct,
    marginMode,
    sell,
    sellRounded: round(sell),
    qty,
    oneTime,
    packing: { casePack, perCase: sell * casePack },
    ladder,
    export: null,
    warnings,
    ratesUsed: rates.used(),
  };
}
