// The two Excel files a quote produces, in the house quote look (monochrome,
// light-grey table header, no vertical rules):
//
//   customer copy    — what goes to the customer. Built ONLY from present.js,
//                      so it cannot carry cost, margin, a mill or a vendor.
//   internal working — the full build-up, rates used and warnings. Never sent.
//
// Server-side only (exceljs is not shipped to the browser).

import ExcelJS from "exceljs";
import { customerLine, quoteTerms, PRICE_BASIS, CONTACT_LINE } from "./present.js";

const INK = "FF2B2B2B";
const MUTED = "FF8A8A8A";
const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
const ALT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F7F7" } };
const RULE = { style: "thin", color: { argb: "FFE5E5E5" } };
const BOX = { style: "thin", color: { argb: "FFD0D0D0" } };
const INR = '"₹"#,##0.00';
const INR0 = '"₹"#,##0';
const NUM = "#,##0";

const font = (o = {}) => ({ name: "Calibri", size: 10, color: { argb: INK }, ...o });

function styleRow(row, { bold = false, fill = null, border = true, height } = {}) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = font({ bold, size: cell.font?.size ?? 10 });
    if (fill) cell.fill = fill;
    if (border) cell.border = { bottom: RULE };
    cell.alignment = { vertical: "middle", wrapText: true, ...(cell.alignment ?? {}) };
  });
  if (height) row.height = height;
}

/**
 * @param {object} meta   { customer, brand, quoteRef, date }
 * @param {Array}  lines  [{ spec, result, ref }] already priced on the server
 * @returns {Promise<Buffer>}
 */
export async function customerWorkbook(meta, lines) {
  const rows = lines.map((l) => customerLine(l.spec, l.result, l.ref)).filter(Boolean);
  const basis = rows.every((r) => r.basis === rows[0]?.basis) ? rows[0]?.basis ?? "EXW" : null;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Aeros";
  wb.created = new Date();
  const ws = wb.addWorksheet("Quotation", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.3 } },
    views: [{ showGridLines: false }],
  });
  ws.columns = [
    { width: 5 }, { width: 18 }, { width: 36 }, { width: 27 }, { width: 30 }, { width: 22 },
    { width: 11 }, { width: 22 }, { width: 13 }, { width: 12 }, { width: 15 },
  ];
  const LAST = "K";

  // Header: wordmark and document label, with a rule under them.
  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = "Aeros";
  ws.getCell("A1").font = font({ size: 24, bold: true });
  ws.mergeCells(`G1:${LAST}1`);
  ws.getCell("G1").value = "Q U O T A T I O N";
  ws.getCell("G1").font = font({ size: 10, color: { argb: MUTED } });
  ws.getCell("G1").alignment = { horizontal: "right", vertical: "bottom" };
  ws.getRow(1).height = 34;
  for (let c = 1; c <= 11; c++) ws.getRow(1).getCell(c).border = { bottom: { style: "thin", color: { argb: "FFC8C8C8" } } };

  const who = meta.brand || meta.customer || "";
  ws.mergeCells(`A3:${LAST}3`);
  ws.getCell("A3").value = who ? `Quotation for ${who}` : "Quotation";
  ws.getCell("A3").font = font({ size: 16 });
  ws.getRow(3).height = 26;

  // Left: who it is for. Right: the quote box.
  const left = [["To", meta.customer || ""], ["Brand", meta.brand || ""]].filter(([, v]) => v);
  left.forEach(([label, value], i) => {
    const r = 5 + i;
    ws.getCell(`A${r}`).value = { richText: [{ text: `${label}: `, font: font({ bold: true }) }, { text: value, font: font() }] };
    ws.mergeCells(`A${r}:F${r}`);
  });
  const box = [
    ["Quotation No.", meta.quoteRef || "Draft, not yet saved"],
    ["Date", meta.date],
    ["Price Basis", basis ? PRICE_BASIS[basis] : "See each line"],
    ["Validity", "30 days from the date above"],
  ];
  box.forEach(([label, value], i) => {
    const r = 5 + i;
    ws.mergeCells(`H${r}:I${r}`);
    ws.mergeCells(`J${r}:${LAST}${r}`);
    const l = ws.getCell(`H${r}`);
    const v = ws.getCell(`J${r}`);
    l.value = label;
    l.font = font({ bold: true, size: 9 });
    l.fill = HEAD_FILL;
    v.value = value;
    v.font = font({ size: 9 });
    v.alignment = { wrapText: true, vertical: "middle" };
    for (const col of ["H", "I", "J", LAST]) ws.getCell(`${col}${r}`).border = { top: BOX, bottom: BOX, left: col === "H" ? BOX : undefined, right: col === LAST ? BOX : undefined };
    ws.getRow(r).height = label === "Price Basis" ? 28 : 16;
  });

  // The priced lines.
  let r = 10;
  const header = ws.getRow(r);
  header.values = ["#", "Your reference", "Aeros item", "Size", "Material", "Printing", "Case pack (pcs)", "Carton, inside", "Quantity (pcs)", "Rate per pc", "Amount"];
  styleRow(header, { bold: true, fill: HEAD_FILL, height: 30 });
  ["G", "I", "J", "K"].forEach((c) => (ws.getCell(`${c}${r}`).alignment = { horizontal: "right", vertical: "middle", wrapText: true }));
  rows.forEach((line, i) => {
    r += 1;
    const row = ws.getRow(r);
    row.values = [
      i + 1, line.ref || "",
      line.detail ? { richText: [{ text: line.item, font: font({ bold: true }) }, { text: `\n${line.detail}`, font: font({ size: 9, color: { argb: MUTED } }) }] } : line.item,
      line.size, line.material, line.printing, line.casePack, line.carton || "To be confirmed",
      line.qty, line.rate, line.amount,
    ];
    styleRow(row, { fill: i % 2 ? ALT_FILL : null, height: line.detail ? 40 : 22 });
    row.getCell(7).numFmt = NUM;
    row.getCell(9).numFmt = NUM;
    row.getCell(10).numFmt = INR;
    row.getCell(11).numFmt = INR0;
    [7, 9, 10, 11].forEach((c) => (row.getCell(c).alignment = { horizontal: "right", vertical: "middle" }));
    // "N pcs (X cartons × pack)" as a note under the quantity when it is known
    if (line.cartons && line.casePack) row.getCell(9).note = `${line.cartons.toLocaleString("en-IN")} cartons × ${line.casePack.toLocaleString("en-IN")}`;
  });
  if (rows.length > 1 && rows.every((x) => x.amount !== null)) {
    r += 1;
    const total = ws.getRow(r);
    total.getCell(9).value = "Total";
    total.getCell(11).value = { formula: `SUM(K11:K${r - 1})`, result: rows.reduce((s, x) => s + x.amount, 0) };
    styleRow(total, { bold: true, border: false });
    total.getCell(11).numFmt = INR0;
    total.getCell(9).alignment = { horizontal: "right" };
    total.getCell(11).alignment = { horizontal: "right" };
  }
  r += 1;
  ws.mergeCells(`A${r}:${LAST}${r}`);
  ws.getCell(`A${r}`).value = `Amounts are ex-GST and exclude the one-time charges below.${basis === "FOB" ? "" : " GST is extra at the applicable rate."}`;
  ws.getCell(`A${r}`).font = font({ size: 9, color: { argb: MUTED } });

  // One-time charges: their own bold rows, never inside the rate.
  const charges = rows.flatMap((line, i) => line.oneTime.map((o) => ({ ...o, n: i + 1, item: line.ref || line.item })));
  if (charges.length) {
    r += 2;
    ws.mergeCells(`A${r}:${LAST}${r}`);
    ws.getCell(`A${r}`).value = "One-time charges, billed separately";
    ws.getCell(`A${r}`).font = font({ size: 12 });
    r += 1;
    const h = ws.getRow(r);
    h.values = ["#", "For", "Charge", "", "", "", "", "", "Basis", "", "Amount"];
    ws.mergeCells(`C${r}:H${r}`);
    ws.mergeCells(`I${r}:J${r}`);
    styleRow(h, { bold: true, fill: HEAD_FILL });
    for (const c of charges) {
      r += 1;
      const row = ws.getRow(r);
      row.values = [c.n, c.item, c.label, "", "", "", "", "", c.note, "", c.value === null ? "At actuals" : c.value];
      ws.mergeCells(`C${r}:H${r}`);
      ws.mergeCells(`I${r}:J${r}`);
      styleRow(row, { bold: true });
      row.getCell(11).numFmt = INR0;
      row.getCell(11).alignment = { horizontal: "right" };
    }
  }

  // Terms.
  r += 2;
  ws.mergeCells(`A${r}:${LAST}${r}`);
  ws.getCell(`A${r}`).value = "Terms and conditions";
  ws.getCell(`A${r}`).font = font({ size: 12 });
  quoteTerms(basis ?? "EXW").forEach((t, i) => {
    r += 1;
    ws.mergeCells(`A${r}:${LAST}${r}`);
    ws.getCell(`A${r}`).value = `${i + 1}. ${t}`;
    ws.getCell(`A${r}`).font = font({ size: 9.5 });
    ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };
  });

  r += 2;
  ws.mergeCells(`A${r}:${LAST}${r}`);
  ws.getCell(`A${r}`).value = "For any clarification or further information, please contact our sales team.";
  ws.getCell(`A${r}`).font = font({ size: 9.5 });
  r += 3;
  ws.mergeCells(`A${r}:D${r}`);
  ws.getCell(`A${r}`).value = { richText: [{ text: "Authorized Signatory", font: font({ bold: true }) }, { text: " — Aeros (Boson Machines OPC Pvt Ltd)", font: font() }] };
  ws.getCell(`A${r}`).border = { top: { style: "thin", color: { argb: INK } } };
  r += 2;
  ws.mergeCells(`A${r}:${LAST}${r}`);
  ws.getCell(`A${r}`).value = CONTACT_LINE;
  ws.getCell(`A${r}`).font = font({ size: 8.5, color: { argb: MUTED } });

  ws.headerFooter.oddFooter = `&L&8${CONTACT_LINE}&R&8${meta.quoteRef || "Draft"} · Page &P of &N`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const MODE = { markup: "markup on cost", on_sell: "of selling price" };

/** Everything behind the price. Internal only. */
export async function internalWorkbook(meta, lines) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aeros";
  wb.created = new Date();
  const banner = `INTERNAL WORKING — not for customers. ${meta.customer || "No customer"} · ${meta.quoteRef || "Draft, not saved"} · ${meta.date}`;

  // Summary: one row per line.
  const sum = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 3 }] });
  sum.columns = [{ width: 5 }, { width: 20 }, { width: 46 }, { width: 18 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 18 }, { width: 11 }, { width: 14 }, { width: 10 }, { width: 70 }];
  sum.mergeCells("A1:L1");
  sum.getCell("A1").value = banner;
  sum.getCell("A1").font = font({ bold: true, size: 11 });
  sum.getRow(3).values = ["#", "Customer ref", "Item", "Route", "Qty", "Cost / pc", "Margin %", "Margin basis", "Sell / pc", "Order value", "Basis", "Warnings"];
  styleRow(sum.getRow(3), { bold: true, fill: HEAD_FILL });
  lines.forEach((l, i) => {
    const res = l.result;
    const c = customerLine(l.spec, res, l.ref);
    const row = sum.getRow(4 + i);
    row.values = res.lines
      ? [i + 1, l.ref || "", res.title, res.route, c.qty, res.cost, res.marginPct, MODE[res.marginMode], c.rate, c.amount, c.basis, res.warnings.map((w) => `[${w.level}] ${w.message}`).join("\n")]
      : [i + 1, l.ref || "", res.title ?? "Not priced", "", "", "", "", "", "", "", "", (res.errors ?? []).join("\n")];
    styleRow(row);
    row.getCell(5).numFmt = NUM;
    row.getCell(6).numFmt = '"₹"#,##0.0000';
    row.getCell(9).numFmt = INR;
    row.getCell(10).numFmt = INR0;
  });

  // Build-up: every cost line of every item.
  const bu = wb.addWorksheet("Build-up");
  bu.columns = [{ width: 34 }, { width: 70 }, { width: 13 }, { width: 10 }];
  bu.getCell("A1").value = banner;
  bu.getCell("A1").font = font({ bold: true, size: 11 });
  let r = 3;
  lines.forEach((l, i) => {
    const res = l.result;
    bu.getCell(`A${r}`).value = `${i + 1}. ${res.title ?? "Not priced"}${l.ref ? `  (${l.ref})` : ""}`;
    bu.getCell(`A${r}`).font = font({ bold: true, size: 12 });
    r += 1;
    if (!res.lines) {
      bu.getCell(`A${r}`).value = (res.errors ?? []).join(" ");
      r += 2;
      return;
    }
    bu.getRow(r).values = ["Line", "Basis", "₹ per pc", "% of cost"];
    styleRow(bu.getRow(r), { bold: true, fill: HEAD_FILL });
    for (const line of res.lines) {
      r += 1;
      bu.getRow(r).values = [line.label, line.basis ?? "", line.value, res.cost ? line.value / res.cost : null];
      styleRow(bu.getRow(r));
      bu.getCell(`C${r}`).numFmt = "0.0000";
      bu.getCell(`D${r}`).numFmt = "0%";
    }
    r += 1;
    bu.getRow(r).values = ["Cost", "", res.cost, 1];
    styleRow(bu.getRow(r), { bold: true });
    bu.getCell(`C${r}`).numFmt = "0.0000";
    bu.getCell(`D${r}`).numFmt = "0%";
    r += 1;
    bu.getRow(r).values = [`Sell at ${res.marginPct}% ${MODE[res.marginMode]}`, "", res.sell, ""];
    styleRow(bu.getRow(r), { bold: true });
    bu.getCell(`C${r}`).numFmt = "0.0000";
    if (res.export) {
      r += 1;
      const e = res.export;
      bu.getRow(r).values = l.spec.family === "bag"
        ? ["FOB per pc", `port charges ₹${Math.round(e.chargesPerContainer).toLocaleString("en-IN")} ÷ ${Math.round(e.unitsPerContainer).toLocaleString("en-IN")} pcs, at ₹${e.fx}/USD`, e.fob, ""]
        : ["FOB", `port charges are inside the cost above, at ₹${e.fx}/USD`, res.sell, ""];
      styleRow(bu.getRow(r), { bold: true });
      bu.getCell(`C${r}`).numFmt = "0.0000";
    }
    for (const o of res.oneTime ?? []) {
      r += 1;
      bu.getRow(r).values = [`One-time: ${o.label}`, `${o.note ?? ""}${o.status && o.status !== "confirmed" ? ` [${o.status}]` : ""}`, o.value === null ? "at actuals" : o.value, ""];
      styleRow(bu.getRow(r));
      bu.getCell(`C${r}`).numFmt = NUM;
    }
    if (res.machineAtMoq) {
      r += 1;
      const m = res.machineAtMoq;
      bu.getRow(r).values = ["Machine-made instead", m.possible ? `at ${m.qty.toLocaleString("en-IN")} pcs` : m.reason, m.possible ? m.sell : "not possible", ""];
      styleRow(bu.getRow(r));
    }
    r += 2;
  });

  // Rates used, so the working can be checked and repeated.
  const ru = wb.addWorksheet("Rates used");
  ru.columns = [{ width: 5 }, { width: 38 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 80 }];
  ru.getCell("A1").value = banner;
  ru.getCell("A1").font = font({ bold: true, size: 11 });
  ru.getRow(3).values = ["#", "Rate", "Value", "Unit", "Status", "Source"];
  styleRow(ru.getRow(3), { bold: true, fill: HEAD_FILL });
  r = 3;
  lines.forEach((l, i) => {
    for (const u of l.result.ratesUsed ?? []) {
      r += 1;
      ru.getRow(r).values = [i + 1, u.key, u.value, u.unit ?? "", u.status, u.source ?? ""];
      styleRow(ru.getRow(r), { bold: u.status !== "confirmed" });
    }
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
