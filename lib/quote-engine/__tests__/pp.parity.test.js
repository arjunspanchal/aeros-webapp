// PP items against the old PP calculator (lib/calc/pp-calculator.js, deleted
// 28-Nov-2026). The fixture holds its outputs for eleven set-ups, three of
// them the quotes actually saved from it. One deliberate difference: print
// plates are a one-time charge here, never spread into the rate.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { price } from "../index.js";
import { customerLine, supplierWordsIn } from "../../calc-v2/present.js";
import { buildRecords } from "../../calc-v2/record.js";
import { staffSpec } from "../../calc-v2/staff.js";
import { ppSpec, ppState, PP_INITIAL } from "../../../app/calculator/v2/specs.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/pp-old-calculator.json", import.meta.url)));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);
const line = (r, key) => r.lines.find((l) => l.key === key)?.value ?? 0;

/** The old calculator's form, as a spec for the new engine. */
const specOf = (f) => ({
  family: "pp", item: "custom", itemWeightG: f.itemWeight, rmRate: f.rmRate,
  cycleTimeS: f.cycleTime, cavities: f.itemsPerShot, shiftHrs: f.shiftHrs, shiftsPerDay: f.shiftsPerDay, labourPerDay: f.labourCostPerDay,
  runnerGPerShot: f.runnerWeightPerShot, regrindPct: f.regrindCapturePercent, powerKw: f.machinePowerKw, powerRate: f.electricityRate,
  mouldCost: f.moldCost, mouldLifeShots: f.moldLifeShots, rejectPct: f.rejectPercent,
  print: f.printColours > 0 ? { colours: f.printColours, ratePerColour: f.printRatePerColour, platePerColour: f.printPlateCostPerColour, rejectPct: f.printRejectPercent } : undefined,
  sleeveCost: f.innerSleeveCost, sleevePackLabour: f.innerPackingLabour, unitsPerSleeve: f.unitsPerSleeve, cartonPerCase: f.cartonCost, casePack: f.casePack,
  marginPct: f.profitPercent,
});

for (const c of fixture.cases) {
  test(`old PP calculator parity: ${c.name}`, () => {
    const r = price(specOf(c.form));
    const e = c.expected;
    assert.ok(r.lines, r.errors?.join("; "));
    near(line(r, "resin") + line(r, "regrind"), e.rmCost, 1e-4, "resin net of regrind");
    near(line(r, "labour"), e.labourCostPerItem, 1e-4, "labour");
    near(line(r, "power"), e.electricityCostPerItem, 1e-4, "electricity");
    near(line(r, "mould"), e.moldCostPerItem, 1e-4, "mould");
    near(line(r, "rejects"), e.rejectUplift, 1e-4, "forming rejects");
    near(line(r, "print"), e.printInkCost, 1e-4, "print");
    near(line(r, "print_rejects"), e.printRejectUplift, 1e-4, "print rejects");
    near(line(r, "sleeve") + line(r, "carton"), e.totalPackingCost, 1e-4, "packing");
    near(r.cost, e.totalMfg, 1e-4, "cost");
    near(r.sell, e.sellingPrice, 1e-4, "sell");
    near(r.geometry.perDay, e.unitsPerDay, 1, "pieces a day");
    assert.equal(r.marginMode, "markup");
  });
}

test("the three quotes saved from the old PP calculator reproduce to the paisa", () => {
  // quotes_v2 rows: 350 mL test 1 (2.214 → 2.4796), 600 mL PP Cup - Zepto (3.4924 → 3.9115), 115 PP Lid - Zepto (1.4474 → 1.5921)
  const cup350 = price({ family: "pp", item: "350_cup", rmRate: 145 });
  near(cup350.cost, 2.214, 1e-4, "350 ml cost");
  near(cup350.sell, 2.4796, 1e-4, "350 ml sell at 12%");
  const cup600 = price({ family: "pp", item: "600_cup", rmRate: 150 });
  near(cup600.cost, 3.4924, 1e-4, "600 ml cost");
  near(cup600.sell, 3.9115, 1e-4, "600 ml sell at 12%");
  const lid115 = price({ family: "pp", item: "115_lid", rmRate: 154, rejectPct: 2, sleevePackLabour: 0.1 });
  near(lid115.cost, 1.4474, 1e-4, "115 mm lid cost");
  near(lid115.sell, 1.5921, 1e-4, "115 mm lid sell at 10%");
});

test("PP house rules: plates are one-time, lids are never printed, and the result says it is a should-cost estimate", () => {
  const printed = price({ family: "pp", item: "350_cup", print: { colours: 2 }, qty: 50000 });
  assert.deepEqual(printed.oneTime.map((o) => [o.key, o.value]), [["plates", 4000]]);
  assert.ok(!printed.lines.some((l) => /plate/i.test(l.label)), "no plate inside the rate");
  assert.ok(printed.ladder.every((row) => row.sell === printed.sell), "the rate does not move with quantity");
  assert.ok(printed.warnings.some((w) => w.code === "should_cost"));
  assert.ok(printed.ratesUsed.every((u) => u.status === "assumed"), "every PP rate is flagged as an assumption");
  const lid = price({ family: "pp", item: "85_lid", print: { colours: 1 } });
  assert.equal(lid.ok, false);
  assert.ok(lid.warnings.some((w) => w.code === "lid_never_printed" && w.level === "block"));
  assert.match(price({ family: "pp", item: "custom" }).errors[0], /item weight/);
  assert.match(price({ family: "pp", item: "350_cup", itemWeightG: 10870 }).errors[0], /too heavy/);
  assert.match(price({ family: "pp", item: "350_cup", rejectPct: 100 }).errors[0], /under 100/);
});

test("a PP item on the quote and in the saved record; the form round-trips; staff cannot price it", () => {
  const blank = ppSpec(PP_INITIAL);
  assert.equal(blank.print, undefined, "a plain item sends no print block");
  near(price(blank).cost, 2.2704, 1e-4, "the form's first screen is the 350 ml cup at the rate book's ₹150 resin");
  const spec = ppSpec({ ...PP_INITIAL, item: "600_cup", rmRate: "150", printColours: "1", qty: "150000" });
  assert.deepEqual(ppSpec(ppState(spec)), spec, "spec → form → spec is the same spec");
  const result = price(spec);
  const c = customerLine(spec, result);
  assert.deepEqual([c.item, c.material, c.printing, c.basis, c.casePack], ["600 ml PP cup", "Polypropylene (PP), 17.54 g", "1 colour", "EXW", 1000]);
  assert.equal(c.rate, result.sellRounded);
  assert.ok(!/cost|margin|markup|resin|regrind|mould recovery|cycle|cavit/i.test(JSON.stringify(c)), "nothing about how it is costed");
  assert.deepEqual(supplierWordsIn(JSON.stringify(c)), []);
  const rec = buildRecords({ spec, result, customer: "ZZ Test", by: "Test", engineVersion: "t", now: new Date("2026-11-28T10:00:00Z") });
  assert.deepEqual([rec.quote.quote_type, rec.line.item_key, rec.line.print_colours], ["pp", "pp-600-ml-pp-cup-17.54g-printed", 1]);
  // every PP input is a cost, so the staff view has no PP: the server refuses it
  assert.match(staffSpec(spec).error, /priced by an admin/);
});
