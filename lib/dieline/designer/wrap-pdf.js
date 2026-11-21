// WRAP SHEET PRINT FILES - a port of build_artonly() / build_4up() / the GRIDCHECK of the house script
// (KLD Templates / Wrap Sheets / _src / gen_wrap_sheet.py), same layout and numbers:
//   up 1  ARTONLY       one sheet: page = sheet + 2 x (3 bleed + 5), TrimBox = the cut, BleedBox = cut + 3, trim ticks
//   up 4  OFFSET-LAYOUT the press sheet: 2 x 2 BUTT CUT (no gutters, one continuous pattern field), 3 mm bleed, 12 mm
//                       margin with trim ticks on every cut line + 4 registration marks; TrimBox = the 4-up field
//   grid  GRIDCHECK     the single sheet with a 10 mm grid from the cut, centre lines and the repeat tiles - NOT FOR PRINT
// Each element is written ONCE as a form and placed everywhere, as the house file does: a press sheet with a hundred
// lockups stays small and every copy is byte-identical. No fonts in the print files (the grid check carries a caption).
import { K } from "./vector-pdf.js";
import { expandWrap, WRAP_BLEED as B, WRAP_MARGIN } from "../wrap.js";

const f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(3)).toString());

/**
 * g = wrapGeometry(), plan = tilePlan(), items = the job's layers (ground, lockup rep "A", small mark rep "B"),
 * vec(list, box) = artworkToPdf for a list of items clipped to box (mm). Returns { pdf, sheetMm, inks, notes, copies }.
 */
export async function wrapSheetPdf({ g, plan, items, vec, up = 1, grid = false, caption = "" }) {
  const n = up === 4 ? 2 : 1, m = up === 4 ? WRAP_MARGIN : 5, FW = n * g.W, FH = n * g.H, pw = FW + 2 * (B + m), ph = FH + 2 * (B + m), x0 = B + m, y0 = B + m;
  const field = [-B, -B, FW + B, FH + B], placed = expandWrap(items, plan, field);
  const floods = placed.filter((i) => i.kind === "flood"), copies = placed.filter((i) => i.kind !== "flood"), srcs = items.filter((i) => i.rep && i.kind !== "flood");
  const objs = [], add = (b) => { objs.push(b); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); add("PAGE"); add("CONTENT");
  const inks = new Map(), notes = [], forms = {}, pageXo = [], images = async (v) => { const xo = []; for (const im of v.images || []) { const sm = im.smask ? add(im.smask) : 0; xo.push(`/${im.name} ${add(im.body.replace("@@SMASK@@", sm ? `/SMask ${sm} 0 R` : ""))} 0 R`); } return xo; };
  const csOf = (v) => Object.entries(v.colorSpaces || {}).map(([k, q]) => `/${k} ${q}`).join(" ");
  const note = (v) => { for (const q of v.inks || []) inks.set(q.label, q); for (const t of v.notes || []) if (!notes.includes(t)) notes.push(t); };
  for (const [k, s] of srcs.entries()) { // one form per element, drawn about its own centre
    const v = await vec([{ ...s, x: 0, y: 0, rot: 0 }], [-s.w, -s.h, s.w, s.h]), xo = await images(v), cs = csOf(v);
    const id = add(`<< /Type /XObject /Subtype /Form /BBox [${f(-s.w * K)} ${f(-s.h * K)} ${f(s.w * K)} ${f(s.h * K)}] /Resources << ${cs ? `/ColorSpace << ${cs} >>` : ""}${xo.length ? ` /XObject << ${xo.join(" ")} >>` : ""} >> /Length ${v.ops.length} >>\nstream\n${v.ops}\nendstream`);
    forms[s.id] = `Fm${k + 1}`; pageXo.push(`/Fm${k + 1} ${id} 0 R`); note(v);
  }
  const c = ["q", `1 0 0 -1 ${f(x0 * K)} ${f((ph - y0) * K)} cm`]; // origin = the top-left CUT corner, y down, mm x K
  let pageCs = "";
  c.push("q", `${f(-B * K)} ${f(-B * K)} ${f((FW + 2 * B) * K)} ${f((FH + 2 * B) * K)} re W n`);
  if (floods.length) { const v = await vec(floods, field); c.push(v.ops); pageCs = csOf(v); note(v); }
  for (const it of copies) c.push(`q 1 0 0 1 ${f(it.x * K)} ${f(it.y * K)} cm /${forms[it.id.split("@")[0]]} Do Q`);
  c.push("Q");
  // trim ticks on every cut line, 1 mm outside the bleed (registration colour: all four plates)
  const ln = up === 4 ? 6 : 3.5, L = (ax, ay, bx, by) => `${f(ax * K)} ${f(ay * K)} m ${f(bx * K)} ${f(by * K)} l S`;
  c.push("1 1 1 1 K", "0.25 w", "[] 0 d");
  for (let i = 0; i <= n; i++) { const xx = i * g.W, yy = i * g.H; c.push(L(xx, -B - 1, xx, -B - 1 - ln), L(xx, FH + B + 1, xx, FH + B + 1 + ln), L(-B - 1, yy, -B - 1 - ln, yy), L(FW + B + 1, yy, FW + B + 1 + ln, yy)); }
  if (up === 4) { // registration marks, where the house file puts them (page mm -> field mm)
    const kap = 0.5522847498, r = 2.5;
    for (const [px, py] of [[pw / 2 - g.W / 2, m / 2], [pw / 2 + g.W / 2, ph - m / 2], [m / 2, ph / 2 + g.H / 2], [pw - m / 2, ph / 2 - g.H / 2]]) {
      const cx = (px - x0) * K, cy = (py - y0) * K, R = r * K, q = R * kap;
      c.push(`${f(cx + R)} ${f(cy)} m ${f(cx + R)} ${f(cy + q)} ${f(cx + q)} ${f(cy + R)} ${f(cx)} ${f(cy + R)} c ${f(cx - q)} ${f(cy + R)} ${f(cx - R)} ${f(cy + q)} ${f(cx - R)} ${f(cy)} c ${f(cx - R)} ${f(cy - q)} ${f(cx - q)} ${f(cy - R)} ${f(cx)} ${f(cy - R)} c ${f(cx + q)} ${f(cy - R)} ${f(cx + R)} ${f(cy - q)} ${f(cx + R)} ${f(cy)} c S`,
        L(px - x0 - r - 1.5, py - y0, px - x0 + r + 1.5, py - y0), L(px - x0, py - y0 - r - 1.5, px - x0, py - y0 + r + 1.5));
    }
  }
  if (grid) { // reference only: 10 mm grid from the cut (blue), centre lines, repeat tiles (magenta)
    c.push("0.35 0.6 0.95 RG", "0.15 w");
    for (let x = 0; x <= g.W + 1e-6; x += 10) c.push(L(x, 0, x, g.H));
    for (let y = 0; y <= g.H + 1e-6; y += 10) c.push(L(0, y, g.W, y));
    c.push("0.1 0.3 0.8 RG", "0.4 w", L(g.W / 2, -2, g.W / 2, g.H + 2), L(-2, g.H / 2, g.W + 2, g.H / 2));
    c.push("0.85 0.1 0.6 RG", "0.45 w", "[4 2] 0 d");
    for (let i = 0; i <= plan.nx; i++) c.push(L(i * plan.Px, -4, i * plan.Px, g.H + 4));
    for (let j = 0; j <= plan.ny; j++) c.push(L(-4, j * plan.Py, g.W + 4, j * plan.Py));
    c.push("[] 0 d", "0 0 0 RG", "0.5 w", `0 0 ${f(g.W * K)} ${f(g.H * K)} re S`);
  }
  c.push("Q");
  if (grid && caption) c.push(`BT /F1 6 Tf 0.2 0.2 0.2 rg 1 0 0 1 ${f(x0 * K)} ${f(3 * K)} Tm (${caption.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, "-")}) Tj ET`);
  const content = c.join("\n"), font = grid ? ` /Font << /F1 ${add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")} 0 R >>` : "";
  const box = (a, b2, c2, d) => `[${f(a * K)} ${f((ph - d) * K)} ${f(c2 * K)} ${f((ph - b2) * K)}]`;
  objs[2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw * K)} ${f(ph * K)}] /TrimBox ${box(x0, y0, x0 + FW, y0 + FH)} /BleedBox ${box(x0 - B, y0 - B, x0 + FW + B, y0 + FH + B)} /Contents 4 0 R /Resources << ${pageCs ? `/ColorSpace << ${pageCs} >> ` : ""}/XObject << ${pageXo.join(" ")} >>${font} >> >>`;
  objs[3] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return { pdf, sheetMm: [pw, ph], inks: [...inks.values()], notes, copies: copies.length, quadrants: up === 4 ? [[x0, y0], [x0 + g.W, y0], [x0, y0 + g.H], [x0 + g.W, y0 + g.H]] : [[x0, y0]] };
}
