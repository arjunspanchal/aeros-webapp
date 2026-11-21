// AEROS CUSTOMER PROOF for a PAPER BAG - a port of Aeros Artworks/_tools/make_customer_proof_bag.py, same page (500 x 320 mm),
// same positions, same wording slots (house rules, cortex 4a: AEROS on every page, no supplier / SKU / die codes / file
// names, colours stated per ink, element sizes and positions stated, every 3D view watermarked):
//   page 1  ARTWORK PROOF   the flat blank with the artwork, cut + folds, the facts, colours, check list, the isometric
//                           line art W x G x H (Arjun 12-Oct-2026: always on a bag proof), sign-off box
//   page 2  ON THE GRID     the same blank with an OPEN grid every 50 mm from every fold, 10 mm ticks on the top and left
//                           edges, the distances written, the folds named, and where each element sits
//   page 3  THE BAG IN 3D   the views taken in the tool's own 3D viewer (the measured model), watermarked
//   page 4  HOW IT LOOKS    the measured model set in the tool's lifestyle scenes (Arjun 21-Nov-2026), where the house
//                           file places its photoreal renders; left out when no scene shot is passed
// Differences from the house file, both forced by the tool: the fold lines are the die's own crease lines (the house draws
// the panel folds from its geometry record), and page 3 lays out the tool's shots where the house places its view sheet.
import { PT_PER_MM } from "../cakebox.js";
import { proofTextWidth as widthMm, proofEsc as esc } from "./proof-pdf.js";

const K = PT_PER_MM, f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(3)).toString());
const INK = "0 0 0 1", SOFT = "0 0 0 0.55", HAIR = "0 0 0 0.3", FOLD = "0 0 0 0.45", BLUE = "0.85 0.35 0 0", GREEN = "0.41 0.74 0.27";
const inch = (mm) => (mm / 25.4).toFixed(1);

/**
 * p = {
 *   doc, blank: { w, h }          the die (pt, y down) and its size in mm
 *   vector                        artworkToPdf() of the flat bag (blank frame, with bleed)
 *   panels: [{ label, a, b }]     body panels left to right, mm (label GLUE / FRONT / SIDE / BACK), body: { top, fold } mm
 *   size: { W, G, H }, dcut: bool, notch: bool
 *   paper: "r g b" | null         paper colour shown under the inks (kraft); noInk: [[x0, y0, x1, y1]] glue areas, mm
 *   brand, brandPlain, product, stage, date
 *   readNote, key: [text], facts: [[label, text]], colourNote, colours: [{ name, cmyk }], checkList: [text]
 *   gridNote, elements: [text], threeDNote, threeDNote2
 *   shots: [{ body, w, h, caption }]   watermarked 3D views; renders: [{ body, w, h, caption }] + renderNote: scene shots
 * }
 */
export function bagProofPdf(p) {
  const W = 500, H = 320, { doc, blank } = p, objs = [];
  const add = (b) => { objs.push(b); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("PAGES");
  const F1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), F2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"), F3 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  const xo = [], v = p.vector;
  for (const im of v.images || []) { const sm = im.smask ? add(im.smask) : 0; xo.push(`/${im.name} ${add(im.body.replace("@@SMASK@@", sm ? `/SMask ${sm} 0 R` : ""))} 0 R`); }
  const cs = Object.entries(v.colorSpaces || {}).map(([k, q]) => `/${k} ${q}`).join(" ");
  const art = add(`<< /Type /XObject /Subtype /Form /BBox [${f(-10 * K)} ${f(-10 * K)} ${f((blank.w + 10) * K)} ${f((blank.h + 10) * K)}] /Resources << ${cs ? `/ColorSpace << ${cs} >>` : ""}${xo.length ? ` /XObject << ${xo.join(" ")} >>` : ""} >> /Length ${v.ops.length} >>\nstream\n${v.ops}\nendstream`);
  const shotNo = (p.shots || []).map((s) => add(s.body.replace("@@SMASK@@", "")));
  const rendNo = (p.renders || []).map((s) => add(s.body.replace("@@SMASK@@", "")));
  const res = `<< /Font << /F1 ${F1} 0 R /F2 ${F2} 0 R /F3 ${F3} 0 R >> /XObject << /Art ${art} 0 R${shotNo.map((n, i) => ` /Sh${i} ${n} 0 R`).join("")}${rendNo.map((n, i) => ` /Rn${i} ${n} 0 R`).join("")} >> >>`;
  const kids = [];

  const page = (draw) => {
    const c = ["q", `1 0 0 -1 0 ${f(H * K)} cm`];
    const T = (x, y, s, fs = 8, col = INK, font = "F1") => c.push(`BT /${font} ${f(fs)} Tf ${col} k 1 0 0 -1 ${f(x * K)} ${f(y * K)} Tm (${esc(s)}) Tj ET`);
    const wrap = (s, fs, bold, w) => { const out = []; let line = ""; for (const word of String(s).split(" ")) { const t = (line + " " + word).trim(); if (line && widthMm(t, fs, bold) > w) { out.push(line); line = word; } else line = t; } return line ? [...out, line] : out; };
    const TW = (x, y, s, fs = 7, font = "F1", w = 120, col = INK) => { const lead = (fs * 1.38) / K, lines = wrap(s, fs, font === "F2", w); lines.forEach((ln, i) => T(x, y + i * lead, ln, fs, col, font)); return y + lines.length * lead; };
    const line = (x1, y1, x2, y2, col, w, dash = "") => c.push(`${col} K ${f(w)} w ${dash || "[] 0 d"} ${f(x1 * K)} ${f(y1 * K)} m ${f(x2 * K)} ${f(y2 * K)} l S [] 0 d`);
    const header = (kicker) => {
      T(18, 15.5, "AEROS", 15, INK, "F2"); T(45.5, 15.5, "aeros-x.com", 7, SOFT);
      T(W - 18 - widthMm(kicker, 9, true), 15.5, kicker, 9, INK, "F2");
      line(18, 18.5, W - 18, 18.5, INK, 0.8);
      T(18, 25, p.brand, 12, INK, "F2"); T(18 + widthMm(p.brand, 12, true) + 5, 25, p.product, 10.5);
      T(18, 30.5, `${p.stage}  ·  ${p.date}  ·  for approval`, 8, SOFT);
    };
    const footer = (note) => { line(18, H - 12, W - 18, H - 12, HAIR, 0.5); T(18, H - 7.5, note, 7, SOFT); const rt = `AEROS  ·  aeros-x.com  ·  ${p.brandPlain || p.brand}  ·  ${p.stage}`; T(W - 18 - widthMm(rt, 7), H - 7.5, rt, 7, SOFT); };
    // place_blank(): the flat bag at width w with its top-left at (x, y); returns its height on the page
    const placeBlank = (x, y, w, { grid = false, labels = false } = {}) => {
      const s = w / blank.w, h = blank.h * s, M = (px, py) => [x + px * s, y + py * s], top = p.body.top, fold = p.body.fold;
      if (p.paper) c.push(`${p.paper} rg ${f(x * K)} ${f(y * K)} ${f(w * K)} ${f(h * K)} re f`);
      c.push("q", `${f(s)} 0 0 ${f(s)} ${f(x * K)} ${f(y * K)} cm`, "/Art Do", "Q");
      for (const [a, b, c2, d] of p.noInk || []) { // glue areas carry no ink: they show the bare paper (brown on kraft), never a white patch
        const rx0 = Math.max(0, a), ry0 = Math.max(0, b), rx1 = Math.min(blank.w, c2), ry1 = Math.min(blank.h, d);
        if (rx1 > rx0 && ry1 > ry0) c.push(`${p.paper || "1 1 1"} rg ${f((x + rx0 * s) * K)} ${f((y + ry0 * s) * K)} ${f((rx1 - rx0) * s * K)} ${f((ry1 - ry0) * s * K)} re f`);
      }
      const dieLines = (layer, paint) => { c.push(paint); for (const g of doc.segments) if (g.layer === layer) { const q = g.pts.map(([a, b]) => `${f(x * K + a * s)} ${f(y * K + b * s)}`); c.push(g.kind === "l" ? `${q[0]} m ${q[1]} l S` : `${q[0]} m ${q[1]} ${q[2]} ${q[3]} c S`); } c.push("[] 0 d"); };
      dieLines("cut", `${GREEN} RG 0.5 w [] 0 d`);
      if (grid) {
        const GS = 50, TK = 10, L = [];
        for (const pn of p.panels) for (let xx = pn.a + GS; xx < pn.b - 0.01; xx += GS) L.push([[xx, top], [xx, blank.h]]);
        for (let yy = top + GS; yy < blank.h - 0.01; yy += GS) L.push([[0, yy], [blank.w, yy]]);
        for (const [col, wd] of [["0 0 0 0.6", 0.45], ["0 0 0 0", 0.18]]) for (const [a, b] of L) line(...M(...a), ...M(...b), col, wd); // dark under, thin white over: reads on any ground
        for (const pn of p.panels) for (let xx = pn.a + TK; xx < pn.b - 0.01; xx += TK) { const [qx, qy] = M(xx, top); line(qx, qy, qx, qy - (Math.abs((xx - pn.a) % GS) < 0.01 ? 2.4 : 1.2), "0 0 0 0.7", 0.3); }
        for (let yy = top + TK; yy < blank.h - 0.01; yy += TK) { const [qx, qy] = M(0, yy); line(qx, qy, qx - (Math.abs((yy - top) % GS) < 0.01 ? 2.4 : 1.2), qy, "0 0 0 0.7", 0.3); }
        for (const pn of p.panels) for (let xx = pn.a + GS; xx < pn.b - 0.01; xx += GS) { const [qx, qy] = M(xx, top), t = String(Math.round(xx - pn.a)); T(qx - widthMm(t, 4.6) / 2, qy - 3.2, t, 4.6, SOFT); }
        for (let yy = top + GS; yy < blank.h - 0.01; yy += GS) { const [qx, qy] = M(0, yy), t = String(Math.round(yy - top)); T(qx - widthMm(t, 4.6) - 3, qy + 1.4, t, 4.6, SOFT); }
      }
      dieLines("crease", `${grid ? BLUE : FOLD} K ${grid ? 0.7 : 0.45} w [3 2] 0 d`);
      if (labels) {
        for (const pn of p.panels) { const [qx, qy] = M((pn.a + pn.b) / 2, blank.h); T(qx - widthMm(pn.label, 7, true) / 2, qy + 4.5, pn.label, 7, INK, "F2"); }
        if (fold < blank.h - 5) { const [qx, qy] = M(blank.w, fold + (blank.h - fold) / 2); T(qx + 2, qy, "BASE", 6.5, SOFT, "F2"); }
        const [qx, qy] = M(blank.w, top + (fold - top) / 2); T(qx + 2, qy, "BODY", 6.5, SOFT, "F2");
      }
      return h;
    };
    // lineart(): true isometric of the formed bag (both axes at 30 deg), with W, G and H in mm and inches
    const lineart = (x, y, w, h) => {
      const { W: Wb, G: Gb, H: Hb } = p.size, c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
      T(x, y + 3, "THE BAG  -  isometric, W x G x H", 8, INK, "F2");
      T(x, y + 8.5, `${+Wb} x ${+Gb} x ${+Hb} mm   (${inch(Wb)} x ${inch(Gb)} x ${inch(Hb)} in)`, 7.2, INK, "F2");
      const iso = (X, Yd, Z) => [X * c30 + Yd * c30, X * s30 - Yd * s30 - Z];
      const ext = []; for (const X of [-12, Wb]) for (const Yd of [-12, Gb + 12]) for (const Z of [0, Hb]) ext.push(iso(X, Yd, Z));
      const u0 = Math.min(...ext.map((e) => e[0])), u1 = Math.max(...ext.map((e) => e[0])), v0 = Math.min(...ext.map((e) => e[1])), v1 = Math.max(...ext.map((e) => e[1]));
      const top = y + 13, aw = w - 50, ah = h - 13 - 9, sc = Math.min(aw / (u1 - u0), ah / (v1 - v0)), ox = x + 10 + (aw - (u1 - u0) * sc) / 2 - u0 * sc, oy = top - v0 * sc;
      const P = (X, Yd, Z) => { const [u, vv] = iso(X, Yd, Z); return [ox + u * sc, oy + vv * sc]; };
      const poly = (pts, col, wd, dash = "") => c.push(`${col} K ${f(wd)} w ${dash || "[] 0 d"} ${pts.map(([a, b], i) => `${f(a * K)} ${f(b * K)} ${i ? "l" : "m"}`).join(" ")} S [] 0 d`);
      const lw = 0.75;
      poly([P(0, 0, Hb), P(0, Gb, Hb), P(Wb, Gb, Hb)], SOFT, lw * 0.8); // open top: back rim + left gusset rim
      poly([P(0, 0, 0), P(Wb, 0, 0), P(Wb, Gb, 0), P(Wb, Gb, Hb), P(Wb, 0, Hb), P(0, 0, Hb), P(0, 0, 0)], INK, lw);
      poly([P(Wb, 0, 0), P(Wb, 0, Hb)], INK, lw); // front / gusset corner
      poly([P(Wb, Gb / 2, Hb), P(Wb, Gb / 2, 0)], SOFT, 0.4, "[2 1.5] 0 d"); // gusset centre crease
      if (p.notch) { const r = p.notch / 2, cx = Wb / 2, pts = []; for (let i = 0; i <= 20; i++) pts.push(P(cx - r + r * (1 - Math.cos((Math.PI * i) / 20)), 0, Hb - r * 0.55 * Math.sin((Math.PI * i) / 20))); poly(pts, INK, lw); }
      if (p.dcut) { // D-cut handle hole (stadium) on the front
        const hw = 90, hh = 30, cx = Wb / 2, zt = Hb - 25, rr = hh / 2, pts = [];
        for (let i = 0; i <= 12; i++) { const a = Math.PI / 2 + (Math.PI * i) / 12; pts.push([cx - hw / 2 + rr + rr * Math.cos(a), zt - rr + rr * Math.sin(a)]); }
        for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 12; pts.push([cx + hw / 2 - rr + rr * Math.cos(a), zt - rr + rr * Math.sin(a)]); }
        poly([...pts, pts[0]].map(([a, b]) => P(a, 0, b)), INK, lw);
      }
      const dim = (a, b, e1, e2, txt, off) => { poly([e1, a], BLUE, 0.4); poly([e2, b], BLUE, 0.4); poly([a, b], BLUE, 0.4); T((a[0] + b[0]) / 2 + off[0], (a[1] + b[1]) / 2 + off[1], txt, 7, BLUE, "F2"); };
      dim(P(0, -8, 0), P(Wb, -8, 0), P(0, -2, 0), P(Wb, -2, 0), `W  ${+Wb} mm (${inch(Wb)} in)`, [-14, 6]);
      dim(P(Wb + 8, 0, 0), P(Wb + 8, Gb, 0), P(Wb + 2, 0, 0), P(Wb + 2, Gb, 0), `G  ${+Gb} mm (${inch(Gb)} in)`, [3, 5]);
      dim(P(-8, 0, 0), P(-8, 0, Hb), P(-2, 0, 0), P(-2, 0, Hb), `H  ${+Hb} mm (${inch(Hb)} in)`, [-27, 0]);
      T(x, y + h + 1, `Formed bag, isometric, to scale. W = face width, G = gusset (depth), H = height${p.notch ? " to the top edge." : "."}`, 5.8, SOFT);
    };
    draw({ c, T, TW, line, header, footer, placeBlank, lineart });
    c.push("Q");
    const content = c.join("\n"), cn = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W * K)} ${f(H * K)}] /Contents ${cn} 0 R /Resources ${res} >>`));
  };

  // ============ PAGE 1
  page(({ c, T, TW, header, footer, placeBlank, lineart }) => {
    header("ARTWORK PROOF");
    const AW = Math.min(300, ((H - 44 - 16 - 40) * blank.w) / blank.h), ah = placeBlank(18, 44, AW, { labels: true }); // a tall blank is narrowed so the notes still fit under it
    const yc = 44 + ah + 12;
    T(18, yc, p.readNote, 7, SOFT);
    let yk = yc + 5;
    for (const ln of p.key) yk = TW(18, yk, ln, 6.8, "F1", Math.max(AW, 200), SOFT) + 0.6;
    const RX = 18 + Math.max(AW, 200) + 14, RW = W - 18 - RX;
    let y = 44;
    T(RX, y, "THE PRODUCT", 8, INK, "F2"); y += 5.5;
    for (const [k, val] of p.facts) { T(RX, y, k, 6.8, SOFT); y = TW(RX + 30, y, val, 6.8, "F1", RW - 30) + 1; }
    y += 3; T(RX, y, "COLOURS", 8, INK, "F2"); y += 5;
    y = TW(RX, y, p.colourNote, 6.4, "F1", RW, SOFT) + 2;
    const cols = 2, cw = RW / cols;
    p.colours.forEach((sw, i) => {
      const cx = RX + (i % cols) * cw, cy = y + Math.floor(i / cols) * 8.6;
      c.push(`${sw.cmyk.map(f).join(" ")} k ${HAIR} K 0.3 w ${f(cx * K)} ${f(cy * K)} ${f(9 * K)} ${f(6.5 * K)} re B`);
      T(cx + 11, cy + 2.8, sw.name, 6.4, INK, "F2"); T(cx + 11, cy + 6.1, `C${Math.round(sw.cmyk[0] * 100)} M${Math.round(sw.cmyk[1] * 100)} Y${Math.round(sw.cmyk[2] * 100)} K${Math.round(sw.cmyk[3] * 100)}`, 5.9, SOFT, "F3");
    });
    y += Math.ceil(p.colours.length / cols) * 8.6 + 3;
    T(RX, y, "PLEASE CHECK AND CONFIRM", 8, INK, "F2"); y += 5;
    for (const ln of p.checkList) { T(RX, y, "·", 8, SOFT); y = TW(RX + 4, y, ln, 6.4, "F1", RW - 4) + 0.8; }
    const BOX = 24, y4 = H - 14 - BOX - 2, LA = Math.min(120, y4 - (y + 4) - 6);
    if (LA >= 62) lineart(RX, y + 4, RW, LA); // the W x G x H line art is always on page 1
    else lineart(18, yk + 2, Math.max(AW, 200), Math.max(44, Math.min(62, H - 16 - (yk + 2))));
    c.push(`${HAIR} K 0.6 w ${f(RX * K)} ${f(y4 * K)} ${f((W - 18 - RX) * K)} ${f(BOX * K)} re S`);
    T(RX + 4, y4 + 5.6, "APPROVED FOR PRINT", 7.5, INK, "F2");
    ["Name", "Signature", "Date"].forEach((l, i) => { const ly = y4 + 11.5 + i * 5; T(RX + 4, ly, l, 6.6, SOFT); c.push(`${HAIR} K 0.4 w ${f((RX + 24) * K)} ${f((ly + 0.8) * K)} m ${f((W - 22) * K)} ${f((ly + 0.8) * K)} l S`); });
    footer("Artwork proof - nothing goes to print until this page is approved in writing.");
  });
  // ============ PAGE 2
  page(({ T, TW, header, footer, placeBlank }) => {
    header("ON THE GRID");
    TW(18, 39, p.gridNote, 7.3, "F1", W - 36);
    const n = p.elements.length, room = H - 14 - 52 - 13 - 5 - Math.ceil(n / 2) * 7.2 - 8, GW = Math.min(W - 36 - 40, (room * blank.w) / blank.h), gx = (W - GW) / 2;
    const gh = placeBlank(gx, 52, GW, { grid: true, labels: true });
    let yy = 52 + gh + 13; T(18, yy, "WHERE EACH ELEMENT SITS", 8, INK, "F2"); yy += 5;
    const colw = (W - 36) / 2;
    p.elements.forEach((ln, i) => TW(18 + (i % 2) * colw, yy + Math.floor(i / 2) * 7.2, ln, 6.6, "F1", colw - 6));
    footer("Reference drawing - the grid and the fold lines are guides, they are not printed.");
  });
  // ============ PAGE 3
  page(({ c, T, TW, header, footer }) => {
    header("THE BAG IN 3D");
    TW(18, 39, p.threeDNote, 7.3, "F1", W - 36);
    // the tool's shots are wide pictures: two per row, as large as the 240 mm of height allows, the note beside them
    const shots = p.shots || [], cols = 2, rows = Math.max(1, Math.ceil(shots.length / cols)), asp = Math.max(1, ...shots.map((s) => s.w / s.h));
    const bh = Math.min((240 - (rows - 1) * 11) / rows - 5, ((W - 36 - 90 - 6) / cols) / asp), bw = bh * asp;
    shots.forEach((s, i) => {
      const cx = 18 + (i % cols) * (bw + 6), cy = 50 + Math.floor(i / cols) * (bh + 11), k = Math.min(bw / s.w, bh / s.h), w = s.w * k, h = s.h * k;
      c.push("q", `${f(w * K)} 0 0 ${f(-h * K)} ${f(cx * K)} ${f((cy + h) * K)} cm`, `/Sh${i} Do`, "Q");
      T(cx, cy + h + 4, s.caption || `View ${i + 1}`, 7, SOFT);
    });
    const nx = 18 + cols * bw + (cols - 1) * 6 + 10;
    TW(nx, 54, p.threeDNote2, 7, "F1", W - 18 - nx, SOFT);
    footer("Reference views - for checking placement and size, not colour.");
  });

  // ============ PAGE 4  HOW IT LOOKS (Arjun 21-Nov-2026: "Use the lifestyle scene shots for those pages") - the measured
  // model in the tool's scenes, where the house file places its renders: in one row, at most 240 mm wide each
  if ((p.renders || []).length) page(({ c, T, TW, header, footer }) => {
    header("HOW IT LOOKS");
    TW(18, 39, p.renderNote, 7.3, "F1", W - 36);
    const rs = p.renders, rw = Math.min(240, (W - 36 - 8 * (rs.length - 1)) / rs.length), x0 = (W - (rw * rs.length + 8 * (rs.length - 1))) / 2;
    rs.forEach((s, i) => {
      const x = x0 + i * (rw + 8), k = Math.min(rw / s.w, rw / s.h), w = s.w * k, h = s.h * k;
      c.push("q", `${f(w * K)} 0 0 ${f(-h * K)} ${f((x + (rw - w) / 2) * K)} ${f((50 + h) * K)} cm`, `/Rn${i} Do`, "Q");
      if (s.caption) T(x + (rw - w) / 2, 50 + h + 4.5, s.caption, 7, SOFT);
    });
    footer("Visualisation - for appearance only, not for measuring or colour matching.");
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
