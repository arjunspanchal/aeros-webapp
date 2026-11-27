// AEROS CUSTOMER PROOF for a FOLDING BOX - a port of the house food-box proof builder
// (Aeros Artworks / Customer Artwork / melt / 500ml Food Box / _src / make_customer_proof_foodbox.py): same page (A3
// landscape, 420 x 297 mm), same header and footer positions, same right-hand column at x 318, same page order and the same
// wording slots (house rules, cortex 4a: AEROS on every page; no supplier, SKU, die code, file name, layer or plate words):
//   page 1  ARTWORK PROOF           the flat box with the artwork (at 100 % when it fits), THE PRODUCT, COLOURS, HOW TO
//                                   READ THIS DRAWING, PLEASE CHECK AND CONFIRM, the APPROVED FOR PRINT box
//   page 2  ARTWORK ON THE PANELS   the same flat with a 10 mm grid on every panel, the panel names, WHERE EACH ELEMENT
//                                   SITS, and the box drawn to its size
//   page 3  THE BOX IN 3D           the views taken in the tool's own 3D viewer (the measured model), watermarked
//   page 4  HOW IT LOOKS            the measured model set in the tool's scenes, where the house file places its renders
//   page 5  HOW YOUR COLOURS ARE PRINTED   the house colour + timeline page (lifted from the house file as a picture)
// Differences from the house file, all forced by the tool: the die is the tool's own (the house overlays the DIE pdf), the
// element sizes are listed on page 2 instead of being drawn as dimension lines on page 1, page 3 lays out the tool's shots
// where the house places its view sheet, and page 2's size drawing is a plain isometric of the formed box.
// First use: the drawer-box sleeve (27-Nov-2026).
import { PT_PER_MM } from "../cakebox.js";
import { proofTextWidth as widthMm, proofEsc as esc } from "./proof-pdf.js";

const K = PT_PER_MM, f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(3)).toString());
const BLACK = "0 0 0 1", DGREY = "0 0 0 0.7", GREY = "0 0 0 0.35", BLUE = "0.85 0.35 0 0", CUT = "0 0 0 0.9", FOLD = "0 0 0 0.5";

/**
 * p = {
 *   doc, blank: { w, h }            the die (pt, y down) and its size in mm
 *   vector                          artworkToPdf() of the flat box (blank frame, with bleed)
 *   panels: [{ label, box }]        printed panels, box = [x0, y0, x1, y1] mm; noInk: [[x0, y0, x1, y1]] glue areas, mm
 *   board: "r g b" | null           board colour shown under the inks (kraft)
 *   brand, product, proofNo, date   header: brand (as typed), product line, PROOF n, date
 *   flatNoun                        "flat sleeve" - used under the drawing ("205 mm - flat sleeve, cut size")
 *   facts: [[label, text]], colours: [{ name, cmyk, use }], colourNote, howToRead, checkList: [text]
 *   gridNote: [text], elements: [[label, text]], iso: { L, W, H, labels: [l, w, h], open: bool, title, caption }
 *   threeDNotes: [text], shots: [{ body, w, h, caption }], renders: [{ body, w, h, caption }], renderNote
 *   colourPage: { body, w, h }      the house colour + timeline page (picture)
 * }
 */
/** the scale the flat is drawn at on pages 1 and 2: 1 = 100 % (it fits the left of the A3 page with its bleed and its size line) */
export const boxProofScale = (blank) => Math.min(1, (318 - 12 - 12) / (blank.w + 6), (297 - 30 - 10 - 14) / (blank.h + 6));

export function boxProofPdf(p) {
  const PW = 420, PH = 297, CX = 318, CW = PW - 12 - CX, { doc, blank } = p, objs = [];
  const add = (b) => { objs.push(b); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("PAGES");
  const F1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), F2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"), F3 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  const xo = [], v = p.vector;
  for (const im of v.images || []) { const sm = im.smask ? add(im.smask) : 0; xo.push(`/${im.name} ${add(im.body.replace("@@SMASK@@", sm ? `/SMask ${sm} 0 R` : ""))} 0 R`); }
  const cs = Object.entries(v.colorSpaces || {}).map(([k, q]) => `/${k} ${q}`).join(" ");
  const art = add(`<< /Type /XObject /Subtype /Form /BBox [${f(-10 * K)} ${f(-10 * K)} ${f((blank.w + 10) * K)} ${f((blank.h + 10) * K)}] /Resources << ${cs ? `/ColorSpace << ${cs} >>` : ""}${xo.length ? ` /XObject << ${xo.join(" ")} >>` : ""} >> /Length ${v.ops.length} >>\nstream\n${v.ops}\nendstream`);
  const shotNo = (p.shots || []).map((s) => add(s.body.replace("@@SMASK@@", "")));
  const rendNo = (p.renders || []).map((s) => add(s.body.replace("@@SMASK@@", "")));
  const guideNo = p.colourPage ? add(p.colourPage.body.replace("@@SMASK@@", "")) : 0;
  const res = `<< /Font << /F1 ${F1} 0 R /F2 ${F2} 0 R /F3 ${F3} 0 R >> /XObject << /Art ${art} 0 R${shotNo.map((n, i) => ` /Sh${i} ${n} 0 R`).join("")}${rendNo.map((n, i) => ` /Rn${i} ${n} 0 R`).join("")}${guideNo ? ` /Guide ${guideNo} 0 R` : ""} >> >>`;
  const NP = 3 + ((p.renders || []).length ? 1 : 0) + (guideNo ? 1 : 0), kids = [];
  // the flat: at 100 % when it fits the left of the page (house: "print A3 at 100 %"), else as large as fits
  const S = boxProofScale(blank), FX = 12 + Math.max(3 * S, (CX - 24 - blank.w * S) / 2), FY = 30 + 3 * S; // centred in the left of the page

  const page = (draw) => {
    const n = kids.length + 1, c = ["q", `1 0 0 -1 0 ${f(PH * K)} cm`];
    const T = (x, y, s, fs = 7, font = "F1", col = DGREY) => c.push(`BT /${font} ${f(fs)} Tf ${col} k 1 0 0 -1 ${f(x * K)} ${f(y * K)} Tm (${esc(s)}) Tj ET`);
    const wrap = (s, fs, bold, w) => { const out = []; for (const para of String(s).split("\n")) { let line = ""; for (const word of para.split(" ")) { const t = (line + " " + word).trim(); if (line && widthMm(t, fs, bold) > w) { out.push(line); line = word; } else line = t; } out.push(line); } return out; };
    // TW(): text wrapped to width w; returns the next y (house T(): line height = size x 0.3528 x 1.6)
    const TW = (x, y, s, fs = 7, font = "F1", col = DGREY, w = CW) => { const lh = fs * 0.3528 * 1.6; for (const ln of wrap(s, fs, font === "F2", w)) { T(x, y, ln, fs, font, col); y += lh; } return y; };
    const line = (x1, y1, x2, y2, col, w, dash = "") => c.push(`${col} K ${f(w)} w ${dash || "[] 0 d"} ${f(x1 * K)} ${f(y1 * K)} m ${f(x2 * K)} ${f(y2 * K)} l S [] 0 d`);
    const header = (title) => {
      T(12, 13, "AEROS", 15, "F2", BLACK); T(34, 13, "aeros-x.com", 6.5);
      T(PW - 12 - widthMm(title, 9, true), 13, title, 9, "F2", BLACK);
      T(12, 21, p.brand, 11, "F2", BLACK); T(12 + widthMm(p.brand, 11, true) + 3, 21, p.product, 9, "F1", BLACK);
      T(12, 25.5, `PROOF ${p.proofNo}   |   ${p.date}   |   for approval`, 6.5);
      line(12, 16, PW - 12, 16, DGREY, 0.3); line(12, PH - 10, PW - 12, PH - 10, GREY, 0.3);
      T(12, PH - 6, "Artwork proof - nothing goes to print until this page is approved in writing.", 6);
      const ft = `AEROS   aeros-x.com   ${p.brand}   PROOF ${p.proofNo}   page ${n} of ${NP}`; T(PW - 12 - widthMm(ft, 6), PH - 6, ft, 6);
    };
    const M = (x, y) => [FX + x * S, FY + y * S];
    // flat(): the box flat with the artwork, the die on top; guides = the 10 mm panel grid + panel names (page 2)
    const flat = (guides) => {
      if (p.board) c.push(`${p.board} rg ${f(FX * K)} ${f(FY * K)} ${f(blank.w * S * K)} ${f(blank.h * S * K)} re f`);
      c.push("q", `${f(S)} 0 0 ${f(S)} ${f(FX * K)} ${f(FY * K)} cm`, "/Art Do", "Q");
      for (const [a, b, c2, d] of p.noInk || []) { // glue areas carry no ink: bare board, never a printed patch
        // a glue area that reaches the edge of the blank is cleared through the bleed too, so no ring of colour is left round it
        const x0 = a <= 0 ? -3.2 : a, y0 = b <= 0 ? -3.2 : b, x1 = c2 >= blank.w ? blank.w + 3.2 : c2, y1 = d >= blank.h ? blank.h + 3.2 : d;
        if (x1 > x0 && y1 > y0) c.push(`${p.board || "1 1 1"} rg ${f((FX + x0 * S) * K)} ${f((FY + y0 * S) * K)} ${f((x1 - x0) * S * K)} ${f((y1 - y0) * S * K)} re f`);
      }
      if (guides) for (const [col, wd] of [[DGREY, 0.5], ["0 0 0 0", 0.2]]) for (const pn of p.panels) { // every guide twice: soft dark, then white on top, so it reads on any colour
        const [x0, y0, x1, y1] = pn.box;
        for (let xx = x0; xx <= x1 + 1e-6; xx += 10) line(...M(xx, y0), ...M(xx, y1), col, wd);
        for (let yy = y0; yy <= y1 + 1e-6; yy += 10) line(...M(x0, yy), ...M(x1, yy), col, wd);
      }
      const die = (layer, paint) => { c.push(paint); for (const g of doc.segments) if (g.layer === layer) { const q = g.pts.map(([a, b]) => `${f(FX * K + a * S)} ${f(FY * K + b * S)}`); c.push(g.kind === "l" ? `${q[0]} m ${q[1]} l S` : `${q[0]} m ${q[1]} ${q[2]} ${q[3]} c S`); } c.push("[] 0 d"); };
      die("crease", `${FOLD} K 0.4 w [3 2] 0 d`); die("cut", `${CUT} K 0.6 w [] 0 d`);
      if (guides) for (const pn of p.panels) {
        const [qx, qy] = M(pn.box[0] + 2, pn.box[1] + 4.5), tw = widthMm(pn.label, 6.5, true);
        c.push(`1 1 1 rg ${f((qx - 0.4) * K)} ${f((qy - 2.6) * K)} ${f((tw + 1.2) * K)} ${f(3.4 * K)} re f`);
        T(qx, qy, pn.label, 6.5, "F2", BLACK);
      }
      // the cut width under the flat, as the house file: "<n> mm - flat box, cut size"
      const [ax, ay] = M(0, blank.h), [bx] = M(blank.w, blank.h), dy = ay + 7;
      line(ax, dy, bx, dy, BLUE, 0.35); line(ax, dy - 1.5, ax, dy + 1.5, BLUE, 0.35); line(bx, dy - 1.5, bx, dy + 1.5, BLUE, 0.35);
      const t = `${blank.w.toFixed(0)} mm - ${p.flatNoun}, cut size${S < 0.999 ? ` (drawn at ${Math.round(S * 100)} %)` : ""}`;
      T((ax + bx) / 2 - widthMm(t, 6.5) / 2, dy + 4, t, 6.5, "F1", "0.85 0.35 0 0.2");
    };
    // iso(): the formed box in true isometric with its three sizes (page 2, where the house draws its box spec frame)
    const iso = (x, y, w, h) => {
      const { L, W: Wd, H: Hd, labels, open, title, caption } = p.iso, c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
      const pr = (X, Y, Z) => [X * c30 + Y * c30, X * s30 - Y * s30 - Z], ext = [];
      for (const X of [-10, L + 10]) for (const Y of [-10, Wd + 10]) for (const Z of [0, Hd]) ext.push(pr(X, Y, Z));
      const u0 = Math.min(...ext.map((e) => e[0])), u1 = Math.max(...ext.map((e) => e[0])), v0 = Math.min(...ext.map((e) => e[1])), v1 = Math.max(...ext.map((e) => e[1]));
      T(x, y + 3, title, 8, "F2", BLACK);
      const top = y + 8, aw = w - 8, ah = h - 8 - 10, sc = Math.min(aw / (u1 - u0), ah / (v1 - v0)), ox = x + 4 + (aw - (u1 - u0) * sc) / 2 - u0 * sc, oy = top - v0 * sc;
      const P = (X, Y, Z) => { const [u, vv] = pr(X, Y, Z); return [ox + u * sc, oy + vv * sc]; };
      const poly = (pts, col, wd, dash = "") => c.push(`${col} K ${f(wd)} w ${dash || "[] 0 d"} ${pts.map(([a, b], i) => `${f(a * K)} ${f(b * K)} ${i ? "l" : "m"}`).join(" ")} S [] 0 d`);
      poly([P(0, 0, 0), P(L, 0, 0), P(L, Wd, 0), P(L, Wd, Hd), P(L, 0, Hd), P(0, 0, Hd), P(0, 0, 0)], BLACK, 0.7); // the long face and the end face
      poly([P(L, 0, 0), P(L, 0, Hd)], BLACK, 0.7); // the corner between them
      poly([P(0, 0, Hd), P(0, Wd, Hd), P(L, Wd, Hd)], BLACK, 0.7); // the top
      if (open) { const d = Math.min(3, Wd / 8, Hd / 8); poly([P(L, d, d), P(L, Wd - d, d), P(L, Wd - d, Hd - d), P(L, d, Hd - d), P(L, d, d)], DGREY, 0.4); } // an open end: you look into it
      const dim = (a, b, e1, e2, txt, off) => { poly([e1, a], BLUE, 0.35); poly([e2, b], BLUE, 0.35); poly([a, b], BLUE, 0.35); T((a[0] + b[0]) / 2 + off[0], (a[1] + b[1]) / 2 + off[1], txt, 6.3, "F2", BLUE); };
      dim(P(0, -7, 0), P(L, -7, 0), P(0, -1.5, 0), P(L, -1.5, 0), `${labels[0]} ${+L.toFixed(1)} mm`, [-16, 5]);
      dim(P(L + 7, 0, 0), P(L + 7, Wd, 0), P(L + 1.5, 0, 0), P(L + 1.5, Wd, 0), `${labels[1]} ${+Wd.toFixed(1)} mm`, [2, 4]);
      dim(P(-7, 0, 0), P(-7, 0, Hd), P(-1.5, 0, 0), P(-1.5, 0, Hd), `${labels[2]} ${+Hd.toFixed(1)} mm`, [-24, 0]);
      TW(x, y + h - 4, caption, 5.8, "F1", DGREY, w);
    };
    draw({ c, T, TW, line, header, flat, iso });
    c.push("Q");
    const content = c.join("\n"), cn = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(PW * K)} ${f(PH * K)}] /Contents ${cn} 0 R /Resources ${res} >>`));
  };

  // ---------- page 1 ----------
  page(({ c, T, TW, line, header, flat }) => {
    header("ARTWORK PROOF"); flat(false);
    let y = 36;
    T(CX, y, "THE PRODUCT", 8, "F2", BLACK); y += 8 * 0.3528 * 1.6 + 1;
    for (const [lab, val] of p.facts) { T(CX, y, lab, 6.5, "F2", DGREY); y = TW(CX + 17, y, val, 6.5, "F1", BLACK, CW - 17) + 1; }
    y += 2; T(CX, y, "COLOURS", 8, "F2", BLACK); y += 8 * 0.3528 * 1.6 + 1;
    for (const sw of p.colours) {
      c.push(`${sw.cmyk.map(f).join(" ")} k ${DGREY} K 0.2 w ${f(CX * K)} ${f((y - 3) * K)} ${f(10 * K)} ${f(6 * K)} re B`);
      T(CX + 12, y, sw.name, 7, "F2", BLACK); y = TW(CX + 12, y + 3.6, sw.use, 6.2, "F1", DGREY, CW - 12) + 2.5;
    }
    y = TW(CX, y, p.colourNote, 6, "F1", DGREY, CW) + 2;
    T(CX, y, "HOW TO READ THIS DRAWING", 8, "F2", BLACK); y += 8 * 0.3528 * 1.6 + 1;
    y = TW(CX, y, p.howToRead, 6.2, "F1", DGREY, CW) + 2;
    T(CX, y, "PLEASE CHECK AND CONFIRM", 8, "F2", BLACK); y += 8 * 0.3528 * 1.6 + 1;
    for (const ln of p.checkList) y = TW(CX, y, "· " + ln, 6.4, "F1", DGREY, CW) + 0.6;
    const by = 250;
    c.push(`${BLACK} K 0.5 w ${f(CX * K)} ${f(by * K)} ${f(CW * K)} ${f(32 * K)} re S`);
    T(CX + 3, by + 6, "APPROVED FOR PRINT", 8, "F2", BLACK);
    ["Name", "Signature", "Date"].forEach((l, i) => { const yy = by + 14 + i * 7; T(CX + 3, yy, l, 6.5); line(CX + 20, yy + 0.5, PW - 15, yy + 0.5, GREY, 0.3); });
  });
  // ---------- page 2 ----------
  page(({ T, TW, header, flat, iso }) => {
    header("ARTWORK ON THE PANELS"); flat(true);
    let y = 36;
    T(CX, y, "THE GUIDE GRID", 8, "F2", BLACK); y += 8 * 0.3528 * 1.6 + 1;
    for (const ln of p.gridNote) y = TW(CX, y, ln, 6.3, "F1", DGREY, CW) + 2;
    y += 1; T(CX, y, "WHERE EACH ELEMENT SITS", 8, "F2", BLACK); y += 8 * 0.3528 * 1.6 + 1;
    for (const [lab, val] of p.elements) { T(CX, y, lab, 6.5, "F2", DGREY); y = TW(CX, y + 3.8, val, 6.3, "F1", DGREY, CW) + 2; }
    y += 2; y = TW(CX, y, "Colour on this page is shown through the grid - judge colour from page 1.", 6, "F1", DGREY, CW) + 4;
    const room = PH - 14 - y; if (room >= 42) iso(CX, y, CW, Math.min(70, room));
  });
  // ---------- page 3 ----------
  page(({ c, T, TW, header }) => {
    header("THE BOX IN 3D");
    // the tool's shots are wide pictures: two per row on the left 250 mm (where the house places its view sheet), notes on the right
    const shots = p.shots || [], cols = 2, rows = Math.max(1, Math.ceil(shots.length / cols)), asp = Math.max(1, ...shots.map((s) => s.w / s.h));
    const bh = Math.min((250 - (rows - 1) * 9) / rows - 5, ((258 - 6) / cols) / asp), bw = bh * asp;
    shots.forEach((s, i) => {
      const cx = 12 + (i % cols) * (bw + 6), cy = 30 + Math.floor(i / cols) * (bh + 9), k = Math.min(bw / s.w, bh / s.h), w = s.w * k, h = s.h * k;
      c.push("q", `${f(w * K)} 0 0 ${f(-h * K)} ${f(cx * K)} ${f((cy + h) * K)} cm`, `/Sh${i} Do`, "Q");
      T(cx, cy + h + 3.6, s.caption || `View ${i + 1}`, 6.2);
    });
    let y = 36; const nx = Math.max(270, 12 + cols * bw + 6 + 6);
    for (const ln of p.threeDNotes) y = TW(nx, y, "· " + ln, 6.2, "F1", DGREY, PW - 12 - nx) + 0.5;
  });
  // ---------- page 4 ----------
  if ((p.renders || []).length) page(({ c, T, header }) => {
    header("HOW IT LOOKS");
    const rs = p.renders, n = Math.min(3, rs.length), bw = (PW - 24 - (n - 1) * 9) / n; // one row of up to three, as the house grid's columns
    rs.slice(0, 6).forEach((s, i) => {
      const cx = 12 + (i % 3) * (bw + 9), cy = 30 + Math.floor(i / 3) * 128, k = Math.min(bw / s.w, 124 / s.h), w = s.w * k, h = s.h * k;
      c.push("q", `${f(w * K)} 0 0 ${f(-h * K)} ${f((cx + (bw - w) / 2) * K)} ${f((cy + h) * K)} cm`, `/Rn${i} Do`, "Q");
      if (s.caption) T(cx + (bw - w) / 2, cy + h + 3.6, s.caption, 6.2);
    });
    T(12, 284.5, p.renderNote, 6.5);
  });
  // ---------- page 5: the house colour + timeline page ----------
  if (guideNo) page(({ c, header }) => {
    header("HOW YOUR COLOURS ARE PRINTED");
    const top = 30, avail = PH - 12 - top, k = Math.min((PW - 24) / p.colourPage.w, avail / p.colourPage.h), w = p.colourPage.w * k, h = p.colourPage.h * k;
    c.push("q", `${f(w * K)} 0 0 ${f(-h * K)} ${f(((PW - w) / 2) * K)} ${f((top + h) * K)} cm`, "/Guide Do", "Q");
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
