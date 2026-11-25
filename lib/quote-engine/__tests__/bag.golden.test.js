// Golden regression tests: each case is a real Aeros quote from cortex/quotes/.
// The engine must reproduce the saved working. Rates that have moved since a
// quote was made (glue ₹300 → ₹226, for example) are passed as overrides, which
// also proves the override path.
//
// Run: npm run test:engine

import test from "node:test";
import assert from "node:assert/strict";
import { price } from "../index.js";

const near = (actual, expected, tol = 0.0051, what = "") =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what} expected ${expected}, got ${actual}`);
const line = (res, key) => res.lines.find((l) => l.key === key)?.value;
const bag = (spec, rates) => price({ family: "bag", ...spec }, rates);

test("pth-d-11x11x6-1c-15k: PTH 280×150×280, 90 GSM Jodhani, 1C solid", () => {
  const r = bag(
    { type: "twisted", W: 280, G: 150, H: 280, gsm: 90, paperRate: 51, paper: { colour: "brown" }, print: { slab: "solid", colours: 1 }, casePack: 250, qty: 15000 },
    { "bag.glue.rate_per_kg": 300 },
  );
  assert.equal(r.geometry.deckle, 880);
  assert.equal(r.geometry.cutoff, 392.5);
  near(r.geometry.paperG, 31.1, 0.05, "paper g");
  near(line(r, "paper"), 1.585, 0.001, "paper");
  near(line(r, "print"), 0.311, 0.001, "print");
  near(line(r, "conversion"), 0.466, 0.001, "conversion");
  near(line(r, "glue"), 0.165, 0.001, "glue");
  near(line(r, "wastage"), 0.118, 0.001, "wastage");
  near(r.cost, 4.13, 0.0051, "cost");
  assert.equal(r.sellRounded, 4.54);
  assert.equal(r.geometry.envelope.ok, true);
  assert.equal(r.geometry.envelope.plate.stocked, true);
  // plates and setup stay outside the rate
  assert.deepEqual(r.oneTime.map((o) => [o.key, o.value]), [["setup", 3000], ["plates", 5000]]);
});

test("nero-vbottom-246x248: flat V-bottom, OGR 40, 3C full patch", () => {
  const r = bag({ type: "vbottom", W: 246, G: 0, H: 248, gsm: 40, paperRate: 125, print: { slab: "p100", colours: 3 }, casePack: 1000, qty: 50000 });
  assert.equal(r.geometry.deckle, 512);
  assert.equal(r.geometry.cutoff, 263);
  near(r.geometry.paperG, 5.386, 0.001, "paper g");
  near(line(r, "glue"), 0.061, 0.001, "glue");
  near(line(r, "inner_poly"), 0.02, 1e-9, "inner poly");
  near(r.cost, 1.056, 0.001, "cost");
  assert.equal(r.sellRounded, 1.16);
  assert.equal(r.moq, 50000);
});

test("nexo-sos-240x140x330: SOS plain, Jodhani 100 GSM, carton ₹70 then ₹50", () => {
  const spec = { type: "sos", W: 240, G: 140, H: 330, gsm: 100, paperRate: 55, casePack: 500, qty: 25000 };
  const a = bag(spec, { "bag.glue.rate_per_kg": 300 });
  near(a.geometry.paperG, 33.9, 0.05, "paper g");
  near(a.cost, 2.61, 0.0051, "cost at ₹70 carton");
  assert.equal(a.sellRounded, 2.87);
  const b = bag({ ...spec, carton: { perCase: 50 } }, { "bag.glue.rate_per_kg": 300 });
  near(b.cost, 2.57, 0.0051, "cost at ₹50 carton");
  assert.equal(b.sellRounded, 2.83);
});

test("halal-guys-pth-10x7x12 steps 1–4: per-job rates, 3% wastage, FOB add", () => {
  const r = bag(
    {
      type: "twisted", W: 254, G: 178, H: 300, gsm: 110, paperRate: 80, paper: { colour: "white" },
      print: { slab: "flood", ratePerKg: 18, colours: 1 }, conversionPerKg: 10, wastagePct: 3, // the long-run lever, set for this job
      handle: { kind: "white_twisted", material: 0.85, pasting: 0.2 },
      casePack: 250, carton: { perCase: 42.6 }, qty: 250000, marginPct: 5,
    },
    { "bag.glue.rate_per_kg": 200 },
  );
  near(line(r, "paper"), 3.372, 0.001, "paper");
  near(line(r, "print"), 0.759, 0.001, "print");
  near(line(r, "glue"), 0.12, 0.001, "glue");
  near(line(r, "wastage"), 0.137, 0.001, "wastage 3% on a 2.5 lakh run");
  near(r.cost, 6.03, 0.0051, "cost");
  assert.equal(r.sellRounded, 6.33);
  near(r.geometry.bagG, 48.2, 0.6, "bag weight vs weighed 48.4 g");
});

test("brown-sugar pouch 1 as SOS 230×125×340, 90 GSM white, 1C logo", () => {
  const r = bag({ type: "sos", W: 230, G: 125, H: 340, gsm: 90, paperRate: 81, print: { slab: "solid", colours: 1 }, casePack: 500, qty: 20000 });
  assert.equal(r.geometry.deckle, 730);
  assert.equal(r.geometry.cutoff, 433.75);
  near(r.geometry.paperG, 28.5, 0.01, "paper g");
  near(line(r, "glue"), 0.108, 0.001, "glue");
  near(r.cost, 3.27, 0.0051, "cost");
  assert.equal(r.sellRounded, 3.6);
  assert.equal(r.geometry.envelope.ok, true);
  // carton_check.py sos → 485 × 365 × 291 for 500
  assert.deepEqual([r.packing.carton.w, r.packing.carton.l, r.packing.carton.h], [485, 365, 291]);
});

test("brown-sugar pouch 3: flat V-bottom 100×155, OGR 40, lap 15 at W ≤ 100", () => {
  const r = bag({ type: "vbottom", W: 100, G: 0, H: 155, gsm: 40, paperRate: 125, print: { slab: "solid", colours: 1 }, casePack: 1000, qty: 50000 });
  assert.equal(r.geometry.deckle, 215);
  near(r.geometry.paperG, 1.462, 0.001, "paper g");
  near(line(r, "glue"), 0.027, 0.001, "glue");
  near(r.cost, 0.34, 0.0051, "cost");
  assert.equal(r.sellRounded, 0.37);
});

test("kai-multitrade Mercury: export, margin on ex-factory, FOB per case in USD", () => {
  const r = bag(
    {
      type: "twisted", W: 203, G: 102, H: 254, gsm: 100, paperRate: 52.5, paper: { colour: "brown", supplier: "Om Shivaay" },
      casePack: 250, qty: 15000, destination: "usa",
      export: { fx: 95, chargesPerContainer: 78805, unitsPerContainer: 1572 * 250 },
    },
    { "bag.glue.rate_per_kg": 300 },
  );
  assert.equal(r.geometry.deckle, 630);
  // the saved working rounded the cut-off to 330 (formula gives 330.5), hence the looser paper check
  near(line(r, "paper"), 1.091, 0.0025, "paper");
  near(line(r, "glue"), 0.106, 0.001, "glue");
  near(r.cost, 3.06, 0.0051, "cost");
  assert.equal(r.sellRounded, 3.37);
  near(r.export.fobAddPerBag, 0.201, 0.001, "FOB add per bag");
  near(r.export.fob, 3.57, 0.0051, "FOB per bag");
  near(r.export.exwUsdPerCase, 8.86, 0.015, "ex-factory $/case");
  near(r.export.fobUsdPerCase, 9.38, 0.015, "FOB $/case");
});

test("kai Mars 330×178×432: W over 300 takes a 25 mm lap; outside the envelope", () => {
  const r = bag({ type: "twisted", W: 330, G: 178, H: 432, gsm: 100, paperRate: 52.5, casePack: 250, qty: 15000 }, { "bag.glue.rate_per_kg": 300 });
  assert.equal(r.geometry.deckle, 1041);
  near(r.cost, 5.91, 0.0051, "cost");
  assert.equal(r.ok, false);
  assert.ok(r.warnings.some((w) => w.code === "outside_envelope" && w.level === "block"));
});

test("noon-white-native-bag (11-Nov): blank from the print file, wastage on paper only", () => {
  const r = bag({
    type: "twisted", W: 230, G: 100, H: 300, gsm: 80, paperRate: 81, paper: { colour: "white" },
    blank: { deckle: 680, cutoff: 371.475 },
    print: { slab: "flood", colours: 3 }, handle: { kind: "white_twisted", material: 0.85, pasting: 0.2, sizeMm: 140 },
    wastagePct: 3, wastageBase: "paper", casePack: 500, carton: { perCase: 62.8 }, qty: 350000,
    extras: [{ label: "Setup over 3.5 lakh", perBag: 0.009 }],
  });
  near(r.geometry.paperG, 20.21, 0.01, "paper g");
  near(line(r, "paper"), 1.637, 0.001, "paper");
  near(line(r, "wastage"), 0.049, 0.001, "wastage");
  near(line(r, "glue"), 0.089, 0.001, "glue");
  near(r.cost, 3.667, 0.002, "cost");
  assert.equal(r.sellRounded, 4.03);
  assert.deepEqual(r.geometry.reel, { min: 680, max: 730 });
});

test("hob-sos-flap-bag-254x178x255 (locked 19-Nov): 3C at ₹30/kg plus a separate flap", () => {
  const r = bag({
    type: "sos", W: 254, G: 178, H: 255, gsm: 90, paperRate: 54,
    print: { slab: "p100", ratePerKg: 30, colours: 3 }, conversionPerKg: 15,
    wastagePct: 3, wastageBase: "paper", casePack: 500, carton: { perCase: 80 }, qty: 250000,
    extras: [{ label: "Gummed flap 254 × 52", perBag: 0.8918 }],
  });
  near(r.geometry.paperG, 30.91, 0.01, "paper g");
  near(line(r, "glue"), 0.1293, 0.0002, "glue");
  near(r.cost - 0.8918, 3.3994, 0.0005, "bag without flap");
  near(r.cost, 4.2912, 0.0005, "cost");
});

test("zepto-sos4-ogr: plate repeat 311.15 wins over H + 0.75G", () => {
  const r = bag({
    type: "sos", W: 130, G: 70, H: 265, gsm: 50, paperRate: 125,
    blank: { deckle: 420, cutoff: 311.15 }, print: { slab: "p100", ratePerKg: 30, colours: 1 },
    gluePerBag: 0.078, casePack: 2000, carton: { perCase: 46.58 }, qty: 100000,
  });
  near(r.geometry.paperG, 6.53, 0.006, "paper g");
  near(r.cost, 1.23, 0.0051, "cost");
  assert.equal(r.sellRounded, 1.36);
  assert.equal(r.geometry.fromPrintFile, true);
});

// ── Rules, not single quotes ────────────────────────────────────────────────

test("gusset 180 is made at 178 and flagged; gusset 208 goes to a vendor at 15%", () => {
  const base = { type: "twisted", W: 280, H: 330, gsm: 100, paperRate: 55, qty: 15000 };
  const a = bag({ ...base, G: 180 });
  assert.equal(a.size.G, 178);
  assert.equal(a.route, "inhouse");
  assert.ok(a.warnings.some((w) => w.code === "gusset_clamped"));
  const b = bag({ ...base, G: 208 });
  assert.equal(b.route, "vendor");
  assert.equal(b.marginPct, 15);
  assert.ok(b.lines.find((l) => l.key === "conversion").basis.includes("₹20/kg"));
});

test("Sign Laban 180×152×178 fails the envelope and shows both fixes", () => {
  const r = bag({ type: "twisted", W: 180, G: 152, H: 178, gsm: 100, paperRate: 55, qty: 15000 });
  assert.equal(r.ok, false);
  const env = r.geometry.envelope;
  assert.equal(Math.round(env.tube), 294);
  assert.match(r.warnings.find((w) => w.code === "outside_envelope").message, /too short for a 152 mm gusset/);
  assert.equal(Math.round(env.minTube), 364);
  assert.equal(env.fixes.length, 2);
  assert.equal(env.plate.stocked, false);
});

test("a GSM too light for the width is flagged; a printed V-bottom under its 50,000 MOQ is too", () => {
  const light = bag({ type: "twisted", W: 280, G: 150, H: 280, gsm: 60, paperRate: 56, qty: 15000 });
  assert.ok(light.warnings.map((w) => w.code).includes("gsm_too_light"));
  const vb = bag({ type: "vbottom", W: 246, G: 0, H: 248, gsm: 40, paperRate: 125, print: { slab: "p100", colours: 3 }, qty: 20000 });
  assert.equal(vb.route, "inhouse");
  assert.ok(vb.warnings.map((w) => w.code).includes("below_moq"));
});

test("US bags on Jodhani paper are blocked", () => {
  const r = bag({ type: "sos", W: 240, G: 140, H: 330, gsm: 100, paperRate: 55, paper: { supplier: "Jodhani Mill" }, destination: "usa", qty: 25000 });
  assert.equal(r.ok, false);
  assert.ok(r.warnings.some((w) => w.code === "no_jodhani_usa"));
});

test("carton models match carton_check.py", () => {
  // handle 254 178 300 110 250 150 → 410 × 274 × 455 (cortex halal-guys, 11-Nov)
  const t = bag({ type: "twisted", W: 254, G: 178, H: 300, gsm: 110, paperRate: 80, casePack: 250, qty: 15000 });
  assert.deepEqual([t.packing.carton.w, t.packing.carton.l, t.packing.carton.h], [274, 410, 455]);
  // flat 295 150 300 90 450 → measured 400 × 305 × 550
  const f = bag({ type: "flat", W: 295, G: 150, H: 300, gsm: 90, paperRate: 49, casePack: 450, qty: 15000 });
  assert.deepEqual([f.packing.carton.w, f.packing.carton.l], [305, 400]);
  near(f.packing.carton.h, 549, 1, "flat stack height");
});

test("the ladder never puts plates or setup in the rate", () => {
  const r = bag({ type: "twisted", W: 280, G: 150, H: 280, gsm: 90, paperRate: 51, print: { slab: "p100", colours: 4 }, qty: 15000 });
  const [q15, , , q100, q250] = r.ladder;
  assert.equal(q15.sellRounded, q100.sellRounded);
  assert.equal(q250.sell, q100.sell, "5% wastage on every quote: 3% on a long run is a lever, never automatic");
  const long = bag({ type: "twisted", W: 280, G: 150, H: 280, gsm: 90, paperRate: 51, qty: 250000 });
  assert.ok(long.warnings.some((w) => w.code === "long_run_lever"));
  assert.ok(bag({ type: "twisted", W: 280, G: 150, H: 280, gsm: 90, paperRate: 51, qty: 250000, wastagePct: 3 }).sell < long.sell);
  near(q15.oneTimePerBag, (3000 + 4 * 5000) / 15000, 1e-9, "one-time per bag at 15k");
  assert.ok(r.ratesUsed.some((u) => u.key === "bag.plate.flexo_per_colour" && u.status === "disputed"));
});
