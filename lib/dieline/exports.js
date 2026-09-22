// Export a dieline (from lib/dieline/cakebox.js) as SVG, vector PDF, or DXF.
// All pure string builders — safe to run client-side, no dependencies.
//
// Colour convention follows the reference die (and Indian die-shop practice):
// RED = cut, GREEN = crease/fold, BLUE = dimension annotations (SVG/PDF only;
// the DXF carries only CUT and CREASE layers, which is what die makers want).

import { PT_PER_IN, PT_PER_MM } from "./cakebox.js";

const COLORS = {
  cut: { rgb: [1, 0, 0], hex: "#e11d1d", dxf: 1 },
  crease: { rgb: [0, 0.72, 0], hex: "#0aa10a", dxf: 3 },
  safe: { rgb: [0.95, 0.55, 0.05], hex: "#ef8e0c", dxf: 30, dash: "4 3" }, // artwork safe boundary (cup dies)
  dim: { rgb: [0.11, 0.44, 0.66], hex: "#1c6fa8", dxf: 5 },
};

export function fmtBoth(pt) {
  return `${(pt / PT_PER_IN).toFixed(2)}" / ${(pt / PT_PER_MM).toFixed(1)} mm`;
}

function fmtVal(pt, units) {
  return units === "mm" ? `${(pt / PT_PER_MM).toFixed(1)}` : `${(pt / PT_PER_IN).toFixed(2)}"`;
}

// ---------------------------------------------------------------- dimensions
// Blue dimension lines with arrowheads + a text label, mimicking the sample.
export function buildDimAnnotations(blank, units) {
  const { xA, xB, xC, xD, xE, yT, yB } = blank.panels;
  const W = blank.widthPt;
  const Hh = blank.heightPt;
  const dims = [];
  const add = (x1, y1, x2, y2, labelPt, rotated = false) =>
    dims.push({ x1, y1, x2, y2, label: fmtVal(labelPt, units) + (units === "mm" ? " mm" : ""), rotated });

  add(xA, yT + 29, xB, yT + 29, xB - xA); // L across lid panel
  add(xB, yT + 57, xC, yT + 57, xC - xB); // H across side panel
  const cx = (xC + xD) / 2;
  add(cx, yT, cx, yB, yB - yT, true); // W down the band
  add(0, Hh + 17, W, Hh + 17, W); // overall width
  add(xE + 31, 0, xE + 31, Hh, Hh, true); // overall height
  return dims;
}

// Engines may return their own `dims` array ({x1,y1,x2,y2,valuePt,rotated});
// otherwise fall back to the cake-box panel-based annotations.
function resolveDims(doc, units) {
  if (doc.dims) {
    return doc.dims.map((d) => ({
      ...d,
      // engines may pass a custom label (e.g. "Ø 137.8 mm"); {v} interpolates
      // the formatted measurement
      label: d.label
        ? d.label.replace("{v}", fmtVal(d.valuePt, units) + (units === "mm" ? " mm" : ""))
        : fmtVal(d.valuePt, units) + (units === "mm" ? " mm" : ""),
    }));
  }
  return buildDimAnnotations(doc.blank, units);
}


// Placement notes: engines may return `notes: [{ x, y, up, lines, size }]`
// (pt, blank coords). Each renders centred text whose letter-tops point in the
// `up` direction ("up" | "down" | "left" | "right") plus an arrow pointing
// that way — so artwork that sits sideways on the blank (e.g. non-woven box
// bags) is placed the right way round. SVG/PDF only, like the dimensions.
const NOTE_RGB = [0.42, 0.18, 0.55];
const NOTE_HEX = "#6b2e8c";
const UP_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function noteGeometry(n) {
  const u = UP_VEC[n.up] || UP_VEC.up;
  const r = [-u[1], u[0]]; // reading direction
  const size = n.size || 12;
  const lines = (n.lines || []).map((text, k) => {
    const sz = k === 0 ? size : size * 0.75;
    const w = text.length * sz * 0.52;
    const off = k === 0 ? 0 : -(size + (k - 1) * sz * 1.2) - 2; // later lines sit below
    const bx = n.x - r[0] * (w / 2) + u[0] * off;
    const by = n.y - r[1] * (w / 2) + u[1] * off;
    return { text, sz, bx, by };
  });
  const tail = [n.x + u[0] * (size + 6), n.y + u[1] * (size + 6)];
  const head = [n.x + u[0] * (size + 40), n.y + u[1] * (size + 40)];
  const barb = (s) => [head[0] - u[0] * 8 + r[0] * 5 * s, head[1] - u[1] * 8 + r[1] * 5 * s];
  const ang = { up: 0, left: 90, down: 180, right: -90 }[n.up] ?? 0; // CCW, y-up
  return { lines, tail, head, barbs: [barb(1), barb(-1)], ang };
}

// ----------------------------------------------------------------------- SVG
export function toSvg(doc, { units = "in", showDims = true, title = "" } = {}) {
  const { segments, blank } = doc;
  const pad = 40;
  const W = blank.widthPt + pad * 2;
  const H = blank.heightPt + pad * 2 + 24; // room for the footer note
  const parts = [];
  const px = (v) => +(v + pad).toFixed(2);
  const py = (v) => +(v + pad).toFixed(2);

  for (const s of segments) {
    const c = COLORS[s.layer].hex;
    if (s.kind === "l") {
      const [[x1, y1], [x2, y2]] = s.pts;
      const dash = COLORS[s.layer].dash ? ` stroke-dasharray="${COLORS[s.layer].dash}"` : "";
      parts.push(`<line x1="${px(x1)}" y1="${py(y1)}" x2="${px(x2)}" y2="${py(y2)}" stroke="${c}"${dash}/>`);
    } else {
      const [p0, p1, p2, p3] = s.pts;
      parts.push(
        `<path d="M ${px(p0[0])} ${py(p0[1])} C ${px(p1[0])} ${py(p1[1])}, ${px(p2[0])} ${py(p2[1])}, ${px(p3[0])} ${py(p3[1])}" fill="none" stroke="${c}"${COLORS[s.layer].dash ? ` stroke-dasharray="${COLORS[s.layer].dash}"` : ""}/>`,
      );
    }
  }

  if (showDims) {
    for (const d of resolveDims(doc, units)) {
      const c = COLORS.dim.hex;
      const [x1, y1, x2, y2] = [px(d.x1), py(d.y1), px(d.x2), py(d.y2)];
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" marker-start="url(#da)" marker-end="url(#db)"/>`);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const t = d.rotated ? ` transform="rotate(-90 ${mx} ${my})"` : "";
      parts.push(
        `<text x="${mx}" y="${my - 3}" text-anchor="middle" font-size="11" font-family="Helvetica, Arial, sans-serif" fill="${c}"${t}>${d.label}</text>`,
      );
    }
  }

  for (const n of doc.notes || []) {
    const g = noteGeometry(n);
    for (const L of g.lines) {
      parts.push(
        `<text x="${px(L.bx)}" y="${py(L.by)}" font-size="${L.sz}" font-weight="bold" font-family="Helvetica, Arial, sans-serif" fill="${NOTE_HEX}" transform="rotate(${-g.ang} ${px(L.bx)} ${py(L.by)})">${escXml(L.text)}</text>`,
      );
    }
    if (n.arrow === false) continue;
    parts.push(`<line x1="${px(g.tail[0])}" y1="${py(g.tail[1])}" x2="${px(g.head[0])}" y2="${py(g.head[1])}" stroke="${NOTE_HEX}" stroke-width="1.6"/>`);
    for (const b of g.barbs) parts.push(`<line x1="${px(g.head[0])}" y1="${py(g.head[1])}" x2="${px(b[0])}" y2="${py(b[1])}" stroke="${NOTE_HEX}" stroke-width="1.6"/>`);
  }

  if (title) {
    parts.push(
      `<text x="${pad}" y="${H - 10}" font-size="10" font-family="Helvetica, Arial, sans-serif" fill="#555">${escXml(title)} — RED = CUT · GREEN = CREASE · ORANGE DASH = ARTWORK SAFE — Aeros</text>`,
    );
  }

  const wMm = (W / PT_PER_MM).toFixed(2);
  const hMm = (H / PT_PER_MM).toFixed(2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}mm" height="${hMm}mm" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" stroke-width="0.7" fill="none">` +
    `<defs>` +
    `<marker id="da" markerWidth="8" markerHeight="8" refX="1" refY="3" orient="auto"><path d="M7 0 L1 3 L7 6" fill="none" stroke="${COLORS.dim.hex}"/></marker>` +
    `<marker id="db" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M1 0 L7 3 L1 6" fill="none" stroke="${COLORS.dim.hex}"/></marker>` +
    `</defs>` +
    parts.join("") +
    `</svg>`
  );
}

function escXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ----------------------------------------------------------------------- PDF
// Minimal single-page vector PDF, true scale (1 pt = 1/72 in).
export function toPdf(doc, { units = "in", showDims = true, title = "" } = {}) {
  const { segments, blank } = doc;
  const pad = 40;
  const W = blank.widthPt + pad * 2;
  const H = blank.heightPt + pad * 2 + 24;
  const Y = (v) => (H - (v + pad)).toFixed(2); // flip to PDF y-up
  const X = (v) => (v + pad).toFixed(2);

  const ops = ["0.7 w", "1 J 1 j"];
  let lastLayer = null;
  const setColor = (layer) => {
    if (layer !== lastLayer) {
      const [r, g, b] = COLORS[layer].rgb;
      ops.push(`${r} ${g} ${b} RG`);
      ops.push(COLORS[layer].dash ? "[3 2] 0 d" : "[] 0 d");
      lastLayer = layer;
    }
  };

  const ordered = [...segments].sort((a, b) => a.layer.localeCompare(b.layer));
  for (const s of ordered) {
    setColor(s.layer);
    if (s.kind === "l") {
      const [[x1, y1], [x2, y2]] = s.pts;
      ops.push(`${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S`);
    } else {
      const [p0, p1, p2, p3] = s.pts;
      ops.push(`${X(p0[0])} ${Y(p0[1])} m ${X(p1[0])} ${Y(p1[1])} ${X(p2[0])} ${Y(p2[1])} ${X(p3[0])} ${Y(p3[1])} c S`);
    }
  }

  if (showDims) {
    setColor("dim");
    for (const d of resolveDims(doc, units)) {
      ops.push(`${X(d.x1)} ${Y(d.y1)} m ${X(d.x2)} ${Y(d.y2)} l S`);
      // arrowheads
      ops.push(...arrowOps(d, X, Y));
      const mx = (d.x1 + d.x2) / 2;
      const my = (d.y1 + d.y2) / 2;
      const [r, g, b] = COLORS.dim.rgb;
      if (d.rotated) {
        ops.push(`BT /F1 9 Tf ${r} ${g} ${b} rg 0 1 -1 0 ${(+X(mx) - 4).toFixed(2)} ${Y(my)} Tm (${escPdf(d.label)}) Tj ET`);
      } else {
        ops.push(`BT /F1 9 Tf ${r} ${g} ${b} rg 1 0 0 1 ${(+X(mx) - d.label.length * 2.2).toFixed(2)} ${(+Y(my) + 4).toFixed(2)} Tm (${escPdf(d.label)}) Tj ET`);
      }
    }
  }

  for (const n of doc.notes || []) {
    const g = noteGeometry(n);
    const [r, gg, b] = NOTE_RGB;
    const c = Math.cos((g.ang * Math.PI) / 180).toFixed(4), sn = Math.sin((g.ang * Math.PI) / 180).toFixed(4);
    for (const L of g.lines) {
      ops.push(`BT /F2 ${L.sz.toFixed(1)} Tf ${r} ${gg} ${b} rg ${c} ${sn} ${(-sn).toFixed(4)} ${c} ${X(L.bx)} ${Y(L.by)} Tm (${escPdf(L.text)}) Tj ET`);
    }
    lastLayer = null;
    if (n.arrow === false) continue;
    ops.push(`${r} ${gg} ${b} RG [] 0 d 1.6 w`);
    ops.push(`${X(g.tail[0])} ${Y(g.tail[1])} m ${X(g.head[0])} ${Y(g.head[1])} l S`);
    for (const bb of g.barbs) ops.push(`${X(g.head[0])} ${Y(g.head[1])} m ${X(bb[0])} ${Y(bb[1])} l S`);
    ops.push("0.7 w");
    lastLayer = null;
  }

  if (title) {
    ops.push(`BT /F1 9 Tf 0.35 0.35 0.35 rg 1 0 0 1 ${pad} 14 Tm (${escPdf(title + " - RED = CUT / GREEN = CREASE - Aeros")}) Tj ET`);
  }

  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

function arrowOps(d, X, Y) {
  const a = 5;
  const ang = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
  const head = (x, y, dir) => {
    const o = [];
    for (const spread of [0.45, -0.45]) {
      const hx = x + dir * a * Math.cos(ang + spread);
      const hy = y + dir * a * Math.sin(ang + spread);
      o.push(`${X(x)} ${Y(y)} m ${X(hx)} ${Y(hy)} l S`);
    }
    return o;
  };
  return [...head(d.x1, d.y1, 1), ...head(d.x2, d.y2, -1)];
}

function escPdf(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "");
}

// ----------------------------------------------------------------------- DXF
// Minimal R12 ASCII DXF in millimetres. Layers: CUT (red), CREASE (green).
// Beziers are sampled into fine polylines for maximum CAD/die-shop
// compatibility (no SPLINE entities).
export function toDxf({ segments }) {
  const mm = (v) => (v / PT_PER_MM).toFixed(4);
  const lines = [];
  const push = (...vals) => lines.push(...vals);

  push("0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC");
  push("0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", "3");
  push("0", "LAYER", "2", "CUT", "70", "0", "62", "1", "6", "CONTINUOUS");
  push("0", "LAYER", "2", "CREASE", "70", "0", "62", "3", "6", "CONTINUOUS");
  push("0", "LAYER", "2", "SAFE", "70", "0", "62", "30", "6", "CONTINUOUS");
  push("0", "ENDTAB", "0", "ENDSEC");
  push("0", "SECTION", "2", "ENTITIES");

  // y is flipped so the die reads the same way up as the PDF/SVG.
  let maxY = 0;
  for (const s of segments) for (const p of s.pts) maxY = Math.max(maxY, p[1]);

  for (const s of segments) {
    if (s.layer === "dim") continue;
    const layer = s.layer === "cut" ? "CUT" : s.layer === "safe" ? "SAFE" : "CREASE";
    if (s.kind === "l") {
      const [[x1, y1], [x2, y2]] = s.pts;
      push("0", "LINE", "8", layer, "10", mm(x1), "20", mm(maxY - y1), "30", "0", "11", mm(x2), "21", mm(maxY - y2), "31", "0");
    } else {
      const pts = sampleBezier(s.pts, 24);
      push("0", "POLYLINE", "8", layer, "66", "1", "70", "0");
      for (const [x, y] of pts) push("0", "VERTEX", "8", layer, "10", mm(x), "20", mm(maxY - y), "30", "0");
      push("0", "SEQEND");
    }
  }

  push("0", "ENDSEC", "0", "EOF");
  return lines.join("\r\n");
}

function sampleBezier([p0, p1, p2, p3], n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}
