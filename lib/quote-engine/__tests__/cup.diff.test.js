// The cup engine is a port of the cup skill's rate_calc.py. These tests hold
// it to the Python output line by line, over set-ups taken from real quotes
// (AB Coffee, NOON, Zepto tubs, Praful, Jallo, Hercules). Fixtures are made by
// fixtures/gen_cup_fixtures.py; regenerate them whenever the script changes.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { price } from "../index.js";

const cases = JSON.parse(readFileSync(new URL("./fixtures/cup-rate-calc.json", import.meta.url), "utf8"));
const near = (a, e, tol, what) => assert.ok(Math.abs(a - e) <= tol, `${what}: expected ${e}, got ${a}`);

for (const c of cases) {
  test(`rate_calc.py parity: ${c.name}`, () => {
    const r = price({ family: "cup", marginPct: 0, ...c.spec });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    near(r.rawMaterial, c.expected.rm, 1e-9, "raw material");
    near(r.cost, c.expected.cost, 1e-9, "cost");
    near(r.geometry.paperG, c.expected.paperG, 1e-9, "paper bought g");
    assert.equal(r.packing.casePack, c.expected.casePack);
    assert.equal(r.lines.length, c.expected.lines.length, "same number of cost lines");
    r.lines.forEach((l, i) => near(l.value, c.expected.lines[i], 5e-5, `line ${i} (${l.label})`));
  });
}

// ── Figures recorded in cortex/quotes ───────────────────────────────────────
const cup = (spec, rates) => price({ family: "cup", ...spec }, rates);
const flexo1 = { mode: "flexo", ratePerKg: 5, colours: 1 };

test("ab-coffee-dw-cups (2-Nov): mfg 2.0405 / 2.8138; before the conversion change 1.9187 / 2.6920", () => {
  const base = { wall: "DW", print: flexo1, punchPerKg: 5, viana: true, polyRate: 105, outerRate: 76, marginPct: 0 };
  near(cup({ ...base, size: "8oz", gsm: 260, cupWeight: 12.5 }).cost, 2.0405, 5e-5, "8oz");
  near(cup({ ...base, size: "12oz", gsm: 280, cupWeight: 17 }).cost, 2.8138, 5e-5, "12oz");
  const old = { "cup.conversion.dw": 0.0782 };
  near(cup({ ...base, size: "8oz", gsm: 260, cupWeight: 12.5 }, old).cost, 1.9187, 1e-4, "8oz old conversion");
  near(cup({ ...base, size: "12oz", gsm: 280, cupWeight: 17 }, old).cost, 2.692, 1e-4, "12oz old conversion");
});

test("zepto-tubs-350-400ml: 1.6922 → 1.88 and 1.7787 → 1.98 at 10% on sell", () => {
  const base = { wall: "TUB", gsm: 280, paper: "TNPL", print: flexo1, punchPerKg: 5, marginPct: 10 };
  const a = cup({ ...base, size: "350_ml" });
  near(a.cost, 1.6922, 5e-5, "350 ml cost");
  assert.equal(a.sellRounded, 1.88);
  assert.equal(a.marginMode, "on_sell");
  const b = cup({ ...base, size: "400_ml" });
  near(b.cost, 1.7787, 5e-5, "400 ml cost");
  assert.equal(b.sellRounded, 1.98);
});

test("generic-printed-cups (Praful 19-Nov): SW 1.2176 / 1.9583 → 1.43 / 2.30 at 15%", () => {
  const base = { wall: "SW", print: flexo1, punchPerKg: 5, polyRate: 105, marginPct: 15, genericDesign: true };
  const a = cup({ ...base, size: "8oz", gsm: 260 });
  near(a.cost, 1.2176, 5e-5, "8oz");
  assert.equal(a.sellRounded, 1.43);
  assert.equal(a.oneTime.length, 0, "stock designs carry no plate charge");
  assert.equal(cup({ ...base, size: "16oz", gsm: 280 }).sellRounded, 2.3);
});

test("hercules DW 16oz: FOB goes into the cost before margin, (3.1184 + 78,805 ÷ 308,500) ÷ 0.9", () => {
  // the saved cost 3.1184 came from this build with the carton at its table value
  const r = cup({ wall: "DW", size: "16oz", gsm: 280, print: { mode: "flexo", ratePerKg: 5, colours: 3 }, punchPerKg: 5, viana: true, polyRate: 105, outerRate: 76, marginPct: 10, export: { chargesPerContainer: 78805, unitsPerContainer: 308500, fx: 98 } });
  near(r.export.fobAddPerUnit, 0.2554, 1e-4, "FOB per cup");
  near(r.sell, (r.mfg + 78805 / 308500) / 0.9, 1e-9, "sell");
  near(r.export.usdPer1000, (r.sell * 1000) / 98, 1e-9, "USD per 1000");
});

// ── Make-or-buy guard ───────────────────────────────────────────────────────

test("20oz is bought from a vendor: refused without a vendor rate, vendor × 1.10 with one", () => {
  const refused = cup({ wall: "SW", size: "20oz" });
  assert.equal(refused.ok, false);
  assert.equal(refused.route, "bought_in");
  // arvis-rfq-sw-cups: Carma ₹3.00 × 1.10, then 15% on sell = 3.88
  const r = cup({ wall: "SW", size: "20oz", vendorRate: 3.0, marginPct: 15 });
  assert.equal(r.ok, true);
  near(r.cost, 3.3, 1e-9, "cost");
  assert.equal(r.sellRounded, 3.88);
});

test("24oz is not offered; ripple and unknown sizes are refused, never estimated", () => {
  assert.equal(cup({ wall: "DW", size: "24oz" }).route, "not_offered");
  assert.equal(cup({ wall: "RIPPLE", size: "12oz" }).ok, false);
  assert.equal(cup({ wall: "SW", size: "6oz" }).ok, false);
  assert.match(cup({ wall: "TUB", size: "500_ml", gsm: 300 }).errors[0], /die is not on file/);
});

test("an unverified die and an assumed carton are flagged", () => {
  const r = cup({ wall: "SW", size: "10oz", gsm: 280 });
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes("die_unverified"));
  assert.ok(codes.includes("carton_assumed"));
});
