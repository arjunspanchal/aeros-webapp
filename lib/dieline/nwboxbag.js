// NON-WOVEN BOPP BOX BAG — print-cylinder keyline for laminated non-woven
// (BOPP) box bags, ultrasonically sealed with loop handles. Decoded from two
// vendor KLDs ("16X17X6 BOX BAG" and "18x17x7") and the Maharani cylinder
// layout — all three share one construction:
//
//   along the roll (x):  hem | H (face) | G (bottom) | H (face) | hem
//   across the roll (y): seal | G/2 | W | G/2 | seal
//
// The faces lie SIDEWAYS on the web: the bag's mouth is at the hem ends, so
// artwork on each face is rotated with its top toward the nearer hem (left
// face reads bottom-to-top, right face top-to-bottom). The G/2 bands above
// and below each face become the side gussets (each gusset = two halves
// joined by the edge seal, so the seal line runs up the middle of the
// gusset); the centre G panel is the bottom, with 45° corner folds from the
// face/gusset folds to the bottom centreline at the seal line.
// Hem (25 / 32.5 / 35 on the references) folds inside at the mouth and
// carries the handle ends; seal strip is 10 mm on all three.
// RED = trim, GREEN = fold / seal lines, ORANGE DASH = artwork safe.

import { PT_PER_MM } from "./cakebox.js";

const DEF_HEM = 32.5, DEF_SEAL = 10, SAFE = 10;

export function buildNwBoxBagKeyline({ L, W, H, windowW, windowH, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Wb = toMm(L); // bag width (face)
  const G = toMm(W); // gusset / bottom depth
  const Hb = toMm(H); // bag height
  const warnings = [];
  if (!(Wb > 0) || !(G > 0) || !(Hb > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  const hem = +windowW > 0 ? toMm(+windowW) : DEF_HEM;
  const seal = +windowH > 0 ? toMm(+windowH) : DEF_SEAL;
  warnings.push("Non-woven BOPP box bag: faces print SIDEWAYS — the top of each face's artwork points to the nearer hem (bag mouth). Handles are separate loops sealed under the hem.");

  const x = [0, hem, hem + Hb, hem + Hb + G, hem + 2 * Hb + G, 2 * hem + 2 * Hb + G];
  const xMid = hem + Hb + G / 2;
  const y = [0, seal, seal + G / 2, seal + G / 2 + Wb, seal + G + Wb, 2 * seal + G + Wb];
  const BW = x[5], BH = y[5];

  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });

  // trim
  line("cut", [0, 0], [BW, 0]);
  line("cut", [BW, 0], [BW, BH]);
  line("cut", [BW, BH], [0, BH]);
  line("cut", [0, BH], [0, 0]);
  // folds along the roll: hem | face | bottom | face | hem, bottom centreline
  for (const xi of [x[1], x[2], x[3], x[4], xMid]) line("crease", [xi, 0], [xi, BH]);
  // seal lines + face/gusset folds across the roll
  for (const yi of [y[1], y[2], y[3], y[4]]) line("crease", [0, yi], [BW, yi]);
  // bottom corner folds: 45° from each face/gusset fold corner to the bottom
  // centreline at the seal line
  for (const [yc, ys] of [[y[2], y[1]], [y[3], y[4]]]) {
    line("crease", [x[2], yc], [xMid, ys]);
    line("crease", [xMid, ys], [x[3], yc]);
  }
  // artwork-safe frames on both faces
  for (const [a, b] of [[x[1], x[2]], [x[3], x[4]]]) {
    const r = [a + SAFE, y[2] + SAFE, b - SAFE, y[3] - SAFE];
    line("safe", [r[0], r[1]], [r[2], r[1]]);
    line("safe", [r[2], r[1]], [r[2], r[3]]);
    line("safe", [r[2], r[3]], [r[0], r[3]]);
    line("safe", [r[0], r[3]], [r[0], r[1]]);
  }

  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([px, py]) => [px * S, py * S]) }));
  const blank = { widthPt: BW * S, heightPt: BH * S, flapDepthPt: hem * S, style: "nwboxbag" };

  // placement notes: faces + gusset halves point to their mouth (nearer hem)
  const cx1 = (x[1] + x[2]) / 2, cx2 = (x[3] + x[4]) / 2, cy = (y[2] + y[3]) / 2;
  const gy = [(y[1] + y[2]) / 2, (y[3] + y[4]) / 2];
  const notes = [
    { x: cx1 * S, y: cy * S, up: "left", size: 14, lines: ["PLACE ARTWORK HERE", "FACE 1  -  TOP OF BAG THIS WAY"] },
    { x: cx2 * S, y: cy * S, up: "right", size: 14, lines: ["PLACE ARTWORK HERE", "FACE 2  -  TOP OF BAG THIS WAY"] },
    { x: xMid * S, y: cy * S, up: "up", size: 10, arrow: false, lines: ["BOTTOM (BASE)"] },
  ];
  if (G >= 60) {
    for (const gyy of gy) {
      notes.push({ x: cx1 * S, y: gyy * S, up: "left", size: 8, lines: ["GUSSET - TOP THIS WAY"] });
      notes.push({ x: cx2 * S, y: gyy * S, up: "right", size: 8, lines: ["GUSSET - TOP THIS WAY"] });
    }
  }

  const dims = [
    { x1: x[0] * S, y1: -14, x2: x[1] * S, y2: -14, valuePt: hem * S, label: "hem {v}", rotated: false },
    { x1: x[1] * S, y1: -14, x2: x[2] * S, y2: -14, valuePt: Hb * S, label: "H {v}", rotated: false },
    { x1: x[2] * S, y1: -14, x2: x[3] * S, y2: -14, valuePt: G * S, label: "bottom {v}", rotated: false },
    { x1: x[3] * S, y1: -14, x2: x[4] * S, y2: -14, valuePt: Hb * S, label: "H {v}", rotated: false },
    { x1: (BW + 8) * S, y1: y[0] * S, x2: (BW + 8) * S, y2: y[1] * S, valuePt: seal * S, label: "seal {v}", rotated: true },
    { x1: (BW + 8) * S, y1: y[1] * S, x2: (BW + 8) * S, y2: y[2] * S, valuePt: (G / 2) * S, label: "G/2 {v}", rotated: true },
    { x1: (BW + 8) * S, y1: y[2] * S, x2: (BW + 8) * S, y2: y[3] * S, valuePt: Wb * S, label: "W {v}", rotated: true },
    { x1: (BW + 24) * S, y1: 0, x2: (BW + 24) * S, y2: BH * S, valuePt: BH * S, rotated: true },
    { x1: 0, y1: BH * S + 17, x2: BW * S, y2: BH * S + 17, valuePt: BW * S, rotated: false },
  ];
  return { segments, blank, dims, notes, warnings, valid: true, meta: { hem, seal, BW, BH } };
}
