// The quote list: pasting an RFQ's sizes, what the customer's Excel may show,
// and how a multi-line quote is recorded.

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { price } from "../index.js";
import { parseSizes } from "../../../app/calculator/v2/parseSizes.js";
import { bagSpec, cupSpec, boxSpec, BAG_INITIAL, CUP_INITIAL, BOX_INITIAL } from "../../../app/calculator/v2/specs.js";
import { customerLine, quoteTerms } from "../../calc-v2/present.js";
import { customerWorkbook, internalWorkbook } from "../../calc-v2/excel.js";
import { buildRecords, newQuoteRef } from "../../calc-v2/record.js";

const priced = (spec, ref = "") => ({ spec, ref, result: price(spec) });
const bagLine = (patch, ref) => priced(bagSpec({ ...BAG_INITIAL, paperRate: "56.5", supplier: "Jodhani Mill", paperLabel: "Jodhani Brown Kraft 90 GSM 28 BF", ...patch }), ref);

/** Every cell value of a workbook buffer, as text. */
async function textOf(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => {
    const v = cell.value;
    out.push(typeof v === "object" && v !== null ? (v.richText ? v.richText.map((t) => t.text).join("") : String(v.result ?? v.formula ?? "")) : String(v ?? ""));
    if (cell.note) out.push(typeof cell.note === "string" ? cell.note : JSON.stringify(cell.note));
  })));
  return { sheets: wb.worksheets.map((w) => w.name), text: out.join("\n") };
}

// ── Pasting a list of sizes ─────────────────────────────────────────────────

test("an RFQ list in inches becomes exact millimetres, with the customer's names kept", () => {
  const { rows, skipped } = parseSizes("Venus 10 x 5 x 13\nEarth\t10\t7\t12\nMercury: 8x4x10", { unit: "in", order: "WGH" });
  assert.equal(skipped.length, 0);
  assert.deepEqual(rows.map((r) => [r.ref, r.W, r.G, r.H]), [["Venus", 254, 127, 330.2], ["Earth", 254, 177.8, 304.8], ["Mercury", 203.2, 101.6, 254]]);
});

test("GSM, quantity and bag type are read off the line; sizes are never snapped", () => {
  const { rows } = parseSizes("SOS #6 152 x 105 x 318 60gsm 25,000\nTH 280*150*280 gsm 100 qty 15000\nflat handle 9.5 × 5 × 12\n12x7x17 V-bottom", { unit: "mm" });
  assert.deepEqual(rows.map((r) => [r.type, r.W, r.G, r.H, r.gsm, r.qty]), [
    ["sos", 152, 105, 318, 60, 25000],
    ["twisted", 280, 150, 280, 100, 15000],
    ["flat", 9.5, 5, 12, undefined, undefined],
    ["vbottom", 12, 7, 17, undefined, undefined],
  ]);
  assert.equal(rows[0].ref, "#6", "a line number is a label, not a dimension");
  // a sheet pasted as columns, with the customer's numbering and a GSM column
  const cols = parseSizes("#3\t4.75\t2.95\t8.5\t50gsm\nNo. 12\t7\t4.5\t13.75\t60 gsm\t10000", { unit: "in" }).rows;
  assert.deepEqual(cols.map((r) => [r.ref, r.W, r.G, r.H, r.gsm, r.qty]), [["#3", 120.7, 74.9, 215.9, 50, undefined], ["No. 12", 177.8, 114.3, 349.3, 60, 10000]]);
});

test("the order the customer wrote the size in is honoured", () => {
  const line = "13 x 11 x 6";
  assert.deepEqual(parseSizes(line, { order: "WGH" }).rows.map((r) => [r.W, r.G, r.H]), [[13, 11, 6]]);
  assert.deepEqual(parseSizes(line, { order: "WHG" }).rows.map((r) => [r.W, r.G, r.H]), [[13, 6, 11]]);
  assert.deepEqual(parseSizes(line, { order: "HWG" }).rows.map((r) => [r.W, r.G, r.H]), [[11, 6, 13]]);
});

test("lines that are not a size are reported, not guessed", () => {
  const { rows, skipped } = parseSizes("Bag sizes:\n10 x 5\n\n10 x 5 x 13", { unit: "in" });
  assert.equal(rows.length, 1);
  assert.deepEqual(skipped.map((s) => s.line), [1, 2]);
});

// ── What the customer sees ──────────────────────────────────────────────────

test("customer wording: Aeros names, recycled kraft, colour count, no route or mill", () => {
  const machine = bagLine({ slab: "p100", colours: "3" });
  const c = customerLine(machine.spec, machine.result, "Their Bag A");
  assert.equal(c.item, "Twisted handle paper bag");
  assert.match(c.detail, /^Machine-made · twisted paper rope handle pasted inside/);
  assert.equal(c.size, "280 × 150 × 280 mm (W × G × H)");
  assert.equal(c.material, "Recycled Brown Kraft, 90 GSM");
  assert.equal(c.printing, "3 colours, full coverage");
  assert.equal(c.rate, machine.result.sellRounded);
  assert.equal(c.cartons, 60);
  assert.deepEqual(c.oneTime.map((o) => [o.label, o.value]), [["Setup charge (one-time, extra)", 3000], ["Printing plates (3 colours) (one-time, extra)", 15000]]);

  const white = bagLine({ colour: "white", paperType: "Bleach Kraft White" });
  assert.equal(customerLine(white.spec, white.result).material, "Recycled White Kraft, 90 GSM");
  const ogr = bagLine({ type: "vbottom", G: "0", gsm: "40", paperType: "OGR", paperRate: "125", qty: "50000" });
  assert.equal(customerLine(ogr.spec, ogr.result).material, "Grease-resistant paper, 40 GSM");
  const hand = bagLine({ qty: "5000" });
  assert.match(customerLine(hand.spec, hand.result).detail, /^Hand-made/);
});

test("an export bag is quoted at FOB; a board with a vendor's name shows its generic grade", () => {
  const fob = bagLine({ destination: "usa", fob: true, supplier: "Om Shivaay" });
  const c = customerLine(fob.spec, fob.result);
  assert.equal(c.basis, "FOB");
  assert.ok(Math.abs(c.rate - fob.result.export.fob) < 0.005);
  const box = priced(boxSpec({ ...BOX_INITIAL, name: "Double cup holder", ups: "6", boardKey: "allyking", gsm: "290" }));
  assert.equal(customerLine(box.spec, box.result).material, "FBB, 290 GSM");
});

test("the customer's Excel carries no cost, margin, mill, vendor or rate-book detail", async () => {
  const lines = [
    bagLine({ slab: "solid", colours: "1" }, "Bag A"),
    bagLine({ qty: "5000" }, "Bag B (small run)"),
    priced(cupSpec({ ...CUP_INITIAL, wall: "DW", size: "12oz", gsm: "280", printMode: "flexo", colours: "2" }), "Hot cup 12oz"),
    priced(boxSpec({ ...BOX_INITIAL, name: "Double cup holder", ups: "6", boardKey: "allyking", gsm: "290", printMode: "card", printer: "lucky", colours: "1" }), ""),
  ];
  const { sheets, text } = await textOf(await customerWorkbook({ customer: "Test Co", brand: "Test Brand", quoteRef: "CALC-20261123-TEST-CO-120000", date: "23-11-2026" }, lines));
  assert.deepEqual(sheets, ["Quotation"]);

  // what must be there
  for (const must of ["Aeros", "Quotation for Test Brand", "CALC-20261123-TEST-CO-120000", "Ex-Factory, Mumbai, India", "Twisted handle paper bag", "Recycled Brown Kraft, 90 GSM", "Bag B (small run)", "Double wall paper cup, 12oz", "FBB, 290 GSM", "Setup charge (one-time, extra)", "full container loads", "+91 79770 77571"]) {
    assert.ok(text.includes(must), `customer copy should include "${must}"`);
  }
  // what must never be there
  for (const never of [/jodhani/i, /om shivaay/i, /allyking/i, /blueline/i, /lucky/i, /wikas/i, /tnpl/i, /bhiwandi/i, /margin/i, /markup/i, /\bcost\b/i, /₹\s?56\.5/, /per kg|\/kg/i, /conversion/i, /wastage/i, /forming plate/i, /rate book/i, /assumed/i, /bag\.[a-z]/]) {
    assert.ok(!never.test(text), `customer copy must not contain ${never}`);
  }
  // the unit cost of any line must not appear as a number either
  for (const l of lines) assert.ok(!text.includes(l.result.cost.toFixed(4)), "no cost figure");
});

test("the internal working has the build-up and rates, and is labelled internal", async () => {
  const lines = [bagLine({}, "Bag A"), priced(bagSpec({ ...BAG_INITIAL }), "no paper rate")];
  const { sheets, text } = await textOf(await internalWorkbook({ customer: "Test Co", quoteRef: "", date: "23-11-2026" }, lines));
  assert.deepEqual(sheets, ["Summary", "Build-up", "Rates used"]);
  for (const must of ["INTERNAL WORKING — not for customers", "Draft, not saved", "Conversion", "markup on cost", "bag.glue.rate_per_kg", "paperRate must be a number above zero"]) {
    assert.ok(text.includes(must), `internal working should include "${must}"`);
  }
});

test("terms always carry the full-container line; FOB quotes do not mention GST", () => {
  assert.ok(quoteTerms("EXW").some((t) => /full container loads/.test(t)));
  assert.ok(quoteTerms("EXW")[0].includes("GST is extra"));
  assert.ok(!quoteTerms("FOB")[0].includes("GST"));
});

// ── Recording a multi-line quote ────────────────────────────────────────────

test("every line of a quote shares one reference and carries its own line number and customer ref", () => {
  const now = new Date("2026-11-23T06:00:00Z");
  const quoteRef = newQuoteRef("Praful", now);
  const specs = [bagSpec({ ...BAG_INITIAL, paperRate: "56.5" }), bagSpec({ ...BAG_INITIAL, paperRate: "56.5", W: "254", G: "127", H: "330" })];
  const recs = specs.map((spec, i) => buildRecords({ spec, result: price(spec), customer: "Praful", brand: "", notes: "", by: "t", engineVersion: "t", now, quoteRef, lineNo: i + 1, ref: i ? "Venus" : "" }));
  assert.deepEqual(recs.map((r) => r.quoteRef), [quoteRef, quoteRef]);
  assert.equal(quoteRef, "CALC-20261123-PRAFUL-113000");
  assert.deepEqual(recs.map((r) => r.line.line_no), ["1", "2"]);
  assert.equal(recs[1].quote.payload.customer_ref, "Venus");
  assert.match(recs[1].line.notes, /Customer ref: Venus\./);
  assert.notEqual(recs[0].key, recs[1].key, "different sizes are different lines");
  // the same item at the same quantity twice is one key: the save refuses it
  const twin = buildRecords({ spec: specs[0], result: price(specs[0]), customer: "Praful", by: "t", engineVersion: "t", now, quoteRef, lineNo: 3 });
  assert.equal(twin.key, recs[0].key);
});

// ── Putting a line back into the form ───────────────────────────────────────

import { bagState, cupState, boxState } from "../../../app/calculator/v2/specs.js";

test("a line survives the trip into the form and back, as it would after a save and reopen", () => {
  const viaJson = (x) => JSON.parse(JSON.stringify(x)); // a saved spec comes back from the database as JSON
  const bags = [
    {},
    { type: "sos", W: "127", G: "79", H: "248", gsm: "60", packing: "carton" },
    { slab: "p100", colours: "3", printRate: "18", handleKind: "white_twisted", handleMaterial: "0.85", handlePasting: "0.2", handleSize: "140", colour: "white", paperType: "Bleach Kraft White" },
    { destination: "usa", fob: true, fx: "95", unitsPerContainer: "393000", supplier: "Om Shivaay", paperId: "abc", paperLabel: "Om Shivaay 100" },
    { type: "vbottom", G: "0", qty: "5000", route: "handmade", extras: [{ label: "Flap", perBag: "0.89" }], deckle: "512", cutoff: "263", cartonReal: true, wastagePct: "3", wastageBase: "paper", conversion: "10", gluePerBag: "0.08", casePack: "1000", marginPct: "12" },
  ];
  for (const patch of bags) {
    const spec = viaJson(bagSpec({ ...BAG_INITIAL, paperRate: "56.5", ...patch }));
    assert.deepEqual(viaJson(bagSpec(bagState(spec))), spec);
  }
  const cups = [
    {},
    { boardBasis: "paper", paper: "TNPL", paperRate: "78" },
    { wall: "DW", size: "12oz", gsm: "280", outerGsm: "290", outerPaper: "same", outerCoated: true, printMode: "flexo", colours: "2", printRate: "7", punch: "", viana: true },
    { wall: "DW", size: "16oz", printMode: "offset", colours: "3", varnish: false, outerSheetW: "750", outerSheetH: "440", outerSheetUps: "9", fob: true, us: false, unitsPerContainer: "308500", chargesPerContainer: "78805", fx: "98", genericDesign: true },
    { wall: "TUB", size: "500_ml", gsm: "300", sheetW: "670", sheetH: "420", sheetUps: "8", glueG: "0.7", casePack: "1000", carton: "97.6", marginPct: "10", cupWeight: "9" },
    { size: "20oz", vendorRate: "3" },
  ];
  for (const patch of cups) {
    const spec = viaJson(cupSpec({ ...CUP_INITIAL, ...patch }));
    assert.deepEqual(viaJson(cupSpec(cupState(spec))), spec);
  }
  const boxes = [
    { ups: "4" },
    { name: "Double cup holder", sheetKey: "custom", sheetW: "635", sheetH: "980", ups: "6", boardKey: "allyking", gsm: "290", construction: "cross_tray", conversionAllIn: "0.8" },
    { name: "Burger box", ups: "6", boardKey: "kraft", pe: true, printMode: "card", printer: "lucky", colours: "2", sides: "2", finishOutside: "matt", finishInside: "gloss", cartonL: "390", cartonB: "215", cartonH: "370", polyCost: "3.98", polyPer: "100", dieCost: "4296", pastingPerPc: "0.14", wastagePct: "6" },
    { boardKey: "custom", boardRate: "68", blankW: "416", blankH: "308", printMode: "ink_flat", cartonPerCase: "32.7", boardGPerPc: "" },
  ];
  for (const patch of boxes) {
    const spec = viaJson(boxSpec({ ...BOX_INITIAL, ...patch }));
    assert.deepEqual(viaJson(boxSpec(boxState(spec))), spec);
  }
});
