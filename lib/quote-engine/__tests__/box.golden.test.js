// Golden regression tests for folding cartons: each case is a saved working in
// cortex/quotes/. Old rates (pasting ₹0.1417, carton ₹52.6/kg) are passed as
// they stood on the day.

import test from "node:test";
import assert from "node:assert/strict";
import { price } from "../index.js";
import { gridNest, rscCartonKg, STANDARD_SHEETS } from "../families/box.js";

const near = (a, e, tol, what = "") => assert.ok(Math.abs(a - e) <= tol, `${what} expected ${e}, got ${a}`);
const line = (r, key) => r.lines.find((l) => l.key === key)?.value;
const box = (spec, rates) => price({ family: "box", ...spec }, rates);
const fbb = (gsm, ratePerKg = 75) => ({ label: "FBB", gsm, ratePerKg });

test("burger-box-brb-001-002 (8-Oct): 6-up on 640 × 780, plain 2.0259, CMYK 2.2926", () => {
  const base = {
    name: "Burger box", sheet: { w: 640, h: 780 }, ups: 6, board: fbb(250), construction: "four_corner",
    pastingPerPc: 0.1417, formingWastage: false, packing: { perPc: 0.1567 }, qty: 10000,
  };
  const plain = box(base);
  near(plain.geometry.boardG, 20.8, 0.001, "board g");
  near(line(plain, "board"), 1.56, 1e-4, "paper");
  near(line(plain, "wastage"), 0.1092, 1e-4, "wastage 7%");
  near(line(plain, "punch"), 0.0583, 1e-4, "punch");
  near(plain.cost, 2.0259, 1e-4, "plain cost");
  assert.deepEqual(plain.sellOptions.map((o) => o.sell), [2.33, 2.43, 2.53]);

  const cmyk = box({ ...base, print: { mode: "card", printer: "blueline_walkin", colours: 4 } });
  near(line(cmyk, "print"), 0.2667, 1e-4, "print 4C walk-in");
  near(cmyk.cost, 2.2926, 1e-4, "CMYK cost");
  assert.deepEqual(cmyk.oneTime[0], { key: "plates", label: "Offset plates (4)", value: 2400, status: "confirmed", note: "₹600 per colour per side" });

  // 5,000 boxes = 834 sheets: the 1,000-sheet minimum is spread over the order
  near(box({ ...base, qty: 5000 }).cost, 2.0376, 1e-4, "plain at 5,000");
  near(box({ ...base, qty: 5000, print: { mode: "card", colours: 4 } }).cost, 2.3576, 1e-4, "CMYK at 5,000");

  // locked band from 25,000 sheets: 350 + 3 × 250 = 1,100 per 1,000 sheets
  const locked = box({ ...base, qty: 150000, print: { mode: "card", printer: "blueline_locked", colours: 4 } }, { "box.punch.blueline_locked": 350 });
  near(locked.cost, 2.2092, 1e-4, "CMYK locked");
});

test("burger box kraft twins at ₹50/kg: 1.4695 / 1.7362", () => {
  const base = { sheet: { w: 640, h: 780 }, ups: 6, board: { label: "Brown kraft", gsm: 250, ratePerKg: 50 }, construction: "four_corner", pastingPerPc: 0.1417, formingWastage: false, packing: { perPc: 0.1567 }, qty: 10000 };
  near(box(base).cost, 1.4695, 1e-4, "plain");
  near(box({ ...base, print: { mode: "card", colours: 4 } }).cost, 1.7362, 1e-4, "printed");
});

test("fb750-food-box (29-Oct): forming wastage on the formed box, FB-030 2.2525 / FB-031 2.6840", () => {
  const base = {
    name: "Food box 750 ml", sheet: { w: 540, h: 667 }, ups: 4, board: { label: "Allyking FBB", gsm: 255, ratePerKg: 74 },
    construction: "four_corner", packing: { perPc: 0.1798 }, qty: 10000,
  };
  const plain = box(base);
  near(plain.geometry.boardG, 22.96, 0.005, "board g");
  near(line(plain, "board"), 1.6991, 2e-4, "paper");
  near(line(plain, "pasting"), 0.1361, 1e-9, "pasting");
  near(line(plain, "forming"), 0.0311, 1e-4, "forming 1.5%");
  near(plain.cost, 2.2525, 3e-4, "FB-030");
  const printed = box({ ...base, print: { mode: "ink_flat" } });
  near(line(printed, "forming"), 0.0626, 1e-4, "forming 2.5%");
  near(printed.cost, 2.684, 3e-4, "FB-031");
});

test("native-double-cup-holder standing plan: Lucky 6-up all-in ₹0.80 → 3.31", () => {
  const r = box({
    name: "Double cup holder", sheet: { w: 635, h: 980 }, ups: 6, board: { label: "Allyking FBB", gsm: 290, ratePerKg: 74 },
    construction: "cross_tray", conversionAllIn: 0.8, packing: { perPc: 0.128 }, qty: 157500,
  });
  near(line(r, "board") + line(r, "wastage"), 2.382, 1e-3, "board incl. 7%");
  near(r.cost, 3.31, 0.0051, "cost");
  assert.deepEqual(r.sellOptions.map((o) => o.sell), [3.81, 3.97, 4.14]);
  assert.equal(r.route, "converter");
  // sheets = qty ÷ 6 × 1.07 → 28,088 (the plan rounds up to 28,100)
  assert.equal(r.geometry.sheetsToBuy, 28088);
  near(r.geometry.boardKg, 5071, 5, "board kg");
});

test("cc-2cup-sling (30-Oct): flat die-cut 4-up on 20 × 30, 2.4694 plain / 2.8694 CMYK", () => {
  const base = {
    name: "Cup carrier 2-cup sling", sheet: "20x30", ups: 4, board: fbb(300), construction: "flat",
    packing: { casePack: 250, carton: { perCase: 17.73 }, poly: { cost: 2, per: 250 } }, qty: 10000,
  };
  const plain = box(base);
  near(plain.geometry.boardG, 29.03, 0.005, "board g");
  near(line(plain, "wastage"), 0.1089, 1e-4, "wastage 5% (flat)");
  near(line(plain, "packing"), 0.0956, 1e-4, "packing");
  near(plain.cost, 2.4694, 2e-4, "CC-001");
  near(box({ ...base, print: { mode: "card", colours: 4 } }).cost, 2.8694, 2e-4, "CC-003");
  near(box({ ...base, board: { label: "Kraft", gsm: 300, ratePerKg: 64 } }).cost, 2.1341, 2e-4, "CC-002");
});

test("cafe-void single cup holder box (13-Nov): plain 3.96, CMYK + matt lam 5.68, Pantone ladder", () => {
  const base = {
    name: "Single cup holder box", sheet: "25x36", ups: 4, board: fbb(300), construction: "four_corner",
    packing: { casePack: 250, carton: { perCase: 32.7 }, poly: { cost: 3.98, per: 100 } }, qty: 5000,
  };
  const plain = box(base);
  near(plain.cost, 3.96, 0.0051, "plain, no lamination");
  const printed = box({ ...base, print: { mode: "ink_flat" }, finish: { outside: "matt" } });
  near(line(printed, "lam_outside"), 1.2375, 1e-4, "matt lam, ₹4.95 a sheet ÷ 4");
  near(line(printed, "forming"), 0.1373, 3e-4, "forming 2.5%");
  near(printed.cost, 5.68, 0.0051, "printed");
  assert.deepEqual(printed.sellOptions.map((o) => o.sell), [6.53, 6.82, 7.1]);
  // Pantone on the walk-in card instead of flat CMYK ink
  const pantone = (colours) => box({ ...base, print: { mode: "card", colours }, finish: { outside: "matt" } }).cost;
  near(pantone(1), 5.45, 0.0051, "1 Pantone");
  near(pantone(3), 5.6, 0.0051, "3 Pantone");
  near(pantone(4), 5.68, 0.0051, "4 Pantone = same as CMYK");
});

test("arvis-fish-and-chips-box v3: FBB 350, 3-up on 23 × 36, 3 colours → 5.584", () => {
  const r = box({ name: "Fish and chips box", sheet: "23x36", ups: 3, board: fbb(350), construction: "flat", print: { mode: "card", colours: 3 }, packing: { perPc: 0.126 }, qty: 250000 });
  near(r.geometry.boardG, 62.32, 0.005, "board g");
  near(line(r, "board"), 4.674, 1e-3, "board");
  near(line(r, "print"), 0.433, 1e-3, "print");
  near(line(r, "punch"), 0.117, 1e-3, "punch");
  near(r.cost, 5.584, 2e-3, "cost");
  assert.equal(r.sellRounded, 6.42);
});

// ── Rules ───────────────────────────────────────────────────────────────────

test("grid nest: 230 × 377 sling on 20 × 30 is 3-up gapped, 4-up with rows butted", () => {
  const s = STANDARD_SHEETS["20x30"];
  assert.equal(gridNest({ w: 230, h: 377 }, s).ups, 3);
  // production layout: rows butted on a common cut (754 of 762), about 4 mm at each end
  assert.equal(gridNest({ w: 230, h: 377 }, s, { butted: true, sideLay: 4 }).ups, 4);
});

test("an estimated ups is flagged, and a sheet over the press is blocked", () => {
  const r = box({ sheet: "25x36", blank: { w: 416, h: 308 }, board: fbb(300), construction: "seam", qty: 5000 });
  assert.equal(r.geometry.ups, 4);
  assert.ok(r.warnings.some((w) => w.code === "ups_estimated"));
  const big = box({ sheet: { w: 700, h: 1000 }, ups: 6, board: fbb(290), construction: "four_corner", qty: 100000 });
  assert.equal(big.ok, false);
  assert.ok(big.warnings.some((w) => w.code === "over_press"));
  // Lucky takes 27.5 × 38
  assert.equal(box({ sheet: { w: 635, h: 960 }, ups: 6, board: fbb(290), construction: "cross_tray", print: { mode: "card", printer: "lucky", colours: 1 }, qty: 50000 }).ok, true);
});

test("a big one-piece blank that is 1-up at under 70% is called out", () => {
  const r = box({ sheet: "25x36", blank: { w: 775, h: 435 }, board: fbb(350), construction: "flat", qty: 5000 });
  assert.equal(r.geometry.ups, 1);
  assert.ok(r.warnings.some((w) => w.code === "low_utilisation"));
});

test("RSC shipper weight model: 5-ply 120/120 at 718.8 g/m²", () => {
  // 400 × 355 × 160: blank 1,550 × 515 = 0.79825 m² → 0.5738 kg (5ply-rsc-400x355x160-650pcs.yaml)
  near(rscCartonKg({ l: 400, b: 355, h: 160 }), 0.5738, 1e-4, "kg");
});
