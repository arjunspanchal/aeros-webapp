// PILLOW BOX / WRAP (burrito) BOX dieline — calibrated to the WILDBEAN cafe
// production wrap-box die (Downloads/WRAP BOX WILDBEAN.pdf, 03-Oct-2026):
// 9" x 1.5" wrap box, blank 191 x 279.5 mm, die-exact at L 230 / W 89.5 / H 35.1.
//
//   x: [ face A (W - 0.5) | face B (W + 0.5) | glue 12 ]   (ref 89 | 90 | 12)
//   each end of each face = a LENS through the two side-fold points:
//     CUT arc bulging OUTWARD by s (the tuck flap edge)
//     CREASE arc bulging INWARD by s (the fold) — ref s = 17.55
//   pressing the ends shut rolls the faces out: erected depth ~= 2 x s.
//   Face B's top flap carries an R5 thumb notch at its centre.
//   Glue flap 12 mm: ends drop 15 mm to the fold corners; mid-length it is
//   relieved by two V-gaps either side of a small rounded tab (all fixed mm) —
//   the rounded U tab is the PULL TAB of a 15 mm TEAR STRIP: a double
//   perforation runs across both faces along the tab's two edges
//   (perf, default on; not drawn on the WILDBEAN die itself).
// The arc control points are the die-maker's own (slightly skewed) Béziers,
// stored as offsets — x relative to the face ends, y relative to s — so other
// sizes keep the same curve family.
// Inputs: L = length at the side folds, W = face width (mean of the two faces),
// H = erected depth at the centre (0 = auto, s = 0.196 x W as on the ref die).

import { PT_PER_MM } from "./cakebox.js";

const REF = { W: 89.5, s: 17.55 };
// die Bézier for the outward cut arc, chord y = 0, s = 17.55, face 89 / 90:
// c1 = start + 24.63 / -22.03, c2 = end - 25.76 / -24.77
const C1X = 24.63 / REF.W, C2X = 25.76 / REF.W;
const C1Y = 22.03 / REF.s, C2Y = 24.77 / REF.s;
const GLUE = 12, GLUE_DROP = 15;
const SPLIT = 0.5; // face A = W - 0.5, face B = W + 0.5 (ref 89 | 90)

export function buildPillowboxDieline({ L, W, H, perf = true, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L);
  const Wm = toMm(W);
  const Dm = +H > 0 ? toMm(+H) : 0;

  const warnings = [];
  if (!(Lm > 0) || !(Wm > 0)) {
    return { segments: [], blank: null, warnings: ["Length and width must be positive."], valid: false };
  }
  const s = Dm > 0 ? Dm / 2 : (REF.s / REF.W) * Wm; // lens half-height (depth ~ 2s)
  const exact = Math.abs(Lm - 230) < 0.05 && Math.abs(Wm - REF.W) < 0.05 && Math.abs(s - REF.s) < 0.05;
  warnings.push(exact
    ? "Die-exact to the WILDBEAN production wrap-box die (9\" x 1.5\")."
    : "Scaled from the WILDBEAN production wrap-box die (230 x 89.5, depth 35) — prototype the first cut at a new size.");
  if (Lm < Wm) warnings.push("Length shorter than width — unusual pillow proportions.");
  if (Lm < 2 * GLUE_DROP + 60) warnings.push("Length too short for the glue-flap relief notch — check the glue flap.");

  const wA = Wm - SPLIT, wB = Wm + SPLIT;
  const x0 = 0, x1 = wA, x2 = wA + wB, xE = x2 + GLUE;
  const yT = s; // top side-fold chord (cut arc apex sits at y = 0)
  const yB = yT + Lm; // bottom side-fold chord
  const BH = yB + s;

  const segs = [];
  const line = (layer, xa, ya, xb, yb) => segs.push({ layer, kind: "l", pts: [[xa, ya], [xb, yb]] });
  const cub = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });
  // lens arc on [xa, xb] at chord yc; out = +1 bulges away from the body
  const lens = (layer, xa, xb, yc, dirOut, out) => {
    const w = xb - xa, sg = dirOut * out;
    cub(layer, [xa, yc], [xa + C1X * w, yc + sg * C1Y * s], [xb - C2X * w, yc + sg * C2Y * s], [xb, yc]);
  };

  for (const [yc, dOut] of [[yT, -1], [yB, 1]]) {
    for (const [xa, xb] of [[x0, x1], [x1, x2]]) {
      lens("cut", xa, xb, yc, dOut, 1); // tuck-flap edge, outward
      lens("crease", xa, xb, yc, dOut, -1); // fold, inward
    }
  }

  // thumb notch: R5 semicircle at the centre of face B's TOP flap (as on the die)
  {
    const R = 5, cx = x1 + wB / 2, cy = yT - s * 0.964; // ref centre 0.63 below the 32.55 apex
    const K = 0.5523;
    // y of face B's top cut arc at a given x (bisect the Bézier parameter)
    const P0 = [x1, yT], P1 = [x1 + C1X * wB, yT - C1Y * s], P2 = [x2 - C2X * wB, yT - C2Y * s], P3 = [x2, yT];
    const bz = (t, i) => (1 - t) ** 3 * P0[i] + 3 * (1 - t) ** 2 * t * P1[i] + 3 * (1 - t) * t * t * P2[i] + t ** 3 * P3[i];
    const arcY = (x) => { let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (bz(m, 0) < x) lo = m; else hi = m; } return bz((lo + hi) / 2, 1); };
    line("cut", cx + R, arcY(cx + R), cx + R, cy); // notch walls up to the flap edge
    cub("cut", [cx + R, cy], [cx + R, cy + K * R], [cx + K * R, cy + R], [cx, cy + R]);
    cub("cut", [cx, cy + R], [cx - K * R, cy + R], [cx - R, cy + K * R], [cx - R, cy]);
    line("cut", cx - R, cy, cx - R, arcY(cx - R));
  }

  // side edge, side creases
  line("cut", x0, yT, x0, yB);
  line("crease", x1, yT, x1, yB);
  line("crease", x2, yT, x2, yB);

  // glue flap (die geometry, fixed mm): ends drop 15 to the fold corners;
  // relief at mid-length: V-gap, rounded tab (7.5 each side of centre), V-gap
  const ym = (yT + yB) / 2;
  line("cut", x2, yT, xE, yT + GLUE_DROP);
  line("cut", xE, yT + GLUE_DROP, xE, ym - 20);
  line("cut", xE, ym - 20, x2, ym - 7.5);
  line("cut", x2, ym - 7.5, x2 + 6, ym - 7.5); // tab top (ref 433 -> 439 at 157.6, curve to 445 / 165.1)
  cub("cut", [x2 + 6, ym - 7.5], [x2 + 9.3, ym - 7.5], [xE, ym - 4.12], [xE, ym]);
  line("cut", xE, ym, xE, ym + 1);
  cub("cut", [xE, ym + 1], [xE, ym + 4.58], [x2 + 9.66, ym + 7.5], [x2 + 6.8, ym + 7.5]);
  line("cut", x2 + 6.8, ym + 7.5, x2, ym + 7.5);
  line("cut", x2, ym + 7.5, xE, ym + 19.76);
  line("cut", xE, ym + 19.76, xE, yB - GLUE_DROP);
  line("cut", xE, yB - GLUE_DROP, x2, yB);

  // TEAR STRIP: a DOUBLE perforation across both faces along the edges of the
  // U tab on the glue flap (ym +/- 7.5) — the U is the pull tab; pulling it
  // zips a 15 mm band off so the top half lifts away to eat the shawarma
  // (Arjun 03-Oct-2026: "Its a double perforation along the U"; the lines are
  // not drawn on the WILDBEAN die). Real cut dashes so the die-maker sets
  // perforating rule: PERFORATE 1:1 (1 mm cut / 1 mm tie) per Arjun's kebab-box
  // reference ("Like this", 03-Oct-2026).
  const PERF_CUT = 1, PERF_TIE = 1, TAB_HALF = 7.5;
  if (perf) {
    for (const yp of [ym - TAB_HALF, ym + TAB_HALF]) {
      for (let x = x0; x < x2 - 0.01; x += PERF_CUT + PERF_TIE) line("cut", x, yp, Math.min(x + PERF_CUT, x2), yp);
    }
  }

  const S = PT_PER_MM;
  const segments = segs.map((sg) => ({ ...sg, pts: sg.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: xE * S, heightPt: BH * S, flapDepthPt: s * S, style: "pillowbox" };
  const dims = [
    { x1: x0 * S, y1: (ym + 30) * S, x2: x1 * S, y2: (ym + 30) * S, valuePt: wA * S, label: "face {v}", rotated: false },
    { x1: x1 * S, y1: (ym + 30) * S, x2: x2 * S, y2: (ym + 30) * S, valuePt: wB * S, label: "face {v}", rotated: false },
    { x1: x2 * S, y1: (ym - 30) * S, x2: xE * S, y2: (ym - 30) * S, valuePt: GLUE * S, label: "glue {v}", rotated: false },
    { x1: (xE + 8) * S, y1: yT * S, x2: (xE + 8) * S, y2: yB * S, valuePt: Lm * S, label: "L at side folds {v}", rotated: true },
    { x1: (wA / 2) * S, y1: 0, x2: (wA / 2) * S, y2: yT * S, valuePt: s * S, label: "lens {v}", rotated: true },
    { x1: 0, y1: BH * S + 17, x2: xE * S, y2: BH * S + 17, valuePt: xE * S, rotated: false },
    { x1: -10, y1: 0, x2: -10, y2: BH * S, valuePt: BH * S, rotated: true },
    ...(perf ? [
      { x1: -22, y1: yT * S, x2: -22, y2: (ym - TAB_HALF) * S, valuePt: (ym - TAB_HALF - yT) * S, label: "tear strip at {v}", rotated: true },
      { x1: (x0 + 20) * S, y1: (ym - TAB_HALF) * S, x2: (x0 + 20) * S, y2: (ym + TAB_HALF) * S, valuePt: 2 * TAB_HALF * S, label: "tear strip {v} \u00b7 perforate 1:1", rotated: true },
    ] : []),
  ];
  return { segments, blank, dims, warnings, valid: true, meta: { s, depth: 2 * s, faces: [wA, wB], glue: GLUE, exact, perf: perf ? { strip: [ym - TAB_HALF - yT, ym + TAB_HALF - yT], width: 2 * TAB_HALF, cut: PERF_CUT, tie: PERF_TIE } : null } };
}
