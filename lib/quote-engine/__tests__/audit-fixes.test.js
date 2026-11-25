// Regression tests for the 23-Nov-2026 audit. Each one pins a defect that was
// live: a wrong price, a wrong price basis on a saved quote, or an input that
// broke the screen. They run the real form mapping (specs.js) and the real
// record builder (record.js), not only the engine.

import test from "node:test";
import assert from "node:assert/strict";
import { price } from "../index.js";
import { laneFor } from "../rates/defaults.js";
import { bagSpec, cupSpec, boxSpec, BAG_INITIAL, CUP_INITIAL, BOX_INITIAL } from "../../../app/calculator/v2/specs.js";
import { buildRecords, indiaStamp, quotedPrice } from "../../calc-v2/record.js";

const near = (a, e, tol, what = "") => assert.ok(Math.abs(a - e) <= tol, `${what} expected ${e}, got ${a}`);
const line = (r, key) => r.lines?.find((l) => l.key === key)?.value;
const codes = (r) => (r.warnings ?? []).map((w) => w.code);
const bag = (patch, rates) => price(bagSpec({ ...BAG_INITIAL, paperRate: "56.5", ...patch }), rates);
const cup = (patch, rates) => price(cupSpec({ ...CUP_INITIAL, ...patch }), rates);
const box = (patch, rates) => price(boxSpec({ ...BOX_INITIAL, ups: "4", ...patch }), rates);
const record = (spec, extra = {}) => {
  const result = price(spec);
  return buildRecords({ spec, result, customer: "Test Co", brand: "", notes: "", by: "tester", engineVersion: "t", now: new Date("2026-11-23T06:00:00Z"), ...extra });
};

// ── A price is a real number or an error, never NaN / Infinity ──────────────

test("bad quantities and case packs give an error, not a broken price", () => {
  for (const r of [bag({ casePack: "0" }), bag({ qty: "0" }), cup({ casePack: "0" }), cup({ gsm: "0" }), box({ casePack: "0" }), box({ qty: "0" }), box({ ups: "0" })]) {
    assert.equal(r.ok, false);
    assert.equal(r.lines, undefined, "no cost lines on an invalid spec");
    assert.ok(r.errors.length > 0);
  }
  assert.match(cup({ marginPct: "100" }).errors[0], /under 100%/);
  assert.match(cup({ size: "20oz", vendorRate: "0" }).errors[0], /above zero/);
  assert.match(cup({ cupWeight: "0.2" }).errors[0], /too light/);
});

test("a zero in the rate book cannot produce an infinite price", () => {
  const r = cup({}, { "cup.fleet.hours": 0 });
  assert.equal(r.ok, false);
  assert.equal(r.lines, undefined);
  assert.match(r.errors[0], /valid number/);
});

test("box: board per piece alone is not enough when work is billed per sheet", () => {
  const r = price(boxSpec({ ...BOX_INITIAL, boardGPerPc: "30", printMode: "card" }));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /pieces per sheet/);
  // with an all-in converter rate and no lamination there is nothing per-sheet left, so it prices
  const ok = price(boxSpec({ ...BOX_INITIAL, sheetKey: "custom", boardGPerPc: "30", conversionAllIn: "0.8" }));
  assert.equal(ok.ok, true);
  near(ok.cost, 30 * 75 / 1000 * 1.07 + 0.8 + line(ok, "packing"), 1e-9, "board + 7% + converter + packing");
});

// ── Price basis of a saved quote ────────────────────────────────────────────

test("an India bag with a leftover FOB tick is priced and saved ex-factory", () => {
  const spec = bagSpec({ ...BAG_INITIAL, paperRate: "56.5", destination: "domestic", fob: true });
  assert.equal(spec.export, undefined);
  const { quote, line: ql } = record(spec);
  assert.equal(ql.price_basis, "EXW_BHIWANDI");
  assert.equal(quote.selling_price_inr, 4.33);
});

test("an export bag saves the FOB price and says so", () => {
  const spec = bagSpec({ ...BAG_INITIAL, paperRate: "52.5", destination: "usa", fob: true });
  const result = price(spec);
  const { quote, line: ql } = record(spec);
  assert.equal(ql.price_basis, "FOB");
  assert.equal(quote.payload.price_basis, "FOB");
  near(quote.selling_price_inr, result.export.fob, 0.005, "saved rate is the FOB rate");
  assert.ok(result.export.fob > result.sell);
});

test("cup FOB: asked for without a container count it warns; with one it is saved as FOB", () => {
  const missing = cup({ fob: true });
  assert.ok(codes(missing).includes("no_container_fill"));
  assert.equal(line(missing, "fob"), undefined);
  assert.equal(quotedPrice({ family: "cup" }, missing).basis, "EXW_BHIWANDI");

  const spec = cupSpec({ ...CUP_INITIAL, fob: true, unitsPerContainer: "500000" });
  const r = price(spec);
  near(line(r, "fob"), 78805 / 500000, 1e-9, "rate-book charges incl. AMS ÷ cups");
  const { quote, line: ql } = record(spec);
  assert.equal(ql.price_basis, "FOB");
  near(quote.selling_price_inr, r.sell, 0.005, "the cup price already includes FOB");
});

test("a blocked spec has no saveable price basis mix-up: ok is false", () => {
  const r = bag({ supplier: "Jodhani Mill", destination: "usa" });
  assert.equal(r.ok, false); // the server refuses to save when ok is false
  assert.ok(codes(r).includes("no_jodhani_usa"));
});

test("quote date and reference use India time, to the second", () => {
  // 20:40:05 UTC on the 23rd is 02:10:05 on the 24th in India
  assert.deepEqual(indiaStamp(new Date("2026-11-23T20:40:05Z")), { date: "2026-11-24", time: "021005" });
  const { quoteRef, quote } = record(bagSpec({ ...BAG_INITIAL, paperRate: "56.5" }), { now: new Date("2026-11-23T20:40:05Z"), customer: "Nero" });
  assert.equal(quoteRef, "CALC-20261124-NERO-021005");
  assert.equal(quote.quote_date, "2026-11-24");
});

test("confidence is high on a clean quote and low when something is assumed or warned", () => {
  assert.equal(record(bagSpec({ ...BAG_INITIAL, paperRate: "56.5" })).line.confidence, "high");
  assert.equal(record(bagSpec({ ...BAG_INITIAL, paperRate: "56.5", handleKind: "black_twisted" })).line.confidence, "low"); // assumed rate
  assert.equal(record(bagSpec({ ...BAG_INITIAL, paperRate: "56.5", gsm: "60" })).line.confidence, "low"); // too light for the width
});

// ── Wrong prices ────────────────────────────────────────────────────────────

test("offset cups are costed as a printer's job, not a ₹0.40 placeholder (Jallo 12oz, 5-Nov)", () => {
  const r = cup(
    { wall: "DW", size: "12oz", gsm: "280", outerGsm: "290", outerPaper: "TNPL", outerRate: "73", printMode: "offset", colours: "3", outerSheetW: "750", outerSheetH: "381", outerSheetUps: "9", qty: "25000" },
    { "cup.offset.makeready_sheets": 100 }, // the Jallo job allowed 100
  );
  // sheets = 25,000 ÷ 9 + 100 = 2,878; 3 Pantone = ₹4.60 a sheet
  near(line(r, "print"), 0.5296, 1e-4, "print per cup, as the saved working");
  near(line(r, "varnish"), (1.08 * 2878) / 25000, 1e-9, "varnish");
  near(line(r, "offset_punch"), (0.59 * 2878) / 25000, 1e-9, "punching");
  near(line(r, "makeready"), 0.0329, 2.5e-3, "100 make-ready sheets of outer board (the saved working also pays for an 800 reel)");
  // the printer punches the printed outer wall; only the inner wall is still punched by us
  const flexo = cup({ wall: "DW", size: "12oz", gsm: "280", outerGsm: "290", outerPaper: "TNPL", outerRate: "73", printMode: "flexo", colours: "3", qty: "25000" });
  assert.ok(line(r, "punch") > 0 && line(r, "punch") < line(flexo, "punch"), "inner-wall punching only");
  // smaller runs carry more make-ready per cup
  const [q10, q25] = [r.ladder.find((x) => x.qty === 10000), r.ladder.find((x) => x.qty === 25000)];
  assert.ok(q10.sell > q25.sell);
});

test("offset on a DW cup runs on the offset outer sheet, not the flexo reel layout (12oz is 9-up, measured)", () => {
  const r = cup({ wall: "DW", size: "12oz", gsm: "280", printMode: "offset", colours: "3", qty: "9000" });
  assert.ok(!codes(r).includes("offset_outer_sheet") && !codes(r).includes("offset_outer_assumed"));
  // 9,000 cups ÷ 9-up = 1,000 sheets + 50 make-ready
  near(line(r, "varnish"), (1.08 * 1050) / 9000, 1e-9, "varnish on 1,050 sheets");
  assert.ok(codes(cup({ wall: "DW", size: "10oz", gsm: "280", printMode: "offset", colours: "3", qty: "9000" })).includes("offset_outer_assumed"));
});

test("a short offset cup job pays the flat Pantone card, the punching minimum and the make-ready board (locked 7-Nov)", () => {
  // DW 8oz, 3 Pantone, 3,000 cups: 250 sheets + 50 make-ready = 300 sheets
  const r = cup({ wall: "DW", size: "8oz", gsm: "280", printMode: "offset", colours: "3", qty: "3000" });
  near(line(r, "print"), 4600 / 3000, 1e-9, "3 Pantone ₹4,600 flat up to 1,000 sheets");
  near(line(r, "offset_punch"), 500 / 3000, 1e-9, "punching ₹500 a job");
  near(line(r, "varnish"), (1.08 * 300) / 3000, 1e-9, "varnish on the sheets run");
  assert.ok(line(r, "makeready") > 0.08 && line(r, "makeready") < 0.16, "50 sheets of outer board over 3,000 cups");
  assert.ok(codes(r).includes("under_min_sheets"));
  // the job charges come to about ₹5,500, as the locked per-job figure (₹5,505)
  const job = (line(r, "print") + line(r, "offset_punch") + line(r, "makeready")) * 3000 + 50 * 1.08;
  assert.ok(Math.abs(job - 5505) < 120, `job ${job}`);
  assert.ok(codes(cup({ wall: "DW", size: "8oz", gsm: "280", printMode: "offset", colours: "3", qty: "1500" })).includes("below_print_moq"));
});

test("small SOS bags are costed in bales, close to the Praful 19-Nov working (0.628)", () => {
  const r = bag({ type: "sos", W: "127", G: "79", H: "248", gsm: "60", paperRate: "56" });
  assert.equal(r.packing.baled, true);
  near(line(r, "carton"), 10 / 500, 1e-9, "bale ₹10 per 500");
  near(r.cost, 0.628, 0.01, "cost");
  // a big SOS still goes in a carton; so does a small one when asked
  assert.equal(bag({ type: "sos", W: "240", G: "140", H: "330", gsm: "100", paperRate: "55" }).packing.baled, false);
  assert.equal(bag({ type: "sos", W: "127", G: "79", H: "248", gsm: "60", paperRate: "56", packing: "carton" }).packing.baled, false);
});

test("bag FOB fills the container with outside carton sizes and says it is an estimate", () => {
  const r = bag({ W: "203", G: "102", H: "254", gsm: "100", paperRate: "52.5", destination: "usa", fob: true });
  const c = r.packing.carton;
  // inside 223 × 364 × 365 → outside 233 × 374 × 375; best of the six orientations in 12,032 × 2,352 × 2,698
  assert.deepEqual([c.w, c.l, c.h], [223, 364, 365]);
  const o = [233, 374, 375];
  const best = Math.max(...[[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
    .map(([i, j, k]) => Math.floor(12032 / o[i]) * Math.floor(2352 / o[j]) * Math.floor(2698 / o[k])));
  assert.equal(r.export.fill.cases, best);
  assert.ok(r.export.fill.cases < 2376, "fewer than the inside-size count");
  assert.ok(codes(r).includes("container_estimate"));
});

test("plain boxes are punched at the chosen printer's rate, and Lucky's sheet is allowed", () => {
  near(line(box({ printer: "lucky" }), "punch"), 550 / 1000 / 4, 1e-9, "Lucky punching");
  near(line(box({ printer: "blueline_walkin" }), "punch"), 350 / 1000 / 4, 1e-9, "Blueline punching");
  assert.equal(box({ printer: "lucky", sheetKey: "27.5x38" }).ok, true);
  assert.equal(box({ printer: "blueline_walkin", sheetKey: "27.5x38" }).ok, false);
});

test("the locked Blueline rate under 25,000 sheets is called out", () => {
  assert.ok(codes(box({ printer: "blueline_locked", printMode: "card", qty: "5000" })).includes("locked_under_band"));
  assert.ok(!codes(box({ printer: "blueline_locked", printMode: "card", qty: "100000" })).includes("locked_under_band"));
});

test("more pieces than can fit on the sheet is blocked", () => {
  const r = box({ sheetKey: "20x30", ups: "20", blankW: "200", blankH: "300" });
  assert.equal(r.ok, false);
  assert.ok(codes(r).includes("ups_impossible"));
});

test("flat CMYK ink means four plates on one side, whatever the hidden fields hold", () => {
  const r = box({ printMode: "ink_flat", colours: "2", sides: "2" });
  assert.equal(r.oneTime.find((o) => o.key === "plates").value, 4 * 600);
});

test("board and PE rates come from the rate book and are recorded with the quote", () => {
  const r = box({ boardKey: "kraft", pe: true });
  near(line(r, "board"), (((635 * 914.4) / 1e6) * 300 / 4) * (50 + 18) / 1000, 1e-9, "kraft ₹50 + PE ₹18");
  const used = r.ratesUsed.map((u) => u.key);
  assert.ok(used.includes("box.board.kraft") && used.includes("box.board.pe_per_kg"));
  // a rate-book change moves the price
  assert.ok(box({ boardKey: "kraft" }, { "box.board.kraft": 60 }).cost > box({ boardKey: "kraft" }).cost);
});

test("cup form blanks follow the rate book (poly board, outer paper, flexo rate)", () => {
  const base = cup({ wall: "DW", printMode: "flexo" });
  assert.ok(cup({ wall: "DW", printMode: "flexo" }, { "cup.paper.poly_board": 110 }).cost > base.cost);
  assert.ok(cup({ wall: "DW", printMode: "flexo" }, { "cup.paper.TNPL": 80 }).cost > base.cost);
  assert.ok(cup({ wall: "DW", printMode: "flexo" }, { "cup.print.flexo_per_kg": 7 }).cost > base.cost);
});

test("switching a twisted bag to flat handle does not keep the rope price (form reset)", () => {
  // the form clears handleKind on a type change; with it cleared the flat handle rate applies
  const r = bag({ type: "flat", handleKind: "" });
  near(line(r, "handle"), 1.0, 1e-9, "flat handle ₹1.00");
});

test("a lane is added only for mills whose rate is ex-mill", () => {
  assert.deepEqual(["Jodhani Mill", "Om Shivaay", "Ajit", "Pudumjee", "Khateema", "JK", "BILT", "Jani Mill"].map(laneFor), [5, 3, 2, 5, 0, 0, 0, 0]);
});
