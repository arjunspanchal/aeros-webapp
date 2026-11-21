// CUSTOMER PROOF - PAPER CUPS. A port of the HOUSE builder, Aeros Artworks/_tools/make_customer_proof.py: same sheet
// (A3 landscape, 420 x 297 mm), same header and footer, same blocks at the same places, same words, same type
// (Helvetica / Helvetica-Bold / Courier), every mark CMYK. Pages, as the house proof:
//   1  ARTWORK PROOF        the wrap flat at FULL SIZE, the product, how to read the drawing, the cup outline with its
//                           sizes, the colours, PLEASE CHECK AND CONFIRM, the APPROVED FOR PRINT box
//   2  ARTWORK ON THE MESH  the same drawing under the guide mesh (curved guides every 10 mm, straight every 15 mm)
//                           + where each element sits
//   3  ON THE CUP           the measured 3D views the user took from the 3D model (house watermark on each)
//   4  HOW YOUR COLOURS ARE PRINTED   the house colour + timeline page (lifted from the house file as a picture)
// Rules it keeps (skill aeros-customer-proof-format): every size printed = the product list row passed in `dims`, never
// a number worked out from the die; no supplier, SKU, die or file-name talk on the proof; the views are the tool's own
// measured model, not an AI render. A tall fan gets a taller sheet (the house builder's page_mm) - nothing is rescaled.
import { PT_PER_MM } from "../cakebox.js";

const K = PT_PER_MM, f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(3)).toString());
const INK = "0 0 0 1", SOFT = "0 0 0 0.55", HAIR = "0 0 0 0.3", FOLD = "0.8 0.5 0 0.05";
// Helvetica and Helvetica-Bold advance widths (per 1000), ASCII 32..126 - for right-aligned text and wrapping
const WH = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const WB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const widthMm = (s, fs, bold) => { let w = 0; for (const ch of String(s)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? (bold ? WB : WH)[c - 32] : c === 183 ? 278 : 556; } return (w / 1000) * fs / K; };
const esc = (s) => String(s).replace(/[^\x20-\x7e]/g, (ch) => ({ "·": "\\267", "×": "\\327", "°": "\\260", "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"' }[ch] ?? "?")).replace(/([()])/g, "\\$1").replace(/\\(?![()0-9])/g, "\\\\");

/**
 * p = {
 *   g            cupGeometry()                    doc      the die document (pt, y down)
 *   vector       artworkToPdf() of one cup (KLD frame)
 *   brand, product, stage ("Proof 1"), date      strings for the header
 *   noun         "cup"
 *   facts        [[label, text]]                  THE PRODUCT rows
 *   dims         { td, bd, h }                    FROM THE PRODUCT LIST
 *   colours      [{ name, code?, cmyk: [c, m, y, k] }], colourNote
 *   checkList    [text]
 *   meshFacts    [[name, text]]
 *   shots        [{ body, w, h, caption }]        watermarked 3D views (imageXObject bodies + pixel sizes)
 *   colourPage   { body, w, h }                   the house colour + timeline page body (picture)
 * }
 */
export function cupProofPdf(p) {
  const { g, doc, vector } = p, noun = p.noun || "cup", W = 420;
  const OY = 80, EXTRA = Math.max(0, Math.ceil(OY + g.h - 214)), H = 297 + EXTRA, OX = (W - g.w) / 2, COL = 252;
  const objs = [];
  const add = (b) => { objs.push(b); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("PAGES");
  const F1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), F2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"), F3 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  // the artwork of one cup as a form (drawn at 1 : 1 on pages 1 and 2)
  const xo = [];
  for (const im of vector.images || []) { const sm = im.smask ? add(im.smask) : 0; xo.push(`/${im.name} ${add(im.body.replace("@@SMASK@@", sm ? `/SMask ${sm} 0 R` : ""))} 0 R`); }
  const cs = Object.entries(vector.colorSpaces || {}).map(([k, v]) => `/${k} ${v}`).join(" ");
  const art = add(`<< /Type /XObject /Subtype /Form /BBox [${f(-20 * K)} ${f(-20 * K)} ${f((g.w + 20) * K)} ${f((g.h + 20) * K)}] /Resources << ${cs ? `/ColorSpace << ${cs} >>` : ""}${xo.length ? ` /XObject << ${xo.join(" ")} >>` : ""} >> /Length ${vector.ops.length} >>\nstream\n${vector.ops}\nendstream`);
  const shotNo = (p.shots || []).map((s) => add(s.body.replace("@@SMASK@@", "")));
  const guideNo = p.colourPage ? add(p.colourPage.body.replace("@@SMASK@@", "")) : 0;
  const res = `<< /Font << /F1 ${F1} 0 R /F2 ${F2} 0 R /F3 ${F3} 0 R >> /XObject << /Art ${art} 0 R${shotNo.map((n, i) => ` /Sh${i} ${n} 0 R`).join("")}${guideNo ? ` /Guide ${guideNo} 0 R` : ""} >> >>`;
  const kids = [];

  const page = (draw) => {
    const c = ["q", `1 0 0 -1 0 ${f(H * K)} cm`];
    const T = (x, y, s, fs = 8, col = INK, font = "F1") => c.push(`BT /${font} ${f(fs)} Tf ${col} k 1 0 0 -1 ${f(x * K)} ${f(y * K)} Tm (${esc(s)}) Tj ET`);
    const TW = (x, y, s, fs = 7, font = "F1", w = 120, col = INK, lead = null) => { // the house word wrap: by character count of an "n"
      lead = lead == null ? (fs * 1.35) / K : lead;
      const n = Math.max(10, Math.floor(w / widthMm("n", fs, font === "F2"))), out = [];
      let line = "";
      for (const word of String(s).split(" ")) { if (line && line.length + 1 + word.length > n) { out.push(line); line = word; } else line = (line + " " + word).trim(); }
      if (line) out.push(line);
      out.forEach((ln, i) => T(x, y + i * lead, ln, fs, col, font));
      return y + out.length * lead;
    };
    const line = (x1, y1, x2, y2, col, w, dash = "") => c.push(`${col} K ${f(w)} w ${dash || "[] 0 d"} ${f(x1 * K)} ${f(y1 * K)} m ${f(x2 * K)} ${f(y2 * K)} l S [] 0 d`);
    const header = (kicker) => {
      T(18, 15.5, "AEROS", 15, INK, "F2"); T(45.5, 15.5, "aeros-x.com", 7, SOFT);
      T(W - 18 - widthMm(kicker, 9, true), 15.5, kicker, 9, INK, "F2");
      line(18, 18.5, W - 18, 18.5, INK, 0.8);
      T(18, 25, p.brand, 12, INK, "F2"); T(18 + widthMm(p.brand, 12, true) + 5, 25, p.product, 10.5);
      T(18, 30.5, `${p.stage}  ·  ${p.date}  ·  for approval`, 8, SOFT);
    };
    const footer = (note) => { const y = H - 12; line(18, y, W - 18, y, HAIR, 0.5); T(18, y + 4.5, note, 7, SOFT); const rt = `AEROS  ·  aeros-x.com  ·  ${p.brandPlain || p.brand}  ·  ${p.stage}`; T(W - 18 - widthMm(rt, 7), y + 4.5, rt, 7, SOFT); };
    const artwork = () => c.push("q", `1 0 0 1 ${f(OX * K)} ${f(OY * K)} cm`, "/Art Do", "Q");
    const dieLines = (layer, col, w, dash) => { c.push("q", `1 0 0 1 ${f(OX * K)} ${f(OY * K)} cm`, `${col} K ${f(w)} w ${dash || "[] 0 d"}`); for (const s of doc.segments) if (s.layer === layer) c.push(s.kind === "l" ? `${f(s.pts[0][0])} ${f(s.pts[0][1])} m ${f(s.pts[1][0])} ${f(s.pts[1][1])} l S` : `${f(s.pts[0][0])} ${f(s.pts[0][1])} m ${f(s.pts[1][0])} ${f(s.pts[1][1])} ${f(s.pts[2][0])} ${f(s.pts[2][1])} ${f(s.pts[3][0])} ${f(s.pts[3][1])} c S`); c.push("Q"); };
    const keyline = () => { dieLines("cut", INK, 0.5); dieLines("crease", FOLD, 0.45, "[6 2 1 2] 0 d"); };
    draw({ c, T, TW, line, header, footer, artwork, keyline });
    c.push("Q");
    const content = c.join("\n"), cn = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W * K)} ${f(H * K)}] /Contents ${cn} 0 R /Resources ${res} >>`));
  };

  // ============================================================ PAGE 1
  page(({ c, T, TW, line, header, footer, artwork, keyline }) => {
    header("ARTWORK PROOF"); artwork(); keyline();
    let y = 42; T(18, y, "THE PRODUCT", 8, INK, "F2"); y += 5.5;
    for (const [k, v] of p.facts) { T(18, y, k, 7, SOFT); y = TW(48, y, v, 7, "F1", 190) + 1.1; }
    let y2 = 42; T(COL, y2, "HOW TO READ THIS DRAWING", 8, INK, "F2"); y2 += 5.5;
    for (const [col, dash, txt] of [[INK, "", "cut line - the shape the wrap is cut to"], [FOLD, "[6 2 1 2] 0 d", `fold lines - ${g.wall === "double" ? `the strip below the bottom one turns inside the ${noun} and is never seen` : `everything below the bottom one turns under the ${noun} and is never seen; the top one rolls into the rim`}`]]) {
      line(COL, y2 - 1.2, COL + 9, y2 - 1.2, col, 0.9, dash);
      y2 = TW(COL + 12, y2, txt, 7, "F1", W - COL - 30) + 1.4;
    }
    TW(COL, y2 + 2, `This is the wrap laid flat before it is formed round the ${noun}. Shown at full size - print this page at 100 % and it measures the same as the finished job.`, 7, "F1", W - COL - 30);
    // the cup outline with the product list's sizes
    const sc = p.dims.h > 120 ? 0.45 : 0.58, sx = 48, sy = 200 + EXTRA, SP = (x, z) => `${f((sx + x * sc) * K)} ${f((sy - z * sc) * K)}`;
    c.push(`${SOFT} K 0.6 w ${SP(-p.dims.bd / 2, 0)} m ${SP(-p.dims.td / 2, p.dims.h)} l ${SP(p.dims.td / 2, p.dims.h)} l ${SP(p.dims.bd / 2, 0)} l ${SP(-p.dims.bd / 2, 0)} l S`);
    T(sx - 26, sy + 6, `top ${p.dims.td} mm  ·  base ${p.dims.bd} mm  ·  height ${p.dims.h} mm`, 6.4, SOFT);
    // colours
    let y3 = 222 + EXTRA; T(18, y3, "COLOURS", 8, INK, "F2");
    y3 = TW(18, y3 + 4.6, p.colourNote, 6.8, "F1", 222, SOFT) + 1.5;
    p.colours.forEach((sw, i) => {
      const x = 18 + (i % 3) * 78, yy = y3 + Math.floor(i / 3) * 20;
      c.push(`${HAIR} K ${sw.cmyk.map(f).join(" ")} k 0.3 w ${f(x * K)} ${f(yy * K)} ${f(13 * K)} ${f(9 * K)} re B`);
      T(x + 16, yy + 3.4, sw.name, 7, INK, "F2");
      T(x + 16, yy + 7.6, sw.code ? `${sw.code}  -  Pantone spot colour` : `CMYK  C${Math.round(sw.cmyk[0] * 100)} M${Math.round(sw.cmyk[1] * 100)} Y${Math.round(sw.cmyk[2] * 100)} K${Math.round(sw.cmyk[3] * 100)}`, 6.4, SOFT, "F3");
    });
    // please check + sign-off
    const xs = COL, cw = W - COL - 34, xe = W - 18; let y4 = 222 + EXTRA;
    T(xs, y4, "PLEASE CHECK AND CONFIRM", 8, INK, "F2"); y4 += 5.2;
    for (const ln of p.checkList) { T(xs, y4, "·", 8, SOFT); y4 = TW(xs + 4, y4, ln, 7, "F1", cw) + 1; }
    y4 = Math.min(y4 + 3, H - 16 - 26);
    c.push(`${HAIR} K 0.6 w ${f(xs * K)} ${f(y4 * K)} ${f((xe - xs) * K)} ${f(26 * K)} re S`);
    T(xs + 4, y4 + 6, "APPROVED FOR PRINT", 7.5, INK, "F2");
    ["Name", "Signature", "Date"].forEach((lbl, i) => { const ly = y4 + 12.5 + i * 5.2; T(xs + 4, ly, lbl, 6.6, SOFT); line(xs + 24, ly + 0.8, xe - 4, ly + 0.8, HAIR, 0.4); });
    footer("Artwork proof - nothing goes to print until this page is approved in writing.");
  });

  // ============================================================ PAGE 2 - the curve mesh
  page(({ c, T, TW, line, header, footer, artwork, keyline }) => {
    header("ARTWORK ON THE MESH"); artwork();
    const ARC = 10, RAD = 15, rmid = (g.rTop + g.rFold) / 2, pol = (r, a) => `${f((OX + g.cx + r * Math.sin(a)) * K)} ${f((OY + g.cy - r * Math.cos(a)) * K)}`;
    const mesh = (col, w) => { // each guide twice: a soft dark line, then a white one on top - reads over every ink
      c.push(`${col} K ${f(w)} w [1.6 1.6] 0 d`);
      for (let r = g.rBot; r <= g.rTop + 0.01; r += ARC) { const pts = []; for (let i = 0; i <= 120; i++) pts.push(pol(r, g.aLeft + ((g.aRight - g.aLeft) * i) / 120)); c.push(pts.map((q, i) => `${q} ${i ? "l" : "m"}`).join(" ") + " S"); }
      for (let k = -20; k <= 20; k++) { const a = (k * RAD) / rmid; if (a > g.aLeft - 0.02 && a < g.aRight + 0.02) c.push(`${pol(g.rBot, a)} m ${pol(g.rTop, a)} l S`); }
      c.push("[] 0 d");
    };
    mesh("0 0 0 0.75", 0.75); mesh("0 0 0 0", 0.32); keyline();
    let y5 = TW(18, 39, `The same drawing with a guide mesh laid over it. A ${noun} wall is a cone, so on the flat wrap a line that will read LEVEL on the finished ${noun} is a curve, and a line that will read UPRIGHT is one that points at the centre of the fan. The mesh draws both: curved guides every ${ARC} mm up from the bottom, and straight guides every ${RAD} mm across. Every baseline in this artwork follows a curve and every upright edge follows a radial, which is why it reads straight once the ${noun} is formed.`, 7.5, "F1", W - 180) + 2;
    T(18, y5 + 2, `The mesh is a guide only. It is not printed on the ${noun}.`, 7.5, INK, "F2");
    let yl = 222 + EXTRA; T(18, yl, "THE MESH", 8, INK, "F2"); yl += 5.6;
    for (const [name, txt] of [["curved guide", `level on the finished ${noun} - drawn every ${ARC} mm up from the bottom`], ["straight guide", `upright on the finished ${noun} - drawn every ${RAD} mm across`]]) {
      line(18, yl - 1.2, 30, yl - 1.2, "0 0 0 0.75", 0.75, "[1.6 1.6] 0 d"); line(18, yl - 1.2, 30, yl - 1.2, "0 0 0 0", 0.32, "[1.6 1.6] 0 d");
      T(33, yl, name, 7, INK, "F2"); yl = TW(33, yl + 3.6, txt, 6.8, "F1", 170) + 2.2;
    }
    if (p.meshFacts?.length) {
      let yf = 222 + EXTRA; T(COL, yf, "WHERE EACH ELEMENT SITS", 8, INK, "F2"); yf += 5.4;
      for (const [name, txt] of p.meshFacts.slice(0, 6)) { T(COL, yf, name, 7, INK, "F2"); yf = TW(COL, yf + 3.4, txt, 6.8, "F1", W - COL - 30) + 1.5; }
      TW(COL, yf + 2.6, "Measured on this drawing, from the top cut and the bottom fold line.", 6.4, "F1", 150, SOFT);
    }
    footer("Guide mesh - shown so placement can be checked. Never printed.");
  });

  // ============================================================ PAGE 3 - on the cup (the measured 3D views)
  if (p.shots?.length) page(({ c, T, TW, header, footer }) => {
    header(`ON THE ${noun.toUpperCase()}`);
    TW(18, 39, `The artwork wrapped onto the true shape of the ${noun}, built from the same measurements as the drawing on pages 1 and 2 - so what you see here is where every element really sits. Check the size and position of each one against the flat drawing. Judge colour from page 1, not from these views - they are lit by a 3D model, not printed.`, 7.5, "F1", W - 150);
    const n = p.shots.length, cols = n <= 3 ? n : 2, gap = 9, top = 52, availH = H - 12 - top - 10;
    const rows = Math.ceil(n / cols), ar = p.shots[0].h / p.shots[0].w;
    let w = Math.min((W - 36 - gap * (cols - 1)) / cols, (availH - (rows - 1) * (gap + 5) - 6) / rows / ar);
    const x0 = 18 + (W - 36 - (cols * w + (cols - 1) * gap)) / 2;
    p.shots.forEach((s, i) => {
      const x = x0 + (i % cols) * (w + gap), y = top + Math.floor(i / cols) * (w * ar + gap + 5), hh = (w * s.h) / s.w;
      c.push("q", `${f(w * K)} 0 0 ${f(-hh * K)} ${f(x * K)} ${f((y + hh) * K)} cm`, `/Sh${i} Do`, "Q");
      T(x, y + hh + 4.2, s.caption, 7, SOFT);
    });
    footer("Reference views - for checking placement and size.");
  });

  // ============================================================ LAST PAGE - how your colours are printed (the house page)
  if (guideNo) page(({ c, T, TW, line, footer }) => {
    const kicker = "HOW YOUR COLOURS ARE PRINTED";
    T(18, 15.5, "AEROS", 15, INK, "F2"); T(45.5, 15.5, "aeros-x.com", 7, SOFT); T(W - 18 - widthMm(kicker, 9, true), 15.5, kicker, 9, INK, "F2");
    line(18, 18.5, W - 18, 18.5, INK, 0.8);
    T(18, 25, p.brand, 12, INK, "F2"); T(18 + widthMm(p.brand, 12, true) + 5, 25, p.product, 10.5);
    T(18, 30.5, `${p.stage}  ·  please read before you approve`, 8, SOFT);
    const hh = (W * p.colourPage.h) / p.colourPage.w;
    c.push("q", `${f(W * K)} 0 0 ${f(-hh * K)} 0 ${f((33 + hh) * K)} cm`, "/Guide Do", "Q");
    footer("Colours, proofing, approvals and order timelines - how they work at Aeros.");
  });

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
