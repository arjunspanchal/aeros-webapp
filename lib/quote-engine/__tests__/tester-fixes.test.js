// Regression tests for what the ten user testers found (25-Nov-2026).

import test from "node:test";
import assert from "node:assert/strict";
import { price } from "../index.js";
import { parseSizes } from "../../../app/calculator/v2/parseSizes.js";
import { bagSpec, boxSpec, BAG_INITIAL, BOX_INITIAL, num } from "../../../app/calculator/v2/specs.js";
import { customerLine, quoteTerms } from "../../calc-v2/present.js";

const codes = (r) => (r.warnings ?? []).map((w) => w.code);
const bag = (patch) => price(bagSpec({ ...BAG_INITIAL, paperRate: "56.5", ...patch }));

test("a case pack beside a size is not the order quantity", () => {
  const { rows } = parseSizes("#4 5 x 3.13 x 9.75\t40#\t500\nMercury 8x4x10 500\n1/6 BBL 12 x 7 x 17 250/case\n10x5x13 25k pack of 250\nEarth 10 x 7 x 12 100gsm 25000\nTH 10x7x12 qty 2000", { unit: "in" });
  assert.deepEqual(rows.map((r) => [r.ref, r.qty ?? null, r.casePack ?? null]), [["#4", null, 500], ["Mercury", null, 500], ["1/6 BBL", null, 250], ["", 25000, 250], ["Earth", 25000, null], ["", 2000, null]]);
});

test("US basis weight in lb becomes GSM, and inch fractions are read", () => {
  const { rows } = parseSizes("#4 5 x 3.13 x 9.75 40#\n5 1/4 x 3 x 9 60 lb\n7-1/2 x 4 x 12", { unit: "in" });
  assert.deepEqual(rows.map((r) => [r.W, r.gsm ?? null, r.lb ?? null]), [[127, 65, 40], [133.4, 98, 60], [190.5, null, null]]);
});

test("a size typed in the wrong unit is refused, not priced", () => {
  for (const r of [bag({ unit: "in", W: "280", G: "150", H: "280" }), bag({ unit: "mm", W: "10", G: "5", H: "13" })]) {
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /Check the unit/);
  }
  const box = price(boxSpec({ ...BOX_INITIAL, blankW: "4", blankH: "4" }));
  assert.match(box.errors[0], /Blank sizes are in mm/);
});

test("machine-route settings on a hand-made bag are called out, not silently dropped", () => {
  const r = bag({ qty: "2000", conversion: "10", wastagePct: "3", handlePasting: "0.2" });
  assert.equal(r.route, "handmade");
  assert.match(r.warnings.find((w) => w.code === "handmade_ignores").message, /conversion, wastage, handle pasting/);
  assert.ok(!codes(bag({ qty: "2000" })).includes("handmade_ignores"));
});

test("a wide handle bag on light paper gets a caution", () => {
  assert.ok(codes(bag({ unit: "in", W: "13", G: "7", H: "13", gsm: "90" })).includes("gsm_light_for_wide"));
  assert.ok(!codes(bag({ unit: "in", W: "13", G: "7", H: "13", gsm: "120", paperRate: "55" })).includes("gsm_light_for_wide"));
});

test("an export line carries its price per case in rupees and dollars; a mixed quote says which lines are FOB", () => {
  const spec = bagSpec({ ...BAG_INITIAL, paperRate: "52.5", destination: "usa", fob: true, fx: "95", supplier: "Om Shivaay" });
  const r = price(spec);
  const c = customerLine(spec, r);
  assert.equal(c.perCase, Math.round(c.rate * 250 * 100) / 100);
  assert.equal(c.usdPerCase, Math.round((c.rate * 250) / 95 * 100) / 100);
  assert.match(quoteTerms("MIXED")[0], /Lines marked FOB are FOB Nhava Sheva/);
});

test("half-entered box packing is refused; a job's own print and punch figures are used", () => {
  const base = { ...BOX_INITIAL, ups: "4" };
  assert.match(price(boxSpec({ ...base, cartonL: "390", cartonB: "215" })).errors[0], /length, a breadth and a height/);
  assert.match(price(boxSpec({ ...base, polyCost: "3.98" })).errors[0], /how many pieces one poly covers/);
  const line = (r, k) => r.lines.find((l) => l.key === k).value;
  const r = price(boxSpec({ ...base, printMode: "card", colours: "4", printPer1000: "2800", punchPer1000: "500" }));
  assert.equal(line(r, "print"), 2800 / 1000 / 4);
  assert.equal(line(r, "punch"), 500 / 1000 / 4);
  assert.match(price(boxSpec({ ...base, sheetKey: "custom", sheetW: "635", sheetH: "980", ups: "6" })).warnings[0].message, /Pick Lucky Offset/);
});

test("the planner gets paper and running length for a machine order", () => {
  const r = bag({ W: "230", G: "100", H: "300", gsm: "80", paperRate: "81", colour: "white", qty: "350000" });
  const o = r.geometry.order;
  // 20.4 g a bag × 3.5 lakh × 1.05 wastage ≈ 7,500 kg
  assert.ok(Math.abs(o.paperKg - 0.680 * 0.375 * 80 / 1000 * 350000 * 1.05) < 1);
  assert.equal(o.cartons, 1400);
  assert.equal(o.handles, 350000);
});

// ── Code-review and security audit, 25-Nov-2026 ─────────────────────────────

import { cupSpec, CUP_INITIAL } from "../../../app/calculator/v2/specs.js";
import { supplierWordsIn } from "../../calc-v2/present.js";
import { buildRecords } from "../../calc-v2/record.js";
import { customerWorkbook } from "../../calc-v2/excel.js";
import ExcelJS from "exceljs";

test("bag type words: no handle and flat bottom are SOS; a bare 'handle' is twisted", () => {
  const { rows } = parseSizes("SOS no handle 10x5x13\nNo handle 10x5x13\nGrocery bag without handle 8x4x10\nFlat bottom SOS 8x4x10\nFlat handle 9x5x12\nHandle bag 10x7x12\nPizza pouch 17x1x20", { unit: "in" });
  assert.deepEqual(rows.map((r) => r.type), ["sos", "sos", "sos", "sos", "flat", "twisted", "vbottom"]);
  assert.deepEqual(rows.map((r) => r.ref), ["", "", "", "", "", "", "Pizza"]);
});

test("quantities in the Indian style, a price column, a unit in the line, the H×W/G shorthand and a line number", () => {
  const { rows } = parseSizes("Earth 10x5x13 5k\nA 10x5x13 1,00,000\nB 10x5x13 1.5 lakh\nVenus 10x5x13 Rs 650 3000\nSmall 10cm x 5cm x 13cm 5000\nBig 280mm x 150mm x 280mm\nC 10\" x 5\" x 13\"\n9x6/5", { unit: "in" });
  rows.push(...parseSizes("Item 3 254 127 330 5000", { unit: "mm" }).rows);
  assert.deepEqual(rows.map((r) => r.qty ?? null), [5000, 100000, 150000, null, 5000, null, null, null, 5000]);
  assert.equal(rows[3].casePack ?? null, null, "3,000 beside a price is neither a quantity nor a case pack");
  assert.deepEqual([rows[3].ref, rows[3].W, rows[3].G, rows[3].H], ["Venus", 254, 127, 330.2], "the price after a size does not eat the size's last number");
  assert.deepEqual([rows[4].W, rows[4].G, rows[4].H, rows[4].unit], [100, 50, 130, "cm"]);
  assert.deepEqual([rows[5].W, rows[5].unit], [280, "mm"]);
  assert.deepEqual([rows[6].W, rows[6].H], [254, 330.2]);
  assert.deepEqual([rows[7].W, rows[7].G, rows[7].H], [152.4, 127, 228.6], "9x6/5 is height 9, width 6, gusset 5");
  assert.deepEqual([rows[8].W, rows[8].G, rows[8].H, rows[8].ref], [254, 127, 330, "Item 3"]);
});

test("a phone number, a date or an order number in a pasted line is never read as a size or a quantity", () => {
  const p = (t) => parseSizes(t, { unit: "in" });
  assert.equal(p("Venus 10x5x13 call 9820012345").rows[0].qty, undefined);
  assert.equal(p("call 9820012345 or 022 2345 6789").rows.length, 0);
  assert.equal(p("25-11-2026 delivery").rows.length, 0);
  assert.deepEqual([p("10,5 x 5 x 13").rows[0].W, p("10 1/2 x 5 x 13").rows[0].W], [266.7, 266.7], "a decimal comma and a fraction");
  const l = p("W: 10 H: 13 G: 5 100gsm 25000").rows[0];
  assert.deepEqual([l.W, l.G, l.H, l.gsm, l.qty], [254, 127, 330.2, 100, 25000], "labelled sizes in any order");
});

test("a negative, fractional or absurd number is refused before it becomes a price", () => {
  const sos = { family: "bag", type: "sos", W: 200, G: 100, H: 300, gsm: 70, paperRate: 50, qty: 20000 };
  assert.match(price({ ...sos, print: { slab: "logo", colours: -3 } }).errors[0], /below zero/);
  assert.match(price({ ...sos, qty: 1.5 }).errors[0], /whole number/);
  assert.match(price({ ...sos, paperRate: 1e9 }).errors[0], /too large/);
  assert.match(price({ ...sos, handle: { material: -1 } }).errors[0], /below zero/);
  const cupFob = price({ family: "cup", wall: "SW", size: "8oz", export: { unitsPerContainer: 1000, chargesPerContainer: -100000, fx: 85 } });
  assert.equal(cupFob.ok, false);
  assert.equal(price({ family: "cup", wall: "SW", size: "8oz", export: { unitsPerContainer: 500000, fx: 0 } }).ok, false);
  // selling below cost is allowed, and said out loud
  assert.ok(price({ family: "cup", wall: "SW", size: "8oz", marginPct: -50 }).warnings.some((w) => w.code === "below_cost"));
  assert.ok(price({ family: "cup", wall: "SW", size: "8oz", marginPct: 99 }).warnings.some((w) => w.code === "margin_high"));
  // typed numbers: "12,000" is twelve thousand, a space or "0x10" is nothing
  assert.deepEqual([num("12,000"), num(" "), num("0x10"), num("abc"), num("2.5")], [12000, undefined, undefined, undefined, 2.5]);
});

test("rules from the pricing audit: cord bags convert at the SOS rate, a vendor bag keeps its gusset, CMYK on a hand-made bag is the walk-in card", () => {
  const cord = price({ family: "bag", type: "twisted", W: 280, G: 150, H: 280, gsm: 100, paperRate: 60, paper: { colour: "white" }, handle: { kind: "cord" }, qty: 20000 });
  assert.match(cord.lines.find((x) => x.key === "conversion").basis, /₹10\/kg/);
  const vendor = price({ family: "bag", type: "twisted", W: 300, G: 180, H: 300, gsm: 100, paperRate: 55, route: "vendor", qty: 20000 });
  assert.ok(!vendor.warnings.some((w) => w.code === "gusset_clamped"), "the 178 limit is our machine's, not the vendor's");
  // Jallo take-out bag 203 × 114 × 254, 4-colour CMYK, 10,000 pcs: print ₹1.60 a bag, not ₹5.80
  const jallo = { family: "bag", type: "twisted", W: 203, G: 114, H: 254, gsm: 130, paperRate: 60, paper: { colour: "white" }, qty: 10000 };
  const printOf = (r) => r.lines.find((x) => x.key === "print").value;
  assert.ok(Math.abs(printOf(price({ ...jallo, print: { slab: "p100", colours: 4, process: true } })) - 1.6) < 1e-9);
  assert.ok(Math.abs(printOf(price({ ...jallo, print: { slab: "p100", colours: 4 } })) - 5.8) < 1e-9);
});

test("a box with no ups entered is nested the production way, and a flat box's packing is sized from its blank", () => {
  // CC sling 230 × 377 on 20 × 30: 4-up with the rows butted (Arjun), packing about ₹0.096
  const r = price({ family: "box", name: "Cup carrier", board: { label: "FBB", gsm: 300, ratePerKg: 75 }, sheet: { w: 508, h: 762 }, blank: { w: 230, h: 377 }, construction: "flat", qty: 10000 });
  assert.equal(r.geometry.ups, 4);
  assert.ok(r.warnings.some((w) => w.code === "ups_estimated" && /butted/.test(w.message)));
  const packing = r.lines.find((x) => x.key === "packing").value;
  assert.ok(Math.abs(packing - 0.0956) < 0.015, `packing ${packing}`);
  assert.ok(r.warnings.some((w) => w.code === "packing_estimated"));
});

test("a supplier's name in free text is caught before it goes to a customer", () => {
  assert.deepEqual(supplierWordsIn("Allyking cup holder for a client", "210 × 100", "printed at Blue Line"), ["allyking", "blueline", "blue line"].filter((w) => ["allyking", "blue line"].includes(w)));
  assert.deepEqual(supplierWordsIn("Double cup holder", "210 × 100 × 50 mm", "Their ref A"), []);
});

test("an object smuggled in as a name or size never becomes an Excel formula", async () => {
  const spec = { ...boxSpec({ ...BOX_INITIAL, ups: "4" }), name: { formula: "HYPERLINK(\"http://x\")" }, size: { formula: "1+1" } };
  const result = price({ ...spec, name: "Box" }); // the engine prices it; the labels are what is under test
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await customerWorkbook({ customer: { formula: "2+2" }, brand: "", quoteRef: "", date: "25-11-2026" }, [{ spec, ref: { formula: "3+3" }, result }]));
  let formulas = 0;
  wb.worksheets[0].eachRow((row) => row.eachCell((cell) => { if (cell.formula && !/^SUM\(K/.test(cell.formula)) formulas += 1; }));
  assert.equal(formulas, 0);
});

test("two real options on one quote get different keys: logo and full patch, machine and hand-made", () => {
  const rec = (patch) => {
    const spec = bagSpec({ ...BAG_INITIAL, paperRate: "56.5", ...patch });
    return buildRecords({ spec, result: price(spec), customer: "X", by: "t", engineVersion: "t" }).key;
  };
  assert.notEqual(rec({ slab: "logo", colours: "1" }), rec({ slab: "solid", colours: "1" }));
  assert.notEqual(rec({ qty: "5000" }), rec({ qty: "5000", route: "inhouse" }));
});

test("the machine comparison for a printed V-bottom is at its own 50,000 MOQ; FOB on a small run is called out", () => {
  const vb = bag({ type: "vbottom", W: "150", G: "50", H: "250", gsm: "50", paperRate: "125", slab: "logo", qty: "5000" });
  assert.equal(vb.machineAtMoq.qty, 50000);
  const small = bag({ type: "sos", W: "254", G: "127", H: "330", gsm: "90", qty: "16000", destination: "usa", fob: true, supplier: "Om Shivaay" });
  assert.ok(codes(small).includes("fob_part_container"));
});

test("an offset cup job with no quantity says which quantity it was costed at", () => {
  const r = price(cupSpec({ ...CUP_INITIAL, printMode: "offset", colours: "2", qty: "" }));
  assert.equal(r.qty, 25000);
});
