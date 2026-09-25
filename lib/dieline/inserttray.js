// INSERT TRAY (round cavities) — drop-in tray that holds round items (pies,
// tarts, cupcakes, dip pots) in a grid of petal-cut cavities, per the pie-box
// insert Arjun supplied (4 pies 2x2 around a centre dip pot).
//
// Each cavity is cut UNDER size and slit into tabs: a cut circle at
// (Ø - 2 x TAB), radial slits out to a crease circle at Ø, so the tabs fold
// down and grip the item instead of it dropping through. Same trick as the
// cup-carrier hole, but split into fingers so one tray fits a size range.
//
// Inputs: L x W = tray footprint (box internal minus ~1 mm each side),
// H = rim height, cellsX/cellsY = cavity grid, windowW = cavity Ø,
// windowH = centre pot Ø (0 = none). RED = cut, GREEN = crease.

import { PT_PER_MM } from "./cakebox.js";

const KAPPA = 0.5522847498;
const TAB = 6; // how far each gripping tab reaches into the cavity
const SLITS = 12; // tabs per cavity
const SLIT_W = 1.2; // slit opening so the tabs clear each other when folded
const EAR = 18; // corner ear that locks the rim together

export function buildInserttrayDieline({ L, W, H, cellsX = 2, cellsY = 2, windowW, windowH, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L), Wm = toMm(W), Hm = toMm(H);
  const nx = Math.max(1, Math.round(cellsX)), ny = Math.max(1, Math.round(cellsY));

  const warnings = ["Drop-in insert tray — cavities are cut under size and slit into tabs that fold down and grip. Size the tray ~1 mm under the box internal on each side."];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  const cellW = Lm / nx, cellH = Wm / ny;
  const cav = +windowW > 0 ? toMm(+windowW) : Math.max(20, Math.min(cellW, cellH) - 12);
  const pot = +windowH > 0 ? toMm(+windowH) : 0;
  if (cav > Math.min(cellW, cellH) - 6) warnings.push("Cavity leaves under 6 mm of web between cells — reduce the cavity Ø or the grid.");

  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });
  const bez = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });
  const circle = (layer, cx, cy, r) => {
    const k = KAPPA * r;
    bez(layer, [cx + r, cy], [cx + r, cy - k], [cx + k, cy - r], [cx, cy - r]);
    bez(layer, [cx, cy - r], [cx - k, cy - r], [cx - r, cy - k], [cx - r, cy]);
    bez(layer, [cx - r, cy], [cx - r, cy + k], [cx - k, cy + r], [cx, cy + r]);
    bez(layer, [cx, cy + r], [cx + k, cy + r], [cx + r, cy + k], [cx + r, cy]);
  };
  // petal cavity: cut opening + crease ring + radial slits between the tabs
  const cavity = (cx, cy, dia) => {
    const rOut = dia / 2, rIn = Math.max(4, rOut - TAB);
    circle("cut", cx, cy, rIn);
    circle("crease", cx, cy, rOut);
    for (let i = 0; i < SLITS; i++) {
      const a = (i / SLITS) * 2 * Math.PI + Math.PI / SLITS;
      const d = SLIT_W / 2 / rIn;
      for (const s of [-1, 1]) {
        const t = a + s * d;
        line("cut", [cx + rIn * Math.cos(t), cy + rIn * Math.sin(t)], [cx + rOut * Math.cos(a), cy + rOut * Math.sin(a)]);
      }
    }
  };

  // ---- blank: base with a rim wall on each side and corner ears ----
  const x0 = 2 * Hm + EAR, y0 = Hm, x1 = x0 + Lm, y1 = Hm + Wm;
  const BW = Lm + 2 * Hm + 2 * (Hm + EAR), BH = Wm + 2 * Hm;
  // cross-shaped blank: base + a wall on each side; corner ears on the
  // left/right walls fold behind the end walls and glue
  const pts = [
    [x0, 0], [x1, 0], [x1, y0], [x1 + Hm + EAR, y0], [x1 + Hm + EAR, y0 + Hm],
    [BW, y0 + Hm], [BW, y1 - Hm], [x1 + Hm + EAR, y1 - Hm], [x1 + Hm + EAR, y1],
    [x1, y1], [x1, BH], [x0, BH], [x0, y1], [x0 - Hm - EAR, y1],
    [x0 - Hm - EAR, y1 - Hm], [0, y1 - Hm], [0, y0 + Hm], [x0 - Hm - EAR, y0 + Hm],
    [x0 - Hm - EAR, y0], [x0, y0],
  ];
  for (let i = 0; i < pts.length; i++) line("cut", pts[i], pts[(i + 1) % pts.length]);
  // rim creases (base edges) + ear folds
  line("crease", [x0, y0], [x1, y0]);
  line("crease", [x0, y1], [x1, y1]);
  line("crease", [x0, y0], [x0, y1]);
  line("crease", [x1, y0], [x1, y1]);
  line("crease", [x1 + Hm, y0], [x1 + Hm, y1]);
  line("crease", [x0 - Hm, y0], [x0 - Hm, y1]);

  // ---- cavities ----
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      cavity(x0 + (i + 0.5) * cellW, y0 + (j + 0.5) * cellH, cav);
    }
  }
  if (pot > 0) cavity(x0 + Lm / 2, y0 + Wm / 2, pot);

  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([px, py]) => [px * S, py * S]) }));
  const blank = { widthPt: BW * S, heightPt: BH * S, flapDepthPt: Hm * S, style: "inserttray" };
  const dims = [
    { x1: x0 * S, y1: (y0 - 8) * S, x2: x1 * S, y2: (y0 - 8) * S, valuePt: Lm * S, label: "tray L {v}", rotated: false },
    { x1: (x0 - 8) * S, y1: y0 * S, x2: (x0 - 8) * S, y2: y1 * S, valuePt: Wm * S, label: "tray W {v}", rotated: true },
    { x1: (x0 + cellW / 2 - cav / 2) * S, y1: (y0 + cellH / 2) * S, x2: (x0 + cellW / 2 + cav / 2) * S, y2: (y0 + cellH / 2) * S, valuePt: cav * S, label: "cavity Ø {v}", rotated: false },
    { x1: 0, y1: BH * S + 17, x2: BW * S, y2: BH * S + 17, valuePt: BW * S, rotated: false },
  ];
  if (pot > 0) {
    dims.push({ x1: (x0 + Lm / 2 - pot / 2) * S, y1: (y0 + Wm / 2 - pot / 2 - 8) * S, x2: (x0 + Lm / 2 + pot / 2) * S, y2: (y0 + Wm / 2 - pot / 2 - 8) * S, valuePt: pot * S, label: "pot Ø {v}", rotated: false });
  }
  return { segments, blank, dims, warnings, valid: true, meta: { BW, BH, cav, pot, cellW, cellH, tab: TAB } };
}
