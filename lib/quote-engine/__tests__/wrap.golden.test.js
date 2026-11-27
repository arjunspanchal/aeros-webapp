// Wrap paper against Arjun's three saved wrap workings (cortex/quotes):
//   deli-wrap-15x15in.yaml                      reel, flexo, FINAL_32_v4 (20-Oct-2026)
//   deli-wrap-380x380-from-20x30.yaml           stock sheets, offset, the printer's slab card (24-Oct-2026)
//   deli-paper-ogr-40gsm-10x11-10x14-12x12.yaml reel, plain, FINAL_RM_132 (3-Nov-2026)

import test from "node:test";
import assert from "node:assert/strict";
import { price } from "../index.js";
import { wrapsPerSheet, WRAP_SHEETS } from "../families/wrap.js";
import { customerLine, supplierWordsIn } from "../../calc-v2/present.js";
import { buildRecords } from "../../calc-v2/record.js";
import { wrapSpec, wrapState, WRAP_INITIAL } from "../../../app/calculator/v2/specs.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);
const line = (r, key) => r.lines.find((l) => l.key === key)?.value;
const codes = (r) => r.warnings.map((w) => w.code);
const wrap = (patch, overrides) => price({ family: "wrap", ...patch }, overrides);

test("15 × 15 in deli wrap, 32 GSM at ₹134, 1-colour flexo on the reel (FINAL_32_v4: cost 0.91)", () => {
  // the working's carton was costed at ₹52.6/kg corrugated; today's rate is ₹55
  const r = wrap({ W: 381, L: 381, gsm: 32, paperRate: 134, print: { mode: "flexo", colours: 1 }, qty: 100000 }, { "corrugated.finished_per_kg": { value: 52.6 } });
  assert.equal(r.ok, true);
  near(r.geometry.netG, 4.645, 1e-3, "sheet weight");
  near(line(r, "paper"), 0.622, 1e-3, "paper");
  near(line(r, "wastage"), 0.05, 1e-3, "wastage 8%");
  near(line(r, "cutting"), 0.046, 1e-3, "slitting + cutting ₹10/kg");
  near(line(r, "print"), 0.163, 1e-3, "flexo ₹35/kg");
  assert.equal(r.packing.casePack, 3000, "3 polys of 1,000: 13.9 kg, kept under 15 kg");
  near(r.packing.netKg, 13.9, 0.05, "case weight");
  near(line(r, "packing"), 0.003 + 0.0107 + 0.0013 + 0.01, 1.5e-3, "poly + carton + tape and label + labour");
  near(r.cost, 0.91, 0.006, "cost");
  assert.deepEqual(r.sellOptions.map((o) => o.sell), [1.04, 1.09, 1.13], "sell at 15 / 20 / 25%");
  assert.equal(r.sellRounded, 1.09, "20% markup by default");
  assert.equal(r.marginMode, "markup");
  // the rate does not move with quantity on a reel job; plates and run setup are outside it
  assert.ok(r.ladder.every((row) => row.sell === r.ladder[0].sell));
  assert.deepEqual(r.oneTime.map((o) => [o.key, o.value]), [["plates", 9000], ["setup", 2000]]);
  assert.ok(!r.lines.some((l) => /setup|plate/i.test(l.label)), "nothing one-time inside the rate");
  // 1 lakh sheets is about half a tonne: far under the mill's 5 tonne reel minimum
  assert.ok(codes(r).includes("under_mill_moq"));
});

test("380 × 380 mm wrap cut from 20 × 30 in sheets, 40 GSM at ₹134, offset on the printer's slab card", () => {
  assert.equal(wrapsPerSheet(380, 380, WRAP_SHEETS["20x30"]), 2, "2 per sheet: 380 across 508, 2 × 380 along 762");
  const at = (qty) => wrap({ W: 380, L: 380, gsm: 40, paperRate: 134, sheet: "20x30", print: { mode: "offset", colours: 1 }, qty, casePack: 2000 });
  const r = at(2000);
  near(r.geometry.boughtG, 7.742, 1e-3, "paper bought per wrap: the whole sheet ÷ 2");
  near(line(r, "paper"), 1.037, 1e-3, "paper");
  near(line(r, "wastage"), 0.083, 1e-3, "wastage");
  near(line(r, "cutting"), 0.025, 1e-9, "cutting ₹50 per 1,000 sheets ÷ 2");
  near(line(r, "bundling"), 0.004, 2e-4, "bundle ₹25 per 3,000 sheets ÷ 2");
  near(line(r, "packing"), 0.03, 1.5e-3, "packing");
  // the working's ladder: [sheets, wraps, print per wrap, cost]
  for (const [wraps, print, cost] of [[2000, 0.6, 1.78], [4000, 0.5, 1.68], [6000, 0.45, 1.63], [12000, 0.4, 1.58], [18000, 0.375, 1.555], [26000, 0.35, 1.53], [34000, 0.325, 1.505], [42000, 0.3, 1.48], [52000, 0.275, 1.455]]) {
    const x = at(wraps);
    near(line(x, "print"), print, 1e-9, `print at ${wraps} wraps`);
    near(x.cost, cost, 0.004, `cost at ${wraps} wraps`);
  }
  // under the 1,000-sheet minimum the print charge is flat: ₹1,200 over the order
  const small = at(1000);
  near(line(small, "print"), 1200 / 1000, 1e-9, "500 sheets billed as 1,000");
  assert.ok(codes(small).includes("under_min_sheets"));
  assert.ok(codes(r).includes("thin_on_offset"), "40 GSM on a sheet-fed press is flagged");
  assert.ok(codes(r).includes("low_utilisation") === false, "74.6% of the sheet is used");
  assert.deepEqual(r.oneTime.map((o) => [o.key, o.value]), [["plates", 600]]);
});

test("plain 40 GSM deli paper from a reel at ₹132: 10 × 11, 10 × 14 and 12 × 12 in (FINAL_RM_132)", () => {
  // that quote used ₹8/kg conversion; Arjun's ruling of 20-Oct is ₹10, which is the rate-book default
  for (const [W, L, paper, cost, sells] of [[254, 279.4, 0.375, 0.447, [0.51, 0.54, 0.56]], [254, 355.6, 0.477, 0.564, [0.65, 0.68, 0.7]], [304.8, 304.8, 0.491, 0.58, [0.67, 0.7, 0.72]]]) {
    const r = wrap({ W, L, gsm: 40, paperRate: 132, casePack: 5000, cuttingPerKg: 8, qty: 100000 });
    near(line(r, "paper"), paper, 1e-3, `paper ${W} × ${L}`);
    near(r.cost, cost, 0.003, `cost ${W} × ${L}`);
    assert.deepEqual(r.sellOptions.map((o) => o.sell), sells, `sell ${W} × ${L}`);
    assert.equal(r.oneTime.length, 1, "plain: run setup only, no plates");
  }
  const today = wrap({ W: 254, L: 279.4, gsm: 40, paperRate: 132, qty: 100000 });
  near(line(today, "cutting"), 2.839 * 10 / 1000, 1e-4, "₹10/kg by default");
  assert.equal(today.packing.casePack, 5000, "5,000 sheets is 14.2 kg");
  // 10 × 14 at 5,000 a case is 18 kg: over the ceiling, so the standard pack is 4,000
  assert.equal(wrap({ W: 254, L: 355.6, gsm: 40, paperRate: 132 }).packing.casePack, 4000);
  assert.ok(codes(wrap({ W: 254, L: 355.6, gsm: 40, paperRate: 132, casePack: 5000 })).includes("case_too_heavy"));
});

test("wrap inputs are checked: a size in the wrong unit, no paper rate, a wrap that does not fit its sheet", () => {
  assert.match(wrap({ W: 15, L: 15, gsm: 32, paperRate: 134 }).errors[0], /too small/);
  assert.match(wrap({ W: 381, L: 381, gsm: 32 }).errors[0], /paper rate/);
  assert.match(wrap({ W: 800, L: 800, gsm: 40, paperRate: 134, sheet: "20x30", print: { mode: "offset" } }).errors[0], /does not fit/);
  const forced = wrap({ W: 380, L: 380, gsm: 40, paperRate: 134, sheet: "20x30", ups: 4, print: { mode: "offset" } });
  assert.equal(forced.ok, false);
  assert.ok(codes(forced).includes("ups_impossible"));
  // plain wraps can be cut from stock sheets too: cutting is then per kg of the sheet, as the working (0.077)
  const plainSheet = wrap({ W: 380, L: 380, gsm: 40, paperRate: 134, source: "sheet", sheet: "20x30", casePack: 2000 });
  near(line(plainSheet, "cutting"), 0.077, 1e-3, "cutting ₹10/kg on the sheet weight");
  near(plainSheet.cost, 1.23, 0.006, "plain from sheets: 1.23");
});

test("a wrap on the customer's quote and in the saved record: no cost, margin or mill; the form round-trips", () => {
  const spec = wrapSpec({ ...WRAP_INITIAL, name: "Deli paper", unit: "in", W: "10", L: "11", gsm: "40", paperRate: "132", paperLabel: "Pudumjee OGR Solidwrap 40", supplier: "Pudumjee", paperType: "OGR", printMode: "flexo", colours: "1", qty: "250000" });
  assert.deepEqual([spec.W, spec.L, spec.source], [254, 279.4, "reel"], "inches are converted exactly; flexo is a reel job");
  assert.deepEqual(wrapSpec(wrapState(spec)), spec, "spec → form → spec is the same spec");
  const result = price(spec);
  const c = customerLine(spec, result, "Their ref 7");
  assert.deepEqual([c.item, c.size, c.material, c.printing, c.basis], ["Deli paper", "254 × 279.4 mm", "Grease-resistant paper, 40 GSM", "1 colour", "EXW"]);
  assert.equal(c.rate, result.sellRounded);
  assert.equal(c.casePack, 5000);
  assert.deepEqual(supplierWordsIn(JSON.stringify(c)), [], "no mill or printer name reaches the customer");
  assert.ok(!/cost|margin|markup/i.test(JSON.stringify(c)));
  assert.deepEqual(c.oneTime.map((o) => o.label), ["Printing plates (1 colour) (one-time, extra)", "Setup charge (one-time, extra)"]);
  const rec = buildRecords({ spec, result, customer: "ZZ Test", by: "Test", engineVersion: "t", now: new Date("2026-11-27T10:00:00Z") });
  assert.equal(rec.quote.quote_type, "wrap");
  assert.equal(rec.line.item_key, "wrap-deli-paper-254x279.4-40gsm-flexo");
  assert.equal(rec.quote.selling_price_inr, result.sellRounded);
});
