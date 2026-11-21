// DIGITAL SAMPLE FILE - the 13 x 19 in sheet the digital press prints a sample from (rules: skill aeros-digital-samples).
//   - sheet 13 x 19 in (330.2 x 482.6 mm), portrait
//   - the artwork goes as a 450 dpi IMAGE, never as vector (the digital press dropped large vector shapes on 28-Oct-2026)
//   - cut = "CutContour" spot (pink), fold = "Crease" spot (green); both SOLID lines (their creaser cannot read dashes),
//     neither prints
//   - an info box on every sheet: item, PAPER (type + GSM + poly), FRONT / BACK side, cut, crease, assembly
//   - a flat too big for the sheet is split ON ITS FOLDS into lettered pieces - artwork is never cut across a panel
// planDigital() decides what goes where (pure numbers); digitalSamplePdf() draws it (PDF 1.4, ASCII).
import { PT_PER_MM } from "../cakebox.js";

const K = PT_PER_MM, f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(3)).toString());
export const DIGITAL = { w: 330.2, h: 482.6, name: "13 x 19 in", margin: 8, head: 66, gap: 4, dpi: 450 };
const esc = (s) => String(s).replace(/[^\x20-\x7e]/g, (ch) => ({ "·": "-", "×": "x", "–": "-", "—": "-", "°": " deg", "’": "'", "‘": "'", "“": '"', "”": '"' }[ch] ?? "?")).replace(/([\\()])/g, "\\$1");

// vertical (axis 0) or horizontal (axis 1) fold lines that run most of the way across the blank: where a flat may be split
function splitLines(doc, w, h, axis) {
  const run = new Map(), span = axis === 0 ? h : w;
  for (const s of doc.segments) {
    if (s.layer !== "crease" || s.kind !== "l") continue;
    const a = s.pts[0].map((v) => v / K), b = s.pts[1].map((v) => v / K);
    if (Math.abs(a[axis] - b[axis]) > 0.05) continue;
    const key = +a[axis].toFixed(1);
    run.set(key, (run.get(key) || 0) + Math.abs(a[1 - axis] - b[1 - axis]));
  }
  return [...run].filter(([c, len]) => len >= span * 0.45 && c > 1 && c < (axis === 0 ? w : h) - 1).map(([c]) => c).sort((p, q) => p - q);
}

/**
 * doc = die (pt, y down); blank = { w, h } mm; cup = cupGeometry() or null. Returns
 *   { pieces: [{ box, label, w, h, clip }], sheets: [[{ piece, x, y, rot }]], ups, split, note } or { error }
 * x, y = where the piece's box top-left (after turning) sits on the sheet, in mm from the sheet's top-left.
 */
export function planDigital({ doc, blank, bleed = 3, cup = null }) {
  const D = DIGITAL, UW = D.w - 2 * D.margin, UH = D.h - D.head - 2 * D.margin, X0 = D.margin, Y0 = D.margin + D.head;
  if (cup) { // fans all the same way, one above the other; art clipped to the KLD's own bleed line
    // the piece = the whole fan: its CUT outline and its bleed (a wrap's bleed stops at the hem, so the cut reaches lower)
    const xs = [0, cup.w, ...cup.bleed.poly.map((q) => q[0])], ys = [0, cup.h, ...cup.bleed.poly.map((q) => q[1])];
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], pw = box[2] - box[0], ph = box[3] - box[1];
    // PITCH. The next fan's top edge is a flatter arc than this fan's bottom edge, so the two come closest near the fan's
    // bottom corners, not on the centre line. So the pitch is not worked out from the centre line: the fan's real outline
    // (cut and bleed, whichever reaches further) is sampled, a copy is slid down, and the pitch is the smallest one that
    // leaves CUT_GAP between the two everywhere (found by halving, to 0.05 mm).
    const CUT_GAP = 3, Rt = Math.max(cup.rTop, cup.bleed.rMax), Rb = Math.min(cup.rBot, cup.bleed.rMin);
    const ang = cup.bleed.poly.map((q) => Math.atan2(q[0] - cup.cx, cup.cy - q[1])), a0 = Math.min(cup.aLeft, ...ang) - 0.004, a1 = Math.max(cup.aRight, ...ang) + 0.004;
    const at = (r, a) => [cup.cx + r * Math.sin(a), cup.cy - r * Math.cos(a)], ring = [], N = 120;
    for (let k = 0; k <= N; k++) { const a = a0 + ((a1 - a0) * k) / N, r = Rb + ((Rt - Rb) * k) / N; ring.push(at(Rb, a), at(Rt, a), at(r, a0), at(r, a1)); }
    const room = (p) => { let d = Infinity; for (const u of ring) for (const v of ring) { const dx = u[0] - v[0], dy = u[1] - v[1] - p, dd = dx * dx + dy * dy; if (dd < d) d = dd; } return Math.sqrt(d); };
    let lo = (Rt - Rb) * 0.5, hi = (Rt - Rb) + 60;
    for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (room(mid) >= CUT_GAP) hi = mid; else lo = mid; }
    const pitch = Math.ceil(hi * 10) / 10;
    if (pw > UW) return { error: `The fan is ${pw.toFixed(0)} mm wide; the sheet has ${UW.toFixed(0)} mm.` };
    const n = Math.max(0, Math.floor((UH - ph) / pitch) + 1);
    if (!n) return { error: "The fan does not fit the sheet." };
    // image clip = the fan's whole envelope (bottom cut to the top of the bleed), not just the print area: the Aeros line
    // sits in the white strip under the print area. The art itself is already clipped to the KLD bleed line when painted.
    const env = []; for (let k = 0; k <= 60; k++) env.push(at(Rt, a0 + ((a1 - a0) * k) / 60)); for (let k = 60; k >= 0; k--) env.push(at(Rb, a0 + ((a1 - a0) * k) / 60));
    return { pieces: [{ box, label: "", w: pw, h: ph, clip: env }], ups: n, split: false, pitch,
      sheets: [Array.from({ length: n }, (_, i) => ({ piece: 0, x: X0 + (UW - pw) / 2, y: Y0 + i * pitch, rot: 0 }))], note: `${n} fans, all the same way, at least ${CUT_GAP} mm between one fan's ink and the next` };
  }
  const pw = blank.w + 2 * bleed, ph = blank.h + 2 * bleed;
  const grid = (a, b) => (a <= UW + 0.01 && b <= UH + 0.01 ? { cols: Math.floor((UW + D.gap) / (a + D.gap)), rows: Math.floor((UH + D.gap) / (b + D.gap)) } : null);
  const g0 = grid(pw, ph), g90 = grid(ph, pw), n0 = g0 ? g0.cols * g0.rows : 0, n90 = g90 ? g90.cols * g90.rows : 0;
  if (n0 || n90) { // the whole flat fits: as many as the sheet takes
    const rot = n90 > n0 ? 90 : 0, g = rot ? g90 : g0, a = rot ? ph : pw, b = rot ? pw : ph, out = [];
    const ox = X0 + (UW - (g.cols * a + (g.cols - 1) * D.gap)) / 2;
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) out.push({ piece: 0, x: ox + c * (a + D.gap), y: Y0 + r * (b + D.gap), rot });
    return { pieces: [{ box: [-bleed, -bleed, blank.w + bleed, blank.h + bleed], label: "", w: pw, h: ph, clip: null }], sheets: [out], ups: out.length, split: false, note: `${out.length}-up` };
  }
  // too big: split on the folds. Try columns first (bags), then rows.
  const fits = (a, b) => (a <= UW + 0.01 && b <= UH + 0.01) || (b <= UW + 0.01 && a <= UH + 0.01);
  for (const axis of [0, 1]) {
    const full = axis === 0 ? blank.w : blank.h, other = (axis === 0 ? blank.h : blank.w) + 2 * bleed;
    const stops = [0, ...splitLines(doc, blank.w, blank.h, axis), full], cuts = [0];
    let ok = true;
    while (cuts[cuts.length - 1] < full - 0.01) {
      const from = cuts[cuts.length - 1];
      const next = stops.filter((s) => s > from + 0.5 && fits(s - from + (from === 0 ? bleed : 0) + (s >= full - 0.01 ? bleed : 0), other)).pop();
      if (next == null) { ok = false; break; }
      cuts.push(next);
    }
    if (!ok || cuts.length < 3) continue;
    const pieces = cuts.slice(0, -1).map((a, k) => {
      const b = cuts[k + 1], lo = a - (k === 0 ? bleed : 0), hi = b + (k === cuts.length - 2 ? bleed : 0);
      const box = axis === 0 ? [lo, -bleed, hi, blank.h + bleed] : [-bleed, lo, blank.w + bleed, hi];
      return { box, label: `PIECE ${String.fromCharCode(65 + k)} of ${cuts.length - 1}`, w: box[2] - box[0], h: box[3] - box[1], clip: null,
        joins: [k > 0 && (axis === 0 ? [a, -bleed, a, blank.h + bleed] : [-bleed, a, blank.w + bleed, a]), k < cuts.length - 2 && (axis === 0 ? [b, -bleed, b, blank.h + bleed] : [-bleed, b, blank.w + bleed, b])].filter(Boolean) };
    });
    // shelf-pack the pieces: a new sheet whenever the next one does not fit beside or under the last
    const sheets = [[]]; let cx = X0, cy = Y0, rowH = 0;
    for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k], rot = p.w <= UW + 0.01 && p.h <= UH + 0.01 ? 0 : 90, a = rot ? p.h : p.w, b = rot ? p.w : p.h;
      if (cx + a > X0 + UW + 0.01) { cx = X0; cy += rowH + D.gap + 6; rowH = 0; }
      if (cy + b > Y0 + UH + 0.01) { sheets.push([]); cx = X0; cy = Y0; rowH = 0; }
      sheets[sheets.length - 1].push({ piece: k, x: cx, y: cy, rot });
      cx += a + D.gap; rowH = Math.max(rowH, b);
    }
    return { pieces, sheets, ups: 1, split: true, note: `1 flat in ${pieces.length} pieces, split on the ${axis === 0 ? "upright" : "cross"} folds` };
  }
  return { error: `This flat (${blank.w.toFixed(0)} x ${blank.h.toFixed(0)} mm) is bigger than the 13 x 19 in sheet and has no fold it can be split on. Ask Arjun.` };
}

/**
 * plan = planDigital(); images[k] = { body } | null for plan.pieces[k] (imageXObject of that piece's art, white ground);
 * head = { title, lines: [[label, text]], assembly: [text] }. One PDF, one page per sheet.
 */
export function digitalSamplePdf({ doc, plan, images = [], head, cutOnly = false }) {
  const D = DIGITAL, PW = D.w * K, PH = D.h * K, objs = [];
  const add = (b) => { objs.push(b); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("PAGES");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const imNo = images.map((im) => (im ? add(im.body.replace("@@SMASK@@", "")) : 0));
  const spot = (name, c1) => `[/Separation /${name} /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [${c1}] /N 1 >>]`;
  const res = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /ColorSpace << /Cut ${spot("CutContour", "0 1 0 0")} /Fold ${spot("Crease", "1 0 1 0")} >>${imNo.some(Boolean) ? ` /XObject << ${imNo.map((n, k) => (n ? `/Im${k} ${n} 0 R` : "")).join(" ")} >>` : ""} >>`;
  const seg = (s) => (s.kind === "l" ? `${f(s.pts[0][0])} ${f(s.pts[0][1])} m ${f(s.pts[1][0])} ${f(s.pts[1][1])} l S` : `${f(s.pts[0][0])} ${f(s.pts[0][1])} m ${f(s.pts[1][0])} ${f(s.pts[1][1])} ${f(s.pts[2][0])} ${f(s.pts[2][1])} ${f(s.pts[3][0])} ${f(s.pts[3][1])} c S`);
  const cutOps = doc.segments.filter((s) => s.layer === "cut").map(seg).join("\n"), foldOps = cutOnly ? "" : doc.segments.filter((s) => s.layer === "crease").map(seg).join("\n");
  const kids = [];
  plan.sheets.forEach((sheet, si) => {
    const c = ["q", `1 0 0 -1 0 ${f(PH)} cm`]; // page frame: mm-like, y down (the die's own frame)
    const text = (s, x, y, size, bold) => c.push(`BT /${bold ? "F2" : "F1"} ${f(size)} Tf 0 0 0 1 k 1 0 0 -1 ${f(x * K)} ${f(y * K)} Tm (${esc(s)}) Tj ET`);
    // info box
    let y = D.margin + 4;
    const wrap = (s, max) => { const out = []; let line = ""; for (const w of String(s).split(" ")) { if ((line + " " + w).length > max && line) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w; } if (line) out.push(line); return out; };
    for (const ln of wrap(`${head.title}  -  sheet ${si + 1} of ${plan.sheets.length}`, 118)) { text(ln, D.margin, y, 9.5, true); y += 4.4; }
    text("Solid pink line = CUT (CutContour). Solid green line = FOLD (Crease). Neither line prints.", D.margin, y, 7.5, false); y += 5.2;
    text("FRONT SIDE  -  print the FRONT side only, back blank", D.margin, y, 10, true); y += 5;
    for (const [label, body] of head.lines) for (const [k, ln] of wrap(`${label}: ${body}`, 150).entries()) { text(k ? `      ${ln}` : ln, D.margin, y, 7.5, false); y += 3.5; }
    if (head.assembly?.length) { text("ASSEMBLY:", D.margin, y + 0.6, 7.5, true); y += 4.1; head.assembly.forEach((a, k) => { for (const [j, ln] of wrap(`${k + 1}  ${a}`, 150).entries()) { text(j ? `     ${ln}` : ln, D.margin, y, 7.5, false); y += 3.5; } }); }
    c.push("0.5 0.5 0.5 RG 0.4 w", `${f(D.margin * K)} ${f((D.margin + D.head - 3) * K)} m ${f((D.w - D.margin) * K)} ${f((D.margin + D.head - 3) * K)} l S`);
    for (const pl of sheet) {
      const p = plan.pieces[pl.piece], [bx0, by0, bx1, by1] = p.box;
      c.push("q");
      // die frame (mm) -> sheet: rot 0 = straight; rot 90 = turned a quarter turn clockwise
      if (pl.rot) c.push(`0 1 -1 0 ${f((pl.x + p.h + by0) * K)} ${f((pl.y - bx0) * K)} cm`);
      else c.push(`1 0 0 1 ${f((pl.x - bx0) * K)} ${f((pl.y - by0) * K)} cm`);
      c.push("q", p.clip ? p.clip.map(([x, yy], k) => `${f(x * K)} ${f(yy * K)} ${k ? "l" : "m"}`).join(" ") + " h W n" : `${f(bx0 * K)} ${f(by0 * K)} ${f((bx1 - bx0) * K)} ${f((by1 - by0) * K)} re W n`);
      if (imNo[pl.piece]) c.push("q", `${f((bx1 - bx0) * K)} 0 0 ${f(-(by1 - by0) * K)} ${f(bx0 * K)} ${f(by1 * K)} cm`, `/Im${pl.piece} Do`, "Q");
      c.push("Q", "q", `${f(bx0 * K)} ${f(by0 * K)} ${f((bx1 - bx0) * K)} ${f((by1 - by0) * K)} re W n`, "[] 0 d 0.6 w 1 J 1 j");
      if (foldOps) c.push("/Fold CS 1 SCN", foldOps);
      c.push("/Cut CS 1 SCN", cutOps);
      for (const [x1, y1, x2, y2] of p.joins || []) c.push(`${f(x1 * K)} ${f(y1 * K)} m ${f(x2 * K)} ${f(y2 * K)} l S`); // a split fold is cut here
      c.push("Q", "Q");
      if (p.label) text(`${p.label}  -  cut on the pink line; join the pieces edge to edge on the back with tape, in letter order`, pl.x, pl.y - 1.2, 7, true);
    }
    c.push("Q");
    const content = c.join("\n"), cn = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(PW)} ${f(PH)}] /Contents ${cn} 0 R /Resources ${res} >>`));
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
