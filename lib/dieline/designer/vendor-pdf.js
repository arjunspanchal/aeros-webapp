// VENDOR FILE - the sheet the printer works from. One page: the die with the artwork in its true inks, every die
// dimension (mm with inches), every piece of artwork numbered and dimensioned on the drawing (size + where it sits), and
// a title block with the job, the material, the print process and one swatch per plate with its Pantone name.
// Text is sized to the page, so it reads the same on a 240 mm cup fan and an 800 mm cake box. The plates themselves
// are made from the "artwork, no outlines" file, not from this one.
import { PT_PER_MM, PT_PER_IN } from "../cakebox.js";
import { resolveDims } from "../exports.js";
import { corners, bboxOf } from "./model.js";

const K = PT_PER_MM, f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(3)).toString());
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "");
const mmIn = (mm) => `${(+mm).toFixed(1)} mm (${(mm / 25.4).toFixed(2)}")`;
const tw = (s, size) => String(s).length * size * 0.5; // Helvetica, close enough for laying out

/**
 * What to say about each placed artwork. areas = [{ name, box }] in die mm; cup = cup geometry or null.
 * Returns rows for the table and dimension lines for the drawing (die mm).
 */
export function describeArtwork(items, { areas = [], blank, cup = null, toPolar = null }) {
  const rows = [], lines = [], marks = [];
  let n = 0;
  for (const it of items) {
    if (it.kind === "flood") continue;
    n++;
    const cs = corners(it), bb = bboxOf(cs), kind = it.kind === "svg" ? (it.text ? "text (outlined)" : "vector") : "image";
    const turned = it.curve ? "curved to the cup" : it.rot ? `turned ${(+it.rot).toFixed(1)} deg` : "";
    marks.push({ n, at: [bb[0], bb[1]], box: it.curve ? null : cs });
    if (cup && toPolar) {
      const c = toPolar(cup, [it.x, it.y]);
      rows.push({ n, name: it.name, size: `${mmIn(it.w)} wide x ${mmIn(it.h)} high`, kind, turned,
        pos: `bottom edge ${(c.r - it.h / 2 - cup.rFold).toFixed(1)} mm above the bottom fold; centre ${((c.a - cup.aLeft) * c.r).toFixed(1)} mm from the left cut along the curve (${Math.round(((c.a - cup.aLeft) / cup.wrap) * 100)}% round the cup)` });
      continue;
    }
    const a = areas.find((ar) => it.x >= ar.box[0] && it.x <= ar.box[2] && it.y >= ar.box[1] && it.y <= ar.box[3]) || { name: "blank", box: [0, 0, blank.w, blank.h] };
    const dx = bb[0] - a.box[0], dy = bb[1] - a.box[1], cy = (bb[1] + bb[3]) / 2, cx = (bb[0] + bb[2]) / 2;
    rows.push({ n, name: it.name, size: `${mmIn(it.w)} wide x ${mmIn(it.h)} high`, kind, turned,
      pos: `on ${a.name}: left edge ${dx.toFixed(1)} mm from its left, top edge ${dy.toFixed(1)} mm from its top` });
    lines.push({ x1: bb[0], y1: bb[3] + 4, x2: bb[2], y2: bb[3] + 4, label: `${(bb[2] - bb[0]).toFixed(1)}` });
    lines.push({ x1: bb[2] + 4, y1: bb[1], x2: bb[2] + 4, y2: bb[3], label: `${(bb[3] - bb[1]).toFixed(1)}`, rotated: true });
    if (dx > 6) lines.push({ x1: a.box[0], y1: cy, x2: bb[0], y2: cy, label: `${dx.toFixed(1)}` });
    if (dy > 6) lines.push({ x1: cx, y1: a.box[1], x2: cx, y2: bb[1], label: `${dy.toFixed(1)}`, rotated: true });
  }
  return { rows, lines, marks };
}

/**
 * doc = die; vector = artworkToPdf(...) (or null for a plain item); head = { title, sub }; job = [[label, value]];
 * print = [[label, value]]; art = describeArtwork(...); notes = [string].
 */
export function vendorSheetPdf({ doc, vector = null, head, job = [], print = [], art = { rows: [], lines: [], marks: [] }, notes = [] }) {
  const BW = doc.blank.widthPt, BH = doc.blank.heightPt;
  const fs = Math.min(20, Math.max(7.5, BW / 115)), lh = fs * 1.42, small = fs * 0.86;
  const dims = resolveDims(doc, "both");
  // room round the drawing: the engine's own dimension lines sit outside the blank
  let x0 = -3 * K, y0 = -3 * K, x1 = BW + 3 * K, y1 = BH + 3 * K;
  for (const d of dims) {
    const g = d.rotated ? [fs * 1.6, tw(d.label, small) / 2 + 4] : [tw(d.label, small) / 2 + 4, fs * 1.6];
    x0 = Math.min(x0, Math.min(d.x1, d.x2) - (d.rotated ? g[0] : 0)); x1 = Math.max(x1, Math.max(d.x1, d.x2) + (d.rotated ? g[0] : 0));
    y0 = Math.min(y0, Math.min(d.y1, d.y2) - (d.rotated ? 0 : g[1])); y1 = Math.max(y1, Math.max(d.y1, d.y2) + (d.rotated ? 0 : g[1]));
  }
  const M = fs * 2.2; // page margin
  const headH = fs * 5;
  const colW = Math.max(BW, 520 * (fs / 9)); // title block width
  const PW = Math.max(x1 - x0, colW) + 2 * M;
  // title block rows
  const inks = vector?.inks || [];
  const half = (PW - 2 * M - fs * 2) / 2, wrapAt = (w, size) => Math.max(20, Math.floor(w / (size * 0.5)));
  const wrap = (text, w, size) => { const out = [], max = wrapAt(w, size); let line = ""; for (const word of String(text).split(" ")) { if ((line + " " + word).trim().length > max) { out.push(line.trim()); line = word; } else line += " " + word; } if (line.trim()) out.push(line.trim()); return out; };
  const leftRows = [["JOB", null], ...job, ["PRINT", null], ...print];
  const leftLines = leftRows.reduce((n, [k, v]) => n + (v == null ? 1.4 : Math.max(1, wrap(v, half - fs * 9, fs).length)), 0);
  const artLines = art.rows.reduce((n, r) => n + 1 + wrap(`${r.size}${r.turned ? `, ${r.turned}` : ""}`, half - fs * 2, small).length + wrap(r.pos, half - fs * 2, small).length + 0.5, 0);
  const noteLines = notes.reduce((n, t) => n + wrap(t, half, small).length, 0);
  const rightLines = 1.4 + Math.max(1, inks.length + (vector?.images?.length ? 1 : 0)) * 1.25 + 1.2 + (art.rows.length ? 1.4 + artLines : 0) + (notes.length ? 1.6 + noteLines : 0);
  const blockH = Math.max(leftLines, rightLines) * lh + fs * 2;
  const drawH = y1 - y0, PH = headH + drawH + blockH + 2 * M + fs;
  const ox = M + (PW - 2 * M - (x1 - x0)) / 2 - x0, oyTop = M + headH - y0; // blank origin on the page, measured from the top

  const c = [];
  const X = (x) => f(ox + x), Y = (y) => f(PH - (oyTop + y));
  const text = (x, y, s, size = fs, { bold = false, rgb = "0.13 0.13 0.13", rot = false, halo = false } = {}) => {
    const tm = rot ? `0 1 -1 0 ${f(x)} ${f(y)}` : `1 0 0 1 ${f(x)} ${f(y)}`, fnt = bold ? "/F2" : "/F1";
    if (halo) c.push(`BT ${fnt} ${f(size)} Tf 1 Tr 1 1 1 RG ${f(size * 0.28)} w ${tm} Tm (${esc(s)}) Tj ET`);
    c.push(`BT ${fnt} ${f(size)} Tf 0 Tr ${rgb} rg ${tm} Tm (${esc(s)}) Tj ET`);
  };
  // ---- header
  c.push("0.1 0.1 0.1 rg", `${f(M)} ${f(PH - M - headH + fs * 0.9)} ${f(PW - 2 * M)} ${f(headH - fs * 0.9)} re f`);
  // the sheet says whose job it is: "AEROS" leads the header (Arjun 21-Nov-2026), with the site at the right end of the bar
  const lead = "AEROS  |  VENDOR FILE";
  text(M + fs, PH - M - fs * 1.9, lead, fs * 1.55, { bold: true, rgb: "1 1 1" });
  text(M + fs + tw(lead, fs * 1.55) * 1.2 + fs, PH - M - fs * 1.9, head.title, fs * 1.2, { bold: true, rgb: "1 1 1" });
  text(PW - M - fs - tw("aeros-x.com", small) * 1.15, PH - M - fs * 3.2, "aeros-x.com", small, { rgb: "0.85 0.85 0.85" });
  text(M + fs, PH - M - fs * 3.2, head.sub, small, { rgb: "0.85 0.85 0.85" });
  // ---- artwork (true inks), then the die
  if (vector) c.push("q", `1 0 0 -1 ${f(ox)} ${f(PH - oyTop)} cm`, vector.ops, "Q");
  c.push("1 J 1 j [] 0 d", `${f(Math.max(0.5, fs * 0.07))} w`);
  for (const [layer, rgb] of [["crease", "0 0.6 0"], ["cut", "0.9 0 0"]]) {
    c.push(`${rgb} RG`);
    for (const s of doc.segments) {
      if (s.layer !== layer) continue;
      const p = s.pts.map(([x, y]) => `${X(x)} ${Y(y)}`);
      c.push(s.kind === "l" ? `${p[0]} m ${p[1]} l S` : `${p[0]} m ${p[1]} ${p[2]} ${p[3]} c S`);
    }
  }
  // ---- dimension lines: white under-stroke so they read on any ground
  const BLUE = "0.07 0.33 0.6", MAG = "0.75 0 0.45";
  const dimLine = (ax, ay, bx, by, label, rotated, rgb, size) => {
    const lw = Math.max(0.5, fs * 0.06), ang = Math.atan2(by - ay, bx - ax), ah = fs * 0.55;
    const seg = [`${X(ax)} ${Y(ay)} m ${X(bx)} ${Y(by)} l S`];
    for (const [px, py, dir] of [[ax, ay, 1], [bx, by, -1]]) for (const sp of [0.45, -0.45]) seg.push(`${X(px)} ${Y(py)} m ${X(px + dir * ah * Math.cos(ang + sp))} ${Y(py + dir * ah * Math.sin(ang + sp))} l S`);
    c.push(`1 1 1 RG ${f(lw * 3.2)} w`, ...seg, `${rgb} RG ${f(lw)} w`, ...seg);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (rotated) text(ox + mx - size * 0.35, PH - (oyTop + my) - tw(label, size) / 2, label, size, { rgb, rot: true, halo: true });
    else text(ox + mx - tw(label, size) / 2, PH - (oyTop + my) + size * 0.4, label, size, { rgb, halo: true });
  };
  for (const d of dims) dimLine(d.x1, d.y1, d.x2, d.y2, d.label, d.rotated, BLUE, small);
  // ---- artwork callouts
  for (const m of art.marks) {
    if (m.box) { c.push(`${MAG} RG ${f(Math.max(0.4, fs * 0.05))} w [${f(fs * 0.4)} ${f(fs * 0.3)}] 0 d`, m.box.map((p, k) => `${X(p[0] * K)} ${Y(p[1] * K)} ${k ? "l" : "m"}`).join(" ") + " h S", "[] 0 d"); }
    const r = fs * 0.85, cx = ox + m.at[0] * K - r * 0.2, cy = PH - (oyTop + m.at[1] * K) + r * 0.2, k = 0.5523 * r;
    c.push(`${MAG} rg`, `${f(cx + r)} ${f(cy)} m ${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c ${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c ${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c ${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c f`);
    text(cx - tw(String(m.n), fs) / 2, cy - fs * 0.35, String(m.n), fs, { bold: true, rgb: "1 1 1" });
  }
  for (const l of art.lines) dimLine(l.x1 * K, l.y1 * K, l.x2 * K, l.y2 * K, l.label, !!l.rotated, MAG, small);
  // ---- title block
  const by0 = blockH + M; // top of the block, from the page bottom
  c.push("0.75 0.75 0.75 RG 0.6 w", `${f(M)} ${f(M)} ${f(PW - 2 * M)} ${f(blockH)} re S`, `${f(M + half + fs)} ${f(M)} m ${f(M + half + fs)} ${f(M + blockH)} l S`);
  let y = by0 - fs * 1.7;
  for (const [k, v] of leftRows) {
    if (v == null) { y -= lh * 0.2; text(M + fs, y, k, fs, { bold: true }); y -= lh * 1.2; continue; }
    text(M + fs, y, k, fs, { rgb: "0.42 0.42 0.42" });
    for (const ln of wrap(v, half - fs * 9, fs)) { text(M + fs * 9, y, ln, fs); y -= lh; }
  }
  const rx = M + half + fs * 2;
  y = by0 - fs * 1.7;
  text(rx, y, vector?.spot ? "PLATES (one per colour)" : "COLOURS", fs, { bold: true }); y -= lh * 1.3;
  if (!inks.length && !(vector?.images?.length)) { text(rx, y, "No print: plain item.", fs); y -= lh; }
  for (const ink of inks) {
    c.push(vector.spot ? `/${ink.cs} cs 1 scn` : `${ink.cmyk} k`, `${f(rx)} ${f(y - fs * 0.25)} ${f(fs * 2.2)} ${f(fs * 1.05)} re f`, "0.6 0.6 0.6 RG 0.4 w", `${f(rx)} ${f(y - fs * 0.25)} ${f(fs * 2.2)} ${f(fs * 1.05)} re S`);
    text(rx + fs * 3, y, `${ink.label}`, fs, { bold: true });
    text(rx + fs * 3 + tw(ink.label, fs) * 1.12 + fs, y, `screen colour ${ink.hex}`, small, { rgb: "0.45 0.45 0.45" });
    y -= lh * 1.25;
  }
  if (vector?.images?.length) { text(rx, y, `+ ${vector.images.length} image${vector.images.length > 1 ? "s" : ""} printed in CMYK`, fs); y -= lh * 1.25; }
  text(rx, y, "White in the artwork = no ink (board shows).", small, { rgb: "0.42 0.42 0.42" }); y -= lh * 1.2;
  if (art.rows.length) {
    y -= lh * 0.2; text(rx, y, "ARTWORK (numbered on the drawing, sizes in magenta)", fs, { bold: true }); y -= lh * 1.2;
    for (const r of art.rows) {
      text(rx, y, `${r.n}`, fs, { bold: true, rgb: MAG }); text(rx + fs * 1.6, y, `${r.name} - ${r.kind}`, fs, { bold: true }); y -= lh;
      for (const ln of wrap(`${r.size}${r.turned ? `, ${r.turned}` : ""}`, half - fs * 2, small)) { text(rx + fs * 1.6, y, ln, small); y -= lh; }
      for (const ln of wrap(r.pos, half - fs * 2, small)) { text(rx + fs * 1.6, y, ln, small, { rgb: "0.3 0.3 0.3" }); y -= lh; }
      y -= lh * 0.5;
    }
  }
  if (notes.length) {
    y -= lh * 0.3; text(rx, y, "NOTES", fs, { bold: true }); y -= lh * 1.3;
    for (const t of notes) for (const ln of wrap(t, half, small)) { text(rx, y, ln, small); y -= lh; }
  }
  const content = c.join("\n");

  const objs = [];
  const add = (b) => { objs.push(b); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add("PAGE"); add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"); add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const xo = [];
  for (const im of vector?.images || []) { const sm = im.smask ? add(im.smask) : 0; xo.push(`/${im.name} ${add(im.body.replace("@@SMASK@@", sm ? `/SMask ${sm} 0 R` : ""))} 0 R`); }
  const cs = Object.entries(vector?.colorSpaces || {}).map(([k, v]) => `/${k} ${v}`).join(" ");
  objs[2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(PW)} ${f(PH)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${xo.length ? ` /XObject << ${xo.join(" ")} >>` : ""}${cs ? ` /ColorSpace << ${cs} >>` : ""} >> >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
void PT_PER_IN;
