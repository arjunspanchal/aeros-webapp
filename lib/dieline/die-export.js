// DIE-CUT FILE for the die maker (the "-DIE-CUT-vN-CDR" file): cut + crease ONLY — no text, no dimensions, no fonts,
// no layers, no fills. RED (1,0,0) = cut, GREEN (0,0.6,0) = crease, 0.5 pt strokes, 10 mm margin, true scale.
// Same house rules as the Python die files (opens in CorelDRAW: plain PDF 1.4, one content stream, open paths only).
import { PT_PER_MM } from "./cakebox.js";

const MARGIN_MM = 10;
const RGB = { cut: [1, 0, 0], crease: [0, 0.6, 0] };

function bounds(segments) {
  const xs = segments.flatMap((s) => s.pts.map((p) => p[0])), ys = segments.flatMap((s) => s.pts.map((p) => p[1]));
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function toDiePdf(doc) {
  const segs = doc.segments.filter((s) => s.layer === "cut" || s.layer === "crease");
  const m = MARGIN_MM * PT_PER_MM, b = bounds(segs);
  const W = b.x1 - b.x0 + 2 * m, H = b.y1 - b.y0 + 2 * m;
  const X = (x) => (x - b.x0 + m).toFixed(3), Y = (y) => (H - (y - b.y0 + m)).toFixed(3);
  const ops = ["0.5 w", "1 J 1 j", "[] 0 d"];
  for (const layer of ["crease", "cut"]) {
    ops.push(`${RGB[layer].join(" ")} RG`);
    for (const s of segs.filter((q) => q.layer === layer)) {
      const p = s.pts;
      if (s.kind === "l") ops.push(`${X(p[0][0])} ${Y(p[0][1])} m ${X(p[1][0])} ${Y(p[1][1])} l S`);
      else ops.push(`${X(p[0][0])} ${Y(p[0][1])} m ${X(p[1][0])} ${Y(p[1][1])} ${X(p[2][0])} ${Y(p[2][1])} ${X(p[3][0])} ${Y(p[3][1])} c S`);
    }
  }
  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(3)} ${H.toFixed(3)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export function toDieSvg(doc) {
  const segs = doc.segments.filter((s) => s.layer === "cut" || s.layer === "crease");
  const S = PT_PER_MM, m = MARGIN_MM, b = bounds(segs);
  const W = (b.x1 - b.x0) / S + 2 * m, H = (b.y1 - b.y0) / S + 2 * m;
  const P = (p) => `${((p[0] - b.x0) / S + m).toFixed(3)},${((p[1] - b.y0) / S + m).toFixed(3)}`;
  const path = (layer) => segs.filter((q) => q.layer === layer)
    .map((s) => (s.kind === "l" ? `M${P(s.pts[0])}L${P(s.pts[1])}` : `M${P(s.pts[0])}C${P(s.pts[1])} ${P(s.pts[2])} ${P(s.pts[3])}`)).join("");
  const stroke = 0.5 / S;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(3)}mm" height="${H.toFixed(3)}mm" viewBox="0 0 ${W.toFixed(3)} ${H.toFixed(3)}">\n` +
    `<path d="${path("crease")}" fill="none" stroke="rgb(0,153,0)" stroke-width="${stroke.toFixed(4)}"/>\n` +
    `<path d="${path("cut")}" fill="none" stroke="rgb(255,0,0)" stroke-width="${stroke.toFixed(4)}"/>\n</svg>\n`;
}
