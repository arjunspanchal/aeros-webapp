// The price-only staff view (Arjun, 27-Nov-2026): a staff user is never sent a
// cost, a margin or a rate, and cannot set one.

import test from "node:test";
import assert from "node:assert/strict";
import { price } from "../index.js";
import { canUseCalc, seesWorking, staffSpec, staffResult, staffVisibleSpec } from "../../calc-v2/staff.js";

const session = (calculator) => ({ modules: { calculator } });
const PAPERS = [
  { id: "p90", label: "Brown Kraft 90 GSM 28 BF", type: "Brown Kraft", supplier: "Mill A", gsm: 90, bf: 28, colour: "brown", exMill: 50, lane: 5, landed: 55 },
  { id: "p100", label: "Brown Kraft 100 GSM 28 BF", type: "Brown Kraft", supplier: "Mill A", gsm: 100, bf: 28, colour: "brown", exMill: 52, lane: 5, landed: 57 },
  { id: "white", label: "Bleach Kraft White", type: "Bleach Kraft White", supplier: "Mill B", gsm: null, bf: null, colour: "white", exMill: 80, lane: 0, landed: 80 },
];
const BAG = { family: "bag", type: "twisted", W: 280, G: 150, H: 280, gsm: 90, paper: { id: "p90" }, print: { slab: "logo", colours: 2 }, handle: { kind: "brown_twisted", sizeMm: 150 }, qty: 20000 };

/** Every number-bearing key in an object, at any depth. */
function keysIn(o, out = new Set()) {
  if (Array.isArray(o)) o.forEach((v) => keysIn(v, out));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { out.add(k); keysIn(v, out); }
  return out;
}

test("who may use the calculator, and who sees the working", () => {
  assert.deepEqual([canUseCalc(session("admin")), canUseCalc(session("staff")), canUseCalc(session("client")), canUseCalc(session(null)), canUseCalc(null)], [true, true, false, false, false]);
  assert.deepEqual([seesWorking(session("admin")), seesWorking(session("staff")), seesWorking(session("client"))], [true, false, false]);
});

test("a staff spec keeps the product and drops every rate, margin and costing switch", () => {
  const typed = {
    ...BAG, paperRate: 1, marginPct: 0, conversionPerKg: 1, wastagePct: 0, gluePerBag: 0, carton: { perCase: 1 }, extras: [{ label: "x", perBag: -3 }],
    print: { slab: "logo", colours: 2, ratePerKg: 1, platePerColour: 1 }, handle: { kind: "brown_twisted", sizeMm: 150, material: 0.01, pasting: 0.01 },
    route: "vendor", moqOverride: true, export: { fx: 1, unitsPerContainer: 100000 }, destination: "usa",
  };
  const { spec } = staffSpec(typed, { papers: PAPERS });
  assert.equal(spec.paperRate, 55, "the paper master's landed rate, not the 1 that was sent");
  for (const k of ["marginPct", "conversionPerKg", "wastagePct", "gluePerBag", "carton", "extras", "moqOverride"]) assert.equal(spec[k], undefined, k);
  assert.deepEqual(spec.print, { slab: "logo", colours: 2 });
  assert.deepEqual(spec.handle, { kind: "brown_twisted", sizeMm: 150 });
  assert.equal(spec.route, "auto");
  assert.deepEqual(spec.export, { unitsPerContainer: 100000 });
  // a zero margin sent by staff changes nothing: the price is the standard one
  const standard = price(staffSpec({ ...BAG, destination: "domestic" }, { papers: PAPERS }).spec);
  const tried = price(staffSpec({ ...BAG, destination: "domestic", marginPct: 0, paperRate: 1 }, { papers: PAPERS }).spec);
  assert.equal(tried.sell, standard.sell);
});

test("a bag at another GSM is priced on the same mill and grade at that GSM; no paper, no price", () => {
  assert.equal(staffSpec({ ...BAG, gsm: 100 }, { papers: PAPERS }).spec.paperRate, 57);
  assert.equal(staffSpec({ ...BAG, gsm: 120 }, { papers: PAPERS }).spec.paperRate, 55, "no such GSM: the paper picked");
  assert.equal(staffSpec({ ...BAG, gsm: 110, paper: { id: "white" } }, { papers: PAPERS }).spec.paperRate, 80, "one rate for every GSM of a grade with none");
  assert.match(staffSpec({ ...BAG, paper: {} }, { papers: PAPERS }).error, /Pick a paper/);
  assert.match(staffSpec({ family: "box", name: "x", board: { label: "Other", gsm: 300, ratePerKg: 1 } }).error, /Pick a board/);
});

test("a staff result carries the price side only: no cost, margin, build-up or rates, for every product", () => {
  const specs = [
    staffSpec(BAG, { papers: PAPERS }).spec,
    staffSpec({ ...BAG, qty: 5000 }, { papers: PAPERS }).spec, // hand-made, with the machine comparison
    staffSpec({ ...BAG, destination: "usa", export: {} }, { papers: PAPERS }).spec,
    staffSpec({ family: "cup", wall: "DW", size: "8oz", gsm: 280, print: { mode: "offset", colours: 3 }, qty: 5000, marginPct: 0, polyRate: 1 }).spec,
    staffSpec({ family: "cup", wall: "SW", size: "8oz", gsm: 260, export: { unitsPerContainer: 500000, chargesPerContainer: 1, fx: 1 } }).spec,
    staffSpec({ family: "box", name: "Cup carrier", board: { label: "FBB", gsm: 300, rateKey: "box.board.fbb", ratePerKg: 1 }, sheet: "20x30", blank: { w: 230, h: 377 }, construction: "flat", qty: 10000, marginPct: 0 }).spec,
  ];
  const FORBIDDEN = ["cost", "mfg", "rawMaterial", "marginPct", "marginMode", "sellOptions", "perKgOfPaper", "fobAddPerBag", "fobAddPerUnit", "chargesPerContainer", "value_per_kg", "basis", "status", "source"];
  for (const spec of specs) {
    const full = price(spec);
    assert.ok(full.lines?.length, `${spec.family} prices`);
    const shown = staffResult(full);
    assert.equal(shown.sell, full.sell);
    assert.deepEqual(shown.lines, []);
    assert.deepEqual(shown.ratesUsed, []);
    const keys = keysIn(shown);
    for (const k of FORBIDDEN) assert.ok(!keys.has(k), `${spec.family}: "${k}" must not reach a staff browser`);
    assert.ok(shown.ladder.every((row) => row.cost === undefined && row.sellRounded > 0));
    // no warning talks about money, margin or how we buy
    for (const w of shown.warnings) assert.ok(!/₹|margin|benchmark|rate book/i.test(w.message), w.message);
    // and the cost appears nowhere in what is sent, as a number
    assert.ok(!JSON.stringify(shown).includes(String(full.cost)), "the cost figure itself is absent");
  }
});

test("an unpriced spec comes back as an error with nothing else; the browser copy of a spec has no rate", () => {
  const bad = staffResult(price({ family: "bag", type: "sos", W: 5000, G: 100, H: 300, gsm: 70, paperRate: 50 }));
  assert.deepEqual(Object.keys(bad).sort(), ["errors", "family", "ok", "staff", "title"]);
  assert.equal(staffVisibleSpec(staffSpec(BAG, { papers: PAPERS }).spec).paperRate, undefined);
});
