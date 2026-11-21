// THE PRINTER'S CUP SET - LAYOUT / ARTWORK-PUNCH / PUNCH on the printer's own nested sheet, the way the Blueline and
// Lucky Offset files are made (checked against their real sets, 21-Nov-2026):
//   LAYOUT         artwork + register marks + page border + every cup outline + size labels
//   ARTWORK-PUNCH  artwork + register marks + page border (no outlines)
//   PUNCH          register marks + page border + every cup outline + size labels (no artwork)
// One page = the nest exactly; PDF 1.4; no fonts, no layers, no images unless the artwork itself has one; Pantone plates
// kept; register marks in the registration colour (/Separation /All); outlines, border and labels in K100, 0.5 pt.
// The nest (cup-nest-refs.js) is the printer's punch file, verbatim. The single-cup artwork is stamped once per cup:
// turned with its cup (the middle column is turned 180 deg, never mirrored), clipped to the KLD's bleed line, and kept
// KNIFE_CLEAR mm away from every neighbouring knife.
import { PT_PER_MM } from "../cakebox.js";

const K = PT_PER_MM, f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(3)).toString());
export const KNIFE_CLEAR = 1.2; // mm - artwork to a neighbour's knife (cortex: >= 1.17)

const path = (segs) => segs.map((s) => (s[0] === "l" ? `${f(s[1][0] * K)} ${f(s[1][1] * K)} m ${f(s[2][0] * K)} ${f(s[2][1] * K)} l` : `${f(s[1][0] * K)} ${f(s[1][1] * K)} m ${f(s[2][0] * K)} ${f(s[2][1] * K)} ${f(s[3][0] * K)} ${f(s[3][1] * K)} ${f(s[4][0] * K)} ${f(s[4][1] * K)} c`));

/** where the single-cup frame lands for one cup of the nest: rotation (deg) about the cone centre, then centre to centre */
export function fanPlacement(g, fan) {
  const a = (fan.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // page = R(rot) * (p - cupCentre) + nestCentre
  return { a: c, b: s, c: -s, d: c, e: fan.centre[0] - (c * g.cx - s * g.cy), f: fan.centre[1] - (s * g.cx + c * g.cy), rot: fan.rot };
}
export const placePoint = (m, [x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

// a neighbour's knife grown by `d` mm, as a polygon on the page (an annular sector about its own centre)
function grownFan(g, fan, d) {
  const m = fanPlacement(g, fan), pts = [], r0 = g.rBot - d, r1 = g.rTop + d, a0 = g.aLeft - d / g.rBot, a1 = g.aRight + d / g.rBot, n = 40;
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push(placePoint(m, [g.cx + r1 * Math.sin(a), g.cy - r1 * Math.cos(a)])); }
  for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; pts.push(placePoint(m, [g.cx + r0 * Math.sin(a), g.cy - r0 * Math.cos(a)])); }
  return pts;
}

/** nest = CUP_NEST_REFS[id]; g = cupGeometry(cup); vector = artworkToPdf(...) for ONE cup (KLD frame) or null; mode */
export function cupNestPdf({ nest, g, vector = null, mode = "layout" }) {
  const PW = nest.page[0] * K, PH = nest.page[1] * K;
  const showArt = mode !== "punch" && !!vector, showFans = mode !== "artpunch", showLabels = mode !== "artpunch";
  const objs = [];
  const add = (b) => { objs.push(b); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add("PAGE"); add("CONTENT");
  let artNo = 0;
  if (showArt) {
    const xo = [];
    for (const im of vector.images || []) { const sm = im.smask ? add(im.smask) : 0; xo.push(`/${im.name} ${add(im.body.replace("@@SMASK@@", sm ? `/SMask ${sm} 0 R` : ""))} 0 R`); }
    const cs = Object.entries(vector.colorSpaces || {}).map(([k, v]) => `/${k} ${v}`).join(" ");
    const res = `${cs ? `/ColorSpace << ${cs} >>` : ""}${xo.length ? ` /XObject << ${xo.join(" ")} >>` : ""}`;
    artNo = add(`<< /Type /XObject /Subtype /Form /BBox [${f(-20 * K)} ${f(-20 * K)} ${f((g.w + 20) * K)} ${f((g.h + 20) * K)}] /Resources << ${res} >> /Length ${vector.ops.length} >>\nstream\n${vector.ops}\nendstream`);
  }
  const c = ["q", `1 0 0 -1 0 ${f(PH)} cm`, "1 J 1 j"]; // page frame, y down like the nest
  if (showArt) {
    nest.fans.forEach((fan, i) => {
      const m = fanPlacement(g, fan);
      c.push("q");
      // keep clear of every other cup's knife: clip to the page minus each neighbour grown by KNIFE_CLEAR (even-odd)
      nest.fans.forEach((other, j) => {
        if (j === i) return;
        if (Math.hypot(other.centre[0] - fan.centre[0], other.centre[1] - fan.centre[1]) > 1400) return;
        const poly = grownFan(g, other, KNIFE_CLEAR + (nest.fit?.max || 0)); // + how far the printer's drawn cup can sit off the die
        c.push(`0 0 ${f(PW)} ${f(PH)} re ` + poly.map((p, k) => `${f(p[0] * K)} ${f(p[1] * K)} ${k ? "l" : "m"}`).join(" ") + " h W* n");
      });
      // single-cup frame (pt, y down) -> page
      c.push(`${f(m.a)} ${f(m.b)} ${f(m.c)} ${f(m.d)} ${f(m.e * K)} ${f(m.f * K)} cm`, "/Art Do", "Q");
    });
  }
  // Line style = the printer's own file. Most sets: outlines, border and labels K100 0.5 pt, register marks in the
  // registration colour (they print on every plate). The 12 oz single-wall Blueline set instead carries its outlines in a
  // 'Dieline' spot at 0.24 pt and has no register marks or labels: its frame lines are Dieline on the PUNCH file and
  // black on the files that carry artwork - kept exactly so.
  const die = nest.style?.spot === "Dieline", lw = f(nest.style?.w || 0.5);
  const outline = die ? `/Die CS 1 SCN /Die cs 1 scn ${lw} w` : `0 0 0 1 K 0 0 0 1 k ${lw} w`;
  if (die) c.push(mode === "punch" ? outline : `0 0 0 1 K ${lw} w`, ...path(nest.marks).map((p) => `${p} S`));
  else c.push("/Reg CS 1 SCN 0.5 w", ...path(nest.marks).map((p) => `${p} S`));
  c.push(outline);
  if (nest.border.length) c.push(`${f(nest.border[0][1][0] * K)} ${f(nest.border[0][1][1] * K)} m ` + nest.border.map((s) => `${f(s[2][0] * K)} ${f(s[2][1] * K)} l`).join(" ") + " h S");
  if (showLabels) for (const lab of nest.labels) {
    // label outlines: consecutive segments that join form one sub-path
    const out = []; let last = null;
    for (const s of lab) {
      const a = s[1], b = s[s.length - 1];
      if (!last || Math.hypot(a[0] - last[0], a[1] - last[1]) > 0.01) out.push(`${out.length ? "h " : ""}${f(a[0] * K)} ${f(a[1] * K)} m`);
      out.push(s[0] === "l" ? `${f(b[0] * K)} ${f(b[1] * K)} l` : `${f(s[2][0] * K)} ${f(s[2][1] * K)} ${f(s[3][0] * K)} ${f(s[3][1] * K)} ${f(b[0] * K)} ${f(b[1] * K)} c`);
      last = b;
    }
    c.push(out.join(" ") + " h f");
  }
  if (showFans) for (const fan of nest.fans) {
    const out = []; let last = null;
    for (const s of fan.segs) {
      const a = s[1], b = s[s.length - 1];
      if (!last || Math.hypot(a[0] - last[0], a[1] - last[1]) > 0.01) out.push(`${f(a[0] * K)} ${f(a[1] * K)} m`);
      out.push(s[0] === "l" ? `${f(b[0] * K)} ${f(b[1] * K)} l` : `${f(s[2][0] * K)} ${f(s[2][1] * K)} ${f(s[3][0] * K)} ${f(s[3][1] * K)} ${f(b[0] * K)} ${f(b[1] * K)} c`);
      last = b;
    }
    c.push(out.join(" ") + " S");
  }
  c.push("Q");
  const content = c.join("\n");
  const reg = "[/Separation /All /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [1 1 1 1] /N 1 >>]";
  objs[2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(PW)} ${f(PH)}] /Contents 4 0 R /Resources << /ColorSpace << /Reg ${reg}${nest.style?.spot === "Dieline" ? " /Die [/Separation /Dieline /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>]" : ""} >>${artNo ? ` /XObject << /Art ${artNo} 0 R >>` : ""} >> >>`;
  objs[3] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
