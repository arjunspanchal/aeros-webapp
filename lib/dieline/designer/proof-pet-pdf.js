// AEROS CUSTOMER PROOF for a directly-printed PET / PP cup - a port of the house builders
// studio-rules/toolkit/tools/make_customer_proof_pet.py + make_customer_proof_pp.py (A3 landscape, same positions):
//   page 1  ARTWORK PROOF            the printed area laid flat with every element dimensioned, a small cup elevation with
//                                    the cup's sizes, how to read the drawing, colours, check list, sign-off box
//   page 2  WHERE EACH ELEMENT SITS  the cup elevation with every height measured UP FROM THE BASE + the table
//   page 3  THE CUP IN 3D            the shots taken in the tool's 3D viewer (the measured cup), watermarked
//   page 4  HOW IT LOOKS             the cup in the tool's lifestyle scenes (Arjun 21-Nov-2026: "Use the lifestyle scene
//   page 5  IN USE                   shots for those pages") - page 5 only when the cup is dressed (drink / lid / straw)
// House rules: AEROS at the top of every page, never a supplier / SKU / internal name; NO Aeros mark printed on the cup;
// the clear cup is shown light grey (darker when the ink is white), and that is said on the proof.
// Differences from the house file, forced by the tool: the cup elevation is drawn from the tool's own measured profile
// (the same one the 3D cup is turned from) instead of the house U-curve; a print band taller than 78 mm is drawn below
// full size and says so (the house page takes 75 mm at 1 : 1).
// Written in the PDF's own frame (y up, mm), as the house script is.
import { PT_PER_MM } from "../cakebox.js";
import { proofTextWidth as widthMm, proofEsc as esc } from "./proof-pdf.js";

const K = PT_PER_MM, f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(3)).toString());
const W = 420, H = 297, L = 18, R = 402;
const BLACK = "0 0 0", GREYTXT = "0.45 0.45 0.48", RULE = "0.75 0.75 0.78", DIMC = "0.25 0.42 0.78", EDGE = "0.35 0.35 0.38";

/**
 * p = {
 *   g              petGeometry(): td, bd, h, band [top, foot] below the brim, w (rectangle), bandH, profile, mat
 *   vector         artworkToPdf() of the print rectangle (box = the rectangle)
 *   elements       [{ label, short, x, y, w, h }]   placed items, rectangle frame (mm, y down from the top of the band)
 *   body           "c m y k" the clear cup on this proof (light grey; darker for white ink) - CMYK, as the artwork is
 *   brand, brandShort, product, proofLine, proofNo
 *   productRows [[k, v]], howto [[swatch, text]], howtoNote, colourNote, swatches [[rgb, name, sub]], checkList [text]
 *   page2Note, marksNote
 *   imagePages     [{ label, intro, images: [{ body, w, h }], captions: [text] }]
 * }
 */
export function petProofPdf(p) {
  const { g } = p, objs = [];
  const add = (b) => { objs.push(b); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("PAGES");
  const F1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), F2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const xo = [], v = p.vector;
  for (const im of v.images || []) { const sm = im.smask ? add(im.smask) : 0; xo.push(`/${im.name} ${add(im.body.replace("@@SMASK@@", sm ? `/SMask ${sm} 0 R` : ""))} 0 R`); }
  const cs = Object.entries(v.colorSpaces || {}).map(([k, q]) => `/${k} ${q}`).join(" ");
  const art = add(`<< /Type /XObject /Subtype /Form /BBox [${f(-5 * K)} ${f(-5 * K)} ${f((g.w + 5) * K)} ${f((g.bandH + 5) * K)}] /Resources << ${cs ? `/ColorSpace << ${cs} >>` : ""}${xo.length ? ` /XObject << ${xo.join(" ")} >>` : ""} >> /Length ${v.ops.length} >>\nstream\n${v.ops}\nendstream`);
  const imgNo = []; let nImg = 0;
  for (const pg of p.imagePages || []) imgNo.push(pg.images.map((s) => ({ n: nImg++, id: add(s.body.replace("@@SMASK@@", "")) })));
  const res = `<< /Font << /F1 ${F1} 0 R /F2 ${F2} 0 R >> /XObject << /Art ${art} 0 R${imgNo.flat().map((q) => ` /Im${q.n} ${q.id} 0 R`).join("")} >> >>`;
  const kids = [];

  const page = (draw) => {
    const c = [];
    const T = (x, y, s, fs = 7, col = BLACK, bold = false, align = "l") => { const w = align === "l" ? 0 : widthMm(s, fs, bold); c.push(`BT /${bold ? "F2" : "F1"} ${f(fs)} Tf ${col} rg 1 0 0 1 ${f((x - (align === "r" ? w : align === "c" ? w / 2 : 0)) * K)} ${f(y * K)} Tm (${esc(s)}) Tj ET`); };
    const TV = (x, y, s, fs = 7, col = DIMC) => c.push(`BT /F1 ${f(fs)} Tf ${col} rg 0 1 -1 0 ${f(x * K)} ${f((y - widthMm(s, fs) / 2) * K)} Tm (${esc(s)}) Tj ET`); // reading upwards, centred on y
    const line = (x1, y1, x2, y2, col = BLACK, w = 0.5, dash = "") => c.push(`${col} RG ${f(w)} w ${dash || "[] 0 d"} ${f(x1 * K)} ${f(y1 * K)} m ${f(x2 * K)} ${f(y2 * K)} l S [] 0 d`);
    const paint = (col) => (col.trim().split(/\s+/).length === 4 ? `${col} k` : `${col} rg`); // the clear-cup grey is given in CMYK so that it matches the gaps drawn inside the artwork
    const rect = (x, y, w, h, fill, stroke, lw = 0.5) => c.push(`${fill ? `${paint(fill)} ` : ""}${stroke ? `${stroke} RG ${f(lw)} w ` : ""}${f(x * K)} ${f(y * K)} ${f(w * K)} ${f(h * K)} re ${fill && stroke ? "B" : fill ? "f" : "S"}`);
    const lines = (s, width, fs, bold = false) => { const out = []; let ln = ""; for (const w_ of String(s).split(/\s+/)) { const t = (ln + " " + w_).trim(); if (widthMm(t, fs, bold) > width && ln) { out.push(ln); ln = w_; } else ln = t; } return ln ? [...out, ln] : out; };
    const wrap = (x, y, s, width, fs = 7, lh = 3.6, col = GREYTXT) => { for (const ln of lines(s, width, fs)) { T(x, y, ln, fs, col); y -= lh; } return y; };
    const head = (label) => {
      T(L, H - 24, "AEROS", 16, BLACK, true); T(L + 30, H - 24, "aeros-x.com", 7, GREYTXT); T(R, H - 24, label, 9, BLACK, true, "r");
      line(L, H - 27, R, H - 27, RULE, 0.6);
      T(L, H - 33, p.brand, 11, BLACK, true); T(L + widthMm(p.brand, 11, true) + 5, H - 33, p.product, 11, "0.2 0.2 0.22");
      T(L, H - 38, p.proofLine, 7, GREYTXT);
    };
    const foot = () => { line(L, 17, R, 17, RULE, 0.5); T(L, 13, "Artwork proof - nothing goes to print until this page is approved in writing.", 6.5, GREYTXT); T(R, 13, `AEROS  ·  aeros-x.com  ·  ${p.brandShort}  ·  ${p.proofNo}`, 6.5, GREYTXT, false, "r"); };
    const dimh = (x1, x2, y, t, above = true) => { line(x1, y, x2, y, DIMC, 0.4); for (const [xv, s] of [[x1, 1], [x2, -1]]) { line(xv + s * 2, y + 1, xv, y, DIMC, 0.4); line(xv + s * 2, y - 1, xv, y, DIMC, 0.4); } T((x1 + x2) / 2, above ? y + 1.4 : y - 3.4, t, 7, DIMC, false, "c"); };
    const dimv = (y1, y2, x, t, left = true) => { line(x, y1, x, y2, DIMC, 0.4); for (const [yv, s] of [[y1, 1], [y2, -1]]) { line(x - 1, yv + s * 2, x, yv, DIMC, 0.4); line(x + 1, yv + s * 2, x, yv, DIMC, 0.4); } TV(left ? x - 1.5 : x + 3.5, (y1 + y2) / 2, t); };
    const ext = (x1, y1, x2, y2) => line(x1, y1, x2, y2, "0.6 0.65 0.8", 0.25, "[1 1.2] 0 d");
    // the artwork rectangle (y down, origin top-left) set on the page with its bottom-left at (x, y), at scale s
    const artAt = (x, y, s, clip = null) => { c.push("q"); if (clip) c.push(`${f(clip[0] * K)} ${f(clip[1] * K)} ${f(clip[2] * K)} ${f(clip[3] * K)} re W n`); c.push(`${f(s)} 0 0 ${f(-s)} ${f(x * K)} ${f((y + g.bandH * s) * K)} cm`, "/Art Do", "Q"); };
    // cup elevation from the tool's measured profile; returns the y of the rim
    const elevation = (cx, baseY, sc) => {
      const prof = g.profile, pts = [...prof.map(([d, z]) => [cx - (d / 2) * sc, baseY + z * sc]), ...[...prof].reverse().map(([d, z]) => [cx + (d / 2) * sc, baseY + z * sc])];
      c.push(`${paint(p.body)} ${BLACK} RG 0.7 w ${pts.map(([a, b], i) => `${f(a * K)} ${f(b * K)} ${i ? "l" : "m"}`).join(" ")} h B`);
      const yRim = baseY + g.h * sc, rt = (g.td / 2) * sc;
      rect(cx - rt - 0.9, yRim - 0.9, 2 * rt + 1.8, 1.8, p.body, BLACK, 0.7); // the rolled rim
      const rAt = (below) => (g.diaAt(g.h - below) / 2) * sc, yc = yRim - g.band[0] * sc, yb = yRim - g.band[1] * sc;
      line(cx - rAt(g.band[0]) * 1.02, yc, cx + rAt(g.band[0]) * 1.02, yc, GREYTXT, 0.35, "[1.5 1.5] 0 d"); // top of the print band (the crease under the brim)
      line(cx - rAt(g.band[1]) * 1.03, yb, cx + rAt(g.band[1]) * 1.03, yb, GREYTXT, 0.35, "[1.5 1.5] 0 d"); // foot of the print band
      line(cx - rt * 1.25, baseY + (g.h * sc) / 2, cx + rt * 1.25, baseY + (g.h * sc) / 2, GREYTXT, 0.25, "[4 2] 0 d");
      const e = p.elements[0]; // the front face = the first element, set flat on the elevation as the house drawing does
      if (e) { const aw = e.w * sc, ah = e.h * sc, top = yRim - (g.band[0] + e.y - e.h / 2) * sc; artAt(cx - e.x * sc, top - (g.bandH - (e.y - e.h / 2)) * sc, sc, [cx - aw / 2 - 0.2, top - ah - 0.2, aw + 0.4, ah + 0.4]); }
      return yRim;
    };
    draw({ c, T, TV, line, rect, wrap, lines, head, foot, dimh, dimv, ext, artAt, elevation });
    const content = c.join("\n"), cn = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W * K)} ${f(H * K)}] /Contents ${cn} 0 R /Resources ${res} >>`));
  };

  // ============ PAGE 1  ARTWORK PROOF
  page(({ c, T, TV, line, rect, wrap, lines, head, foot, dimh, dimv, ext, artAt, elevation }) => {
    head("ARTWORK PROOF");
    const y = H - 48;
    T(L, y, "THE PRODUCT", 8, BLACK, true);
    p.productRows.forEach(([k, val], i) => { T(L, y - 6 - i * 4.6, k, 7, GREYTXT); T(L + 32, y - 6 - i * 4.6, val, 7); });
    T(240, y, "HOW TO READ THIS DRAWING", 8, BLACK, true);
    let yy = y - 6;
    for (const [sw, t] of p.howto) {
      if (sw === "box") rect(240, yy - 1, 8, 3, p.body, "0.4 0.4 0.42", 0.5); else if (sw === "line") line(240, yy + 0.4, 248, yy + 0.4, BLACK, 0.8);
      T(251, yy, t, 7, GREYTXT); yy -= 4.6;
    }
    wrap(240, yy - 2, p.howtoNote, 150);
    // the flat print area: full size up to 78 mm of height, below that scaled to fit the page (and said so)
    const s = g.bandH > 78 ? 78 / g.bandH : 1, pw = g.w * s, ph = g.bandH * s, ox = 108 + (g.w - pw) / 2, oy = 112;
    rect(ox, oy, pw, ph, p.body, null); artAt(ox, oy, s); rect(ox, oy, pw, ph, null, EDGE, 0.7);
    for (const e of p.elements) {
      const aw = e.w * s, ah = e.h * s, ax = ox + (e.x - e.w / 2) * s, ay = oy + ph - (e.y + e.h / 2) * s;
      line(ax - 5, ay, ax - 5, ay + ah, DIMC, 0.4); for (const [yv, sg] of [[ay, 1], [ay + ah, -1]]) { line(ax - 6, yv + sg * 2, ax - 5, yv, DIMC, 0.4); line(ax - 4, yv + sg * 2, ax - 5, yv, DIMC, 0.4); }
      TV(ax - 6.5, ay + ah / 2, `${e.h.toFixed(1)} mm`);
      const yb = oy - 5; line(ax, yb, ax + aw, yb, DIMC, 0.4); for (const [xv, sg] of [[ax, 1], [ax + aw, -1]]) { line(xv + sg * 2, yb + 1, xv, yb, DIMC, 0.4); line(xv + sg * 2, yb - 1, xv, yb, DIMC, 0.4); }
      T(ax + aw / 2, yb - 3.5, `${e.w.toFixed(1)} mm  -  ${e.short}`, 7, DIMC, false, "c");
    }
    dimv(oy, oy + ph, ox + pw + 5, `printed area height ${g.bandH.toFixed(1)} mm`, false); ext(ox + pw, oy, ox + pw + 7, oy); ext(ox + pw, oy + ph, ox + pw + 7, oy + ph);
    dimh(ox, ox + pw, oy + ph + 4, `printed area width ${g.w.toFixed(1)} mm (wraps the whole way round)`);
    T(ox + pw / 2, oy + ph + 11, s === 1 ? `the printed area laid flat, ${g.w.toFixed(0)} x ${g.bandH.toFixed(0)} mm - shown at full size, print this page at 100 % and it measures the same` : `the printed area laid flat, ${g.w.toFixed(0)} x ${g.bandH.toFixed(0)} mm - shown at ${Math.round(s * 100)} % of full size so that it fits this page`, 6.5, GREYTXT, false, "c");
    // small cup elevation with the cup's own sizes
    const sc = Math.min(0.46, 62 / g.h), cx = 56, by = 116, yRim = elevation(cx, by, sc), rt = (g.td / 2) * sc, rb = (g.bd / 2) * sc, yc = yRim - g.band[0] * sc, yf = yRim - g.band[1] * sc;
    dimh(cx - rt, cx + rt, yRim + 5, `top ${g.td.toFixed(0)} mm`); dimh(cx - rb, cx + rb, by - 4, `base ${g.bd.toFixed(0)} mm`, false);
    ext(cx - rt - 1, yRim, cx - rt - 11, yRim); ext(cx - rb, by, cx - rt - 11, by); dimv(by, yRim, cx - rt - 10, `height ${g.h.toFixed(0)} mm`);
    ext(cx + rt, yc, cx + rt + 11, yc); ext(cx + rt * 0.8, yf, cx + rt + 11, yf); dimv(yf, yc, cx + rt + 10, `printed ${g.bandH.toFixed(0)} mm`, false);
    // colours
    const cy = 88;
    T(L, cy, "COLOURS", 8, BLACK, true);
    yy = wrap(L, cy - 6, p.colourNote, 185);
    for (const [col, name, sub] of p.swatches) { rect(L, yy - 8, 16, 10, col, "0.4 0.4 0.42", 0.5); T(L + 20, yy - 2, name, 7.5, BLACK, true); T(L + 20, yy - 6, sub, 6.8, GREYTXT); yy -= 15; }
    // check list (it gives way to the sign-off box, never the box) + sign-off
    const bx = 215, by2 = 22, bw = 187, bh = 26;
    T(bx, cy, "PLEASE CHECK AND CONFIRM", 8, BLACK, true);
    yy = cy - 6;
    const room = yy - (by2 + bh) - 4; let fs = 4.9, lh = 4.9 * 0.5;
    for (const size of [6.8, 6.4, 6.0, 5.6, 5.2, 4.9]) { const l2 = size * 0.5, total = p.checkList.reduce((a, t) => a + lines(t, 178, size).length * l2 + 1.4, 0); if (total <= room) { fs = size; lh = l2; break; } }
    for (const t of p.checkList) { T(bx, yy, "·", fs, GREYTXT); yy = wrap(bx + 4, yy, t, 178, fs, lh) - 1.4; }
    rect(bx, by2, bw, bh, null, EDGE, 0.7);
    T(bx + 4, by2 + bh - 7, "APPROVED FOR PRINT", 8, BLACK, true);
    ["Name", "Signature", "Date"].forEach((lab, i) => { const ly = by2 + bh - 13 - i * 5.2; T(bx + 4, ly, lab, 7, GREYTXT); line(bx + 22, ly - 1, bx + bw - 4, ly - 1, RULE, 0.4); });
    foot();
  });
  // ============ PAGE 2  WHERE EACH ELEMENT SITS
  page(({ c, T, TV, line, wrap, head, foot, elevation }) => {
    head("WHERE EACH ELEMENT SITS");
    wrap(L, H - 46, p.page2Note, 250, 7.5, 4);
    const sc = Math.min(1.35, 195 / g.h), baseY = 42, cx = 105, rt = (g.td / 2) * sc;
    elevation(cx, baseY, sc);
    const dv = (x, h1, h2, t) => { const y1 = baseY + h1 * sc, y2 = baseY + h2 * sc; line(x, y1, x, y2, DIMC, 0.4); for (const [yv, s] of [[y1, 1], [y2, -1]]) { line(x - 1, yv + s * 1.8, x, yv, DIMC, 0.4); line(x + 1, yv + s * 1.8, x, yv, DIMC, 0.4); } TV(x - 1.5, (y1 + y2) / 2, t); };
    const e = p.elements[0], topOf = (q) => g.h - (g.band[0] + q.y - q.h / 2), footOf = (q) => topOf(q) - q.h;
    if (e) { dv(cx - rt - 8, 0, footOf(e), `${footOf(e).toFixed(1)} to foot of artwork`); dv(cx - rt - 20, 0, topOf(e), `${topOf(e).toFixed(1)} to top of artwork`); }
    dv(cx - rt - 32, 0, g.h, `${g.h.toFixed(1)} overall height`);
    T(cx, baseY - 6, `shown at ${Math.round(sc * 100)} % - every height is measured up from the base of the cup`, 6.5, GREYTXT, false, "c");
    const tx = 250; let ty = H - 70;
    T(tx, ty, "HEIGHTS FROM THE BASE OF THE CUP", 8, BLACK, true); ty -= 7;
    T(tx, ty, "ELEMENT", 7, GREYTXT, true); T(tx + 62, ty, "TOP", 7, GREYTXT, true); T(tx + 84, ty, "FOOT", 7, GREYTXT, true); T(tx + 106, ty, "SIZE (W x H)", 7, GREYTXT, true);
    line(tx, ty - 2, tx + 150, ty - 2, RULE, 0.4); ty -= 7;
    for (const q of p.elements) { T(tx, ty, q.label, 7); T(tx + 62, ty, `${topOf(q).toFixed(1)} mm`, 7); T(tx + 84, ty, `${footOf(q).toFixed(1)} mm`, 7); T(tx + 106, ty, `${q.w.toFixed(1)} x ${q.h.toFixed(1)} mm`, 7, GREYTXT); ty -= 5; }
    T(tx, ty, "Printed band (clear cup, printable)", 7); T(tx + 62, ty, `${(g.h - g.band[0]).toFixed(1)} mm`, 7); T(tx + 84, ty, `${(g.h - g.band[1]).toFixed(1)} mm`, 7);
    ty -= 9;
    wrap(tx, ty, p.marksNote, 150, 6.8, 3.6);
    foot();
  });
  // ============ image pages: THE CUP IN 3D, HOW IT LOOKS, IN USE
  (p.imagePages || []).forEach((pg, k) => page(({ c, T, wrap, head, foot }) => {
    head(pg.label);
    wrap(L, H - 46, pg.intro, 360, 7.5, 4);
    const n = pg.images.length, top = H - 54, bot = 26, gap = 6, cw = (R - L - gap * (n - 1)) / n, ch = top - bot - 8;
    pg.images.forEach((im, i) => {
      const s = Math.min(cw / im.w, ch / im.h), w_ = im.w * s, h_ = im.h * s, x = L + i * (cw + gap) + (cw - w_) / 2, y = bot + 8 + (ch - h_) / 2;
      c.push("q", `${f(w_ * K)} 0 0 ${f(h_ * K)} ${f(x * K)} ${f(y * K)} cm`, `/Im${imgNo[k][i].n} Do`, "Q");
      T(L + i * (cw + gap) + cw / 2, y - 4.5, pg.captions[i] || "", 7, GREYTXT, false, "c");
    });
    foot();
  }));

  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
