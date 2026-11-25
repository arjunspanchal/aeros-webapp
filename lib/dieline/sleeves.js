// Sleeve dielines:
//   - Straight sleeve: open-ended wrap (tray sleeves, burger sleeves, soap
//     wraps) — glue flap + four body panels.
//   - Cup sleeve: tapered annular-sector unwrap for conical cups (same maths
//     family as a cup fan), with a glued overlap seam.

import { PT_PER_MM } from "./cakebox.js";

// thumbNotch (default true): the U notch on the front panel's top edge. Off on a matchbox sleeve (the drawer is pushed out
// from the other open end). window (default none): { w, h, r, fromFold, fromTop } mm - a rounded-rectangle window CUT in the
// front panel, fromFold = gap from the front | side crease, fromTop = gap from the top edge (Good Pet matchbox, 25-Nov-2026).
export function buildSleeveDieline({ L, W, H, thickness, units = "mm", thumbNotch = true, window: win = null }) {
  // L = face width, W = depth (side), H = sleeve height
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L);
  const Wm = toMm(W);
  const Hm = toMm(H);
  const t = +thickness > 0 ? +thickness : 0.5;

  const warnings = [];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  const g = 15;
  // slight per-panel growth (+t) so the sleeve slides over its tray
  const P1 = Lm + 2 * t;
  const P2 = Wm + 2 * t;
  const xs = [0, g, g + P1, g + P1 + P2, g + 2 * P1 + P2, g + 2 * P1 + 2 * P2];

  const segs = [];
  const line = (layer, x1, y1, x2, y2) => segs.push({ layer, kind: "l", pts: [[x1, y1], [x2, y2]] });
  for (let i = 1; i < 5; i++) line("crease", xs[i], 0, xs[i], Hm);
  line("cut", xs[1], 0, xs[5], 0);
  line("cut", xs[5], 0, xs[5], Hm);
  line("cut", xs[5], Hm, xs[1], Hm);
  // glue flap with chamfers
  line("cut", xs[1], 0, 3, 3);
  line("cut", 3, 3, 0, 8);
  line("cut", 0, 8, 0, Hm - 8);
  line("cut", 0, Hm - 8, 3, Hm - 3);
  line("cut", 3, Hm - 3, xs[1], Hm);
  // thumb notch on the front panel top edge
  const cxN = xs[1] + P1 / 2;
  const rN = Math.min(12, P1 / 6);
  if (thumbNotch) segs.push({ layer: "cut", kind: "c", pts: [[cxN - rN, 0], [cxN - rN, rN * 1.1], [cxN + rN, rN * 1.1], [cxN + rN, 0]] });

  // window in the front panel: rounded rectangle, corners as cubic arcs (k = 0.5523 x r)
  const winDims = [], S0 = PT_PER_MM;
  if (win && +win.w > 0 && +win.h > 0) {
    const ww = toMm(+win.w), wh = toMm(+win.h), r = Math.min(toMm(+win.r || 0), ww / 2, wh / 2);
    const x1 = xs[2] - toMm(+win.fromFold || 0), x0 = x1 - ww, y0 = toMm(+win.fromTop || 0), y1 = y0 + wh, c = 0.5523 * r;
    if (x0 < xs[1] + 3 || y1 > Hm - 3 || y0 < 3) warnings.push("Window runs within 3 mm of the front panel's edge - move or shrink it.");
    const web = Math.min(x0 - xs[1], xs[2] - x1);
    if (web < 8) warnings.push(`Window sits ${web.toFixed(1)} mm from a panel edge - under 8 mm of board left beside the fold. Check the sleeve keeps its shape.`);
    line("cut", x0 + r, y0, x1 - r, y0);
    line("cut", x1, y0 + r, x1, y1 - r);
    line("cut", x1 - r, y1, x0 + r, y1);
    line("cut", x0, y1 - r, x0, y0 + r);
    if (r > 0) for (const [px, py, sx, sy] of [[x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1], [x0, y0, 1, 1]]) {
      // corner at (px, py); the arc runs from the horizontal edge to the vertical edge
      segs.push({ layer: "cut", kind: "c", pts: [[px + sx * r, py], [px + sx * (r - c), py], [px, py + sy * (r - c)], [px, py + sy * r]] });
    }
    winDims.push(
      { x1: x0 * S0, y1: (y1 + 6) * S0, x2: x1 * S0, y2: (y1 + 6) * S0, valuePt: ww * S0, label: "window {v}", rotated: false },
      { x1: (x0 - 6) * S0, y1: y0 * S0, x2: (x0 - 6) * S0, y2: y1 * S0, valuePt: wh * S0, label: "window {v}", rotated: true },
      { x1: x1 * S0, y1: ((y0 + y1) / 2) * S0, x2: xs[2] * S0, y2: ((y0 + y1) / 2) * S0, valuePt: (xs[2] - x1) * S0, label: "{v}", rotated: false },
      { x1: (x1 + 4) * S0, y1: 0, x2: (x1 + 4) * S0, y2: y0 * S0, valuePt: y0 * S0, label: "{v}", rotated: true },
    );
    if (r > 0) winDims.push({ x1: (x0 + r) * S0, y1: (y0 + r + 10) * S0, x2: (x0 + r + 0.01) * S0, y2: (y0 + r + 10) * S0, valuePt: r * S0, label: "corner R {v}", rotated: false });
  }

  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: xs[5] * S, heightPt: Hm * S, flapDepthPt: null, style: "sleeve" };
  const dims = [
    ...winDims,
    { x1: xs[1] * S, y1: (Hm / 2) * S, x2: xs[2] * S, y2: (Hm / 2) * S, valuePt: P1 * S, rotated: false },
    { x1: xs[2] * S, y1: (Hm / 2 + 10) * S, x2: xs[3] * S, y2: (Hm / 2 + 10) * S, valuePt: P2 * S, rotated: false },
    { x1: (xs[5] + 6) * S, y1: 0, x2: (xs[5] + 6) * S, y2: Hm * S, valuePt: Hm * S, rotated: true },
    { x1: 0, y1: Hm * S + 17, x2: xs[5] * S, y2: Hm * S + 17, valuePt: xs[5] * S, rotated: false },
  ];
  return { segments, blank, dims, warnings, valid: true };
}

export function buildCupSleeveDieline({ L, W, H, units = "mm" }) {
  // L = cup Ø at sleeve TOP, W = cup Ø at sleeve BOTTOM, H = sleeve height
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const D1 = toMm(L);
  const D2 = toMm(W);
  const Hs = toMm(H);
  const overlap = 12;

  const warnings = [];
  if (!(D1 > 0) || !(D2 > 0) || !(Hs > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (D2 >= D1) {
    return { segments: [], blank: null, warnings: ["Top Ø must be larger than bottom Ø (cups taper)."], valid: false };
  }
  const slant = Math.sqrt(Hs * Hs + ((D1 - D2) / 2) ** 2);
  const R2 = (slant * D2) / (D1 - D2); // inner radius (bottom arc)
  const R1 = R2 + slant; // outer radius (top arc)
  const theta = (Math.PI * D1 + overlap) / R1; // wrap + glue overlap
  if (theta > Math.PI * 1.6) warnings.push("Very slack taper — the fan is extremely curved; check Ø inputs.");

  // fan centred on the apex at origin, opening downward; rotate so it is upright
  const a0 = Math.PI / 2 - theta / 2;
  const a1 = Math.PI / 2 + theta / 2;
  const pt = (R, a) => [R * Math.cos(a), R * Math.sin(a)];
  const segs = [];
  const arc = (R, from, to) => {
    // split into <=45° cubic segments
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / (Math.PI / 4)));
    for (let i = 0; i < n; i++) {
      const s = from + ((to - from) * i) / n;
      const e = from + ((to - from) * (i + 1)) / n;
      const k = (4 / 3) * Math.tan((e - s) / 4) * R;
      const [x1, y1] = pt(R, s);
      const [x2, y2] = pt(R, e);
      segs.push({
        layer: "cut",
        kind: "c",
        pts: [
          [x1, y1],
          [x1 - k * Math.sin(s), y1 + k * Math.cos(s)],
          [x2 + k * Math.sin(e), y2 - k * Math.cos(e)],
          [x2, y2],
        ],
      });
    }
  };
  arc(R1, a0, a1);
  arc(R2, a0, a1);
  segs.push({ layer: "cut", kind: "l", pts: [pt(R2, a0), pt(R1, a0)] });
  segs.push({ layer: "cut", kind: "l", pts: [pt(R2, a1), pt(R1, a1)] });
  // glue seam crease at overlap from one radial edge
  const aG = a0 + overlap / R1;
  segs.push({ layer: "crease", kind: "l", pts: [pt(R2, aG), pt(R1, aG)] });

  // normalise to blank origin + convert
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const s of segs) for (const [x, y] of s.pts) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [(x - minX) * S, (y - minY) * S]) }));
  const blank = { widthPt: (maxX - minX) * S, heightPt: (maxY - minY) * S, flapDepthPt: null, style: "cupsleeve" };
  const dims = [
    { x1: 0, y1: (maxY - minY) * S + 17, x2: (maxX - minX) * S, y2: (maxY - minY) * S + 17, valuePt: (maxX - minX) * S, rotated: false },
  ];
  return { segments, blank, dims, warnings, valid: true };
}
