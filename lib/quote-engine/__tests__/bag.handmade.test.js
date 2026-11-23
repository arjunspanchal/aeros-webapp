// Hand-made, offset-printed bags: the route for runs under the 15,000 machine
// MOQ (Arjun, 23-Nov-2026: every bag type) and for bags the machine cannot
// make. Each case is a saved working in cortex/quotes/.

import test from "node:test";
import assert from "node:assert/strict";
import { price } from "../index.js";
import { handmadeBlanks, fitHandmade } from "../families/bag-handmade.js";

const near = (a, e, tol, what = "") => assert.ok(Math.abs(a - e) <= tol, `${what} expected ${e}, got ${a}`);
const line = (r, key) => r.lines.find((l) => l.key === key)?.value;
const codes = (r) => r.warnings.map((w) => w.code);
const bag = (spec, rates) => price({ family: "bag", ...spec }, rates);

test("torta-haus-sos-7x7x10 (12-Nov): 1 bag on a 20 × 30 sheet, 90 GSM white, 1C → 5.43, 6.79 at 25%", () => {
  const spec = { type: "sos", W: 178, G: 178, H: 254, gsm: 90, paperRate: 81, paper: { colour: "white" }, print: { slab: "logo", colours: 1 }, casePack: 500, qty: 2000, marginPct: 25 };
  const r = bag(spec);
  assert.equal(r.route, "handmade");
  assert.deepEqual([r.geometry.blank.w, r.geometry.blank.h], [732, 372.6]); // the KLD's measured blank
  assert.equal(r.geometry.sheet, "20 × 30 in");
  assert.equal(r.geometry.bagsPerSheet, 1);
  near(r.geometry.utilisation, 0.7, 0.01, "sheet use");
  near(r.geometry.paperG, 34.84, 0.005, "paper bought per bag");
  near(line(r, "paper"), 2.822, 1e-3, "paper");
  near(line(r, "wastage"), 0.282, 1e-3, "10% overs");
  near(line(r, "punch"), 0.35, 1e-9, "punching");
  near(line(r, "labour"), 1.0, 1e-9, "hand labour");
  near(line(r, "overhead"), 0.134, 1e-3, "3% overhead");
  near(line(r, "print"), 0.7, 1e-9, "1 colour, walk-in card");
  near(line(r, "carton"), 0.14, 1e-9, "carton");
  near(r.cost, 5.43, 0.0051, "cost");
  near(r.sell, 5.43 * 1.25, 0.004, "sell at 25%: the saved 6.79 is the rounded cost 5.43 × 1.25");
  near(bag({ ...spec, gsm: 80 }).cost, 5.07, 0.0051, "80 GSM");
  // one-time: an offset plate and a die, no machine setup
  assert.deepEqual(r.oneTime.map((o) => [o.key, o.value]), [["plates", 600], ["die", null]]);
});

test("blr-room 280 × 280 × 254 (29-Oct): two halves on one 25 × 36 sheet; SOS 5.66, twisted handle 6.54", () => {
  const base = { W: 280, G: 280, H: 254, gsm: 100, paperRate: 50, paper: { colour: "brown" }, print: { slab: "logo", colours: 1 }, casePack: 250, qty: 5000 };
  const sos = bag({ ...base, type: "sos" });
  assert.equal(sos.route, "handmade"); // a 280 gusset is not sent to a vendor when the run is hand-made
  assert.equal(sos.size.G, 280);
  assert.equal(sos.geometry.pieces, 2);
  assert.deepEqual([sos.geometry.blank.w, sos.geometry.blank.h], [580, 423.6]); // the KLD's half blank
  assert.equal(sos.geometry.sheet, "25 × 36 in");
  near(sos.geometry.paperG, 58.06, 0.005, "paper bought per bag");
  near(sos.cost, 5.66, 0.0051, "SOS cost");
  assert.equal(sos.sellRounded, 6.23);

  const pth = bag({ ...base, type: "twisted" });
  near(line(pth, "handle"), 0.85, 1e-9, "brown twisted handle");
  assert.equal(line(pth, "handle_pasting"), undefined, "handle fixing is inside hand labour");
  near(line(pth, "overhead"), 0.162, 1e-3, "3% overhead incl. the handle");
  near(pth.cost, 6.54, 0.0051, "PTH cost");
  assert.equal(pth.sellRounded, 7.19);
});

test("food-monkey 254 × 178 × 255 (2-Nov): a flood is priced on the Pantone card, 3 colours = ₹4.60 a sheet", () => {
  const spec = { type: "sos", W: 254, G: 178, H: 255, gsm: 90, paperRate: 51, print: { slab: "p100", colours: 3 }, casePack: 500, carton: { perCase: 80 }, qty: 5000 };
  const r = bag(spec);
  assert.equal(r.geometry.pieces, 2);
  assert.equal(r.geometry.sheet, "20 × 30 in");
  near(line(r, "paper"), 1.777, 1e-3, "paper");
  near(line(r, "overhead"), 0.099, 1e-3, "overhead");
  near(line(r, "print"), 4.6, 1e-9, "3 Pantone flood");
  near(r.cost, 8.16, 0.0051, "brown");
  near(bag({ ...spec, paperRate: 81 }).cost, 9.35, 0.0051, "white");
  assert.deepEqual(r.oneTime.find((o) => o.key === "plates").value, 3 * 600);
});

test("under 15,000 switches to hand-made on its own; at 15,000 it is machine-made", () => {
  const spec = { type: "twisted", W: 280, G: 150, H: 280, gsm: 90, paperRate: 56.5, paper: { colour: "brown" } };
  const small = bag({ ...spec, qty: 14999 });
  assert.equal(small.route, "handmade");
  assert.ok(codes(small).includes("handmade_route"));
  assert.ok(!codes(small).includes("below_moq"));
  assert.equal(small.moq, null);
  assert.deepEqual(small.ladder.map((x) => x.qty), [1000, 2000, 3000, 5000, 10000]);

  const big = bag({ ...spec, qty: 15000 });
  assert.equal(big.route, "inhouse");
  assert.equal(big.machineAtMoq, null);
  assert.deepEqual(big.oneTime.map((o) => o.key), ["setup"]);

  // the hand-made quote also shows the machine price at 15,000, which is the same bag's machine quote
  assert.deepEqual(small.machineAtMoq, { qty: 15000, sell: big.sellRounded, route: "inhouse", possible: true });
  assert.ok(small.sell > big.sell, "a hand-made bag costs more than the machine bag");
  // machine rates are not recorded against a hand-made price
  assert.ok(!small.ratesUsed.some((u) => u.key.startsWith("bag.conversion") || u.key === "bag.glue.rate_per_kg" || u.key === "bag.setup.per_size"));
});

test("a blank quantity is costed at the machine MOQ, and the route can be forced either way", () => {
  const spec = { type: "sos", W: 240, G: 140, H: 330, gsm: 100, paperRate: 55 };
  assert.equal(bag(spec).route, "inhouse");
  assert.equal(bag({ ...spec, qty: 50000, route: "handmade" }).route, "handmade");
  const forced = bag({ ...spec, qty: 5000, route: "inhouse" });
  assert.equal(forced.route, "inhouse");
  assert.ok(codes(forced).includes("below_moq"));
});

test("V-bottom under 15,000 is hand-made too, on an estimated blank that is flagged", () => {
  const r = bag({ type: "vbottom", W: 246, G: 0, H: 248, gsm: 40, paperRate: 125, print: { slab: "p100", colours: 3 }, qty: 5000 });
  assert.equal(r.route, "handmade");
  assert.ok(codes(r).includes("handmade_blank_estimated"));
  assert.deepEqual([r.geometry.blank.w, r.geometry.blank.h], [532, 283]); // machine blank 512 × 263 + 20 each way
  near(line(r, "inner_poly"), 0.02, 1e-9, "inner poly stays");
});

test("under 1,000 sheets the printer's minimum is spread over the order", () => {
  const spec = { type: "sos", W: 178, G: 178, H: 254, gsm: 90, paperRate: 81, print: { slab: "logo", colours: 1 }, casePack: 500 };
  const at500 = bag({ ...spec, qty: 500 });
  near(line(at500, "print") + line(at500, "punch"), (700 + 350) / 500, 1e-9, "₹1,050 run charge over 500 bags");
  assert.ok(codes(at500).includes("under_min_sheets"));
  const [q1000, q5000] = [at500.ladder.find((x) => x.qty === 1000), at500.ladder.find((x) => x.qty === 5000)];
  assert.equal(q1000.sellRounded, q5000.sellRounded, "flat from 1,000 sheets");
});

test("a bag the machine cannot make says so beside the hand-made price", () => {
  // Torta Haus 152 × 152 × 178: tube too short for a 152 gusset
  const r = bag({ type: "sos", W: 152.4, G: 152.4, H: 177.8, gsm: 80, paperRate: 81, qty: 2000 });
  assert.equal(r.ok, true);
  assert.equal(r.machineAtMoq.possible, false);
  assert.match(r.machineAtMoq.reason, /machine/);
});

test("sheet fit matches offset_bag_fit.py; a bag too big for two halves on 25 × 36 is refused", () => {
  // Pasay 300 × 178 × 315: no fit on Blueline's sheets as halves-on-one-sheet → falls to 2 sheets a bag
  const f = fitHandmade(handmadeBlanks({ type: "sos", W: 300, G: 178, H: 315 }));
  assert.ok(f.bagsPerSheet <= 1);
  // Roggenart 340 × 340 × 280: half 700 × 479.6 is wider than any Blueline sheet's short side → 2 sheets per bag
  const big = fitHandmade(handmadeBlanks({ type: "sos", W: 340, G: 340, H: 280 }));
  assert.equal(big.bagsPerSheet, 0.5);
  assert.equal(bag({ type: "sos", W: 900, G: 300, H: 600, gsm: 120, paperRate: 55, qty: 1000 }).ok, false);
});
