// PIE BOX (hinged-lid tuck tray) — calibrated to the 66 Chuim production KLD
// "Pie Box 156 x 145 x 64 mm" (blank 424 x 482 mm, die-exact at that size).
//
// One blank, two halves hinged at the tray's front wall:
//
//   TRAY   across: t | wall H | t | return wall H | BASE L | wall H | t |
//                  return wall H | t     (double side walls — the return
//                  folds back inside, the 3 mm strips are the board gaps)
//          down:   back wall H (with corner ears) | BASE W | front wall H
//   LID    down:   lid panel (L - 2t) x W with a side flap H each side |
//                  lid front wall L (with ears)
//
// Corner ears run H + EAR_OUT wide so they wrap the doubled side wall and
// lock behind it. RED = cut, GREEN = crease.

import { PT_PER_MM } from "./cakebox.js";

const T = 3; // board gap strips on the doubled side walls (reference die)
const EAR_OUT = 25.9; // how far a corner ear reaches past the side wall
const EAR_IN = 6.1; // ear inset from the blank edge on the reference die

export function buildPieboxDieline({ L, W, H, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L); // base length (across the blank)
  const Wm = toMm(W); // base depth (down the blank)
  const Hm = toMm(H); // wall height

  const warnings = [
    "Hinged-lid pie box calibrated to the 66 Chuim production die (156 x 145 x 64) — the lid panel runs 2 board gaps narrower than the base so it drops inside the tray walls. Prototype the first cut at a new size.",
  ];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (Hm < 25) warnings.push("Wall under 25 mm — the doubled side wall and corner ears crowd; check the preview.");

  // x grid (reference: 0 3 67 70 134 290 354 357 421 424)
  const x = [0, T, T + Hm, 2 * T + Hm, 2 * T + 2 * Hm];
  x.push(x[4] + Lm, x[4] + Lm + Hm, x[4] + Lm + Hm + T, x[4] + Lm + 2 * Hm + T, x[4] + Lm + 2 * Hm + 2 * T);
  const BW = x[9];
  const xB0 = x[4], xB1 = x[5]; // base panel
  // y grid (reference: 0 64 209 273 418 482)
  const y = [0, Hm, Hm + Wm, 2 * Hm + Wm, 2 * Hm + 2 * Wm, 3 * Hm + 2 * Wm];
  const BH = y[5];
  const earL = xB0 - (Hm + EAR_OUT), earR = xB1 + (Hm + EAR_OUT);
  const lidIn = T, lx0 = xB0 + lidIn, lx1 = xB1 - lidIn; // lid panel
  const lfx0 = lx0 - Hm, lfx1 = lx1 + Hm; // lid side flaps

  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });
  const rect = (layer, x0, y0, x1, y1) => {
    line(layer, [x0, y0], [x1, y0]);
    line(layer, [x1, y0], [x1, y1]);
    line(layer, [x1, y1], [x0, y1]);
    line(layer, [x0, y1], [x0, y0]);
  };

  // ---- tray row (walls + base), cut edges ----
  line("cut", [x[0], y[1]], [x[0], y[2]]);
  line("cut", [x[9], y[1]], [x[9], y[2]]);
  line("cut", [x[0], y[1]], [earL, y[1]]);
  line("cut", [x[0], y[2]], [earL, y[2]]);
  line("cut", [x[9], y[1]], [earR, y[1]]);
  line("cut", [x[9], y[2]], [earR, y[2]]);
  // back + front walls with their corner ears
  for (const [ya, yb] of [[y[0], y[1]], [y[2], y[3]]]) {
    line("cut", [earL, ya], [earR, ya]);
    line("cut", [earL, ya], [earL, yb]);
    line("cut", [earR, ya], [earR, yb]);
  }
  // ---- lid ----
  line("cut", [lfx0, y[3]], [lfx0, y[4]]);
  line("cut", [lfx1, y[3]], [lfx1, y[4]]);
  line("cut", [lfx0, y[3]], [xB0, y[3]]);
  line("cut", [lfx1, y[3]], [xB1, y[3]]);
  line("cut", [lfx0, y[4]], [earL, y[4]]);
  line("cut", [lfx1, y[4]], [earR, y[4]]);
  line("cut", [earL, y[4]], [earL, y[5]]);
  line("cut", [earR, y[4]], [earR, y[5]]);
  line("cut", [earL, y[5]], [earR, y[5]]);

  // ---- creases ----
  // vertical: side walls, board gaps, base edges (tray row only)
  for (const xi of [x[1], x[2], x[3], x[4], x[5], x[6], x[7], x[8]]) line("crease", [xi, y[1]], [xi, y[2]]);
  // ears fold with the wall they belong to
  for (const [ya, yb] of [[y[0], y[1]], [y[2], y[3]]]) {
    for (const xi of [xB0, xB1]) line("crease", [xi, ya], [xi, yb]);
  }
  // horizontal: wall/base folds across the tray, lid hinge, lid front wall
  line("crease", [earL, y[1]], [earR, y[1]]);
  line("crease", [earL, y[2]], [earR, y[2]]);
  line("crease", [lfx0, y[3]], [lfx1, y[3]]); // lid hinge
  line("crease", [lfx0, y[4]], [lfx1, y[4]]); // lid front fold
  // lid side flap folds
  line("crease", [lx0, y[3]], [lx0, y[4]]);
  line("crease", [lx1, y[3]], [lx1, y[4]]);
  // lid front wall ears
  for (const xi of [xB0, xB1]) line("crease", [xi, y[4]], [xi, y[5]]);

  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([px, py]) => [px * S, py * S]) }));
  const blank = { widthPt: BW * S, heightPt: BH * S, flapDepthPt: Hm * S, style: "piebox" };
  const dims = [
    { x1: xB0 * S, y1: (y[1] + Wm / 2) * S, x2: xB1 * S, y2: (y[1] + Wm / 2) * S, valuePt: Lm * S, label: "base L {v}", rotated: false },
    { x1: (xB0 + 18) * S, y1: y[1] * S, x2: (xB0 + 18) * S, y2: y[2] * S, valuePt: Wm * S, label: "base W {v}", rotated: true },
    { x1: x[3] * S, y1: (y[1] + Wm / 2 + 24) * S, x2: x[4] * S, y2: (y[1] + Wm / 2 + 24) * S, valuePt: Hm * S, label: "wall {v}", rotated: false },
    { x1: (lx0 + 18) * S, y1: y[3] * S, x2: (lx0 + 18) * S, y2: y[4] * S, valuePt: Wm * S, label: "lid {v}", rotated: true },
    { x1: 0, y1: BH * S + 17, x2: BW * S, y2: BH * S + 17, valuePt: BW * S, rotated: false },
    { x1: (BW + 8) * S, y1: 0, x2: (BW + 8) * S, y2: BH * S, valuePt: BH * S, rotated: true },
  ];
  return { segments, blank, dims, warnings, valid: true, meta: { BW, BH, t: T, ear: Hm + EAR_OUT, lidW: Lm - 2 * lidIn } };
}
