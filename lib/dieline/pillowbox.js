// PILLOW BOX dieline (wrap / burrito box) — two curved faces sharing side
// creases, a crescent tuck flap at each end of each face, glued side seam.
//
// Construction (standard pillow box):
//   x: [ face W | face W | glue g ]
//   each end of each face: a CREASE arc (sagitta s) bulging outward from the
//   body, and a CUT arc (sagitta s + f) through the SAME two end points — so
//   every end flap is a lens/crescent that comes to a point at the side folds.
//   Pressing the ends shut rolls the faces out: erected depth D ~= 2 x s.
// Inputs: L = body length at the side folds, W = face width (flat),
// H = erected depth at the centre (0 = auto, s = 0.18 x W).
// The earlier engine stopped both arcs short of each other at the side folds,
// leaving an f-tall band joining the two faces' flaps — it could not tuck.

import { PT_PER_MM } from "./cakebox.js";

export function buildPillowboxDieline({ L, W, H, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L);
  const Wm = toMm(W);
  const Dm = +H > 0 ? toMm(+H) : 0;

  const warnings = [];
  if (!(Lm > 0) || !(Wm > 0)) {
    return { segments: [], blank: null, warnings: ["Length and width must be positive."], valid: false };
  }
  const s = Dm > 0 ? Dm / 2 : 0.18 * Wm; // end-crease sagitta (depth ~ 2s)
  const f = Math.max(10, Math.min(18, 0.15 * Wm)); // crescent flap depth at the centre
  const g = 15; // glue flap
  const gc = g * Math.tan((15 * Math.PI) / 180); // glue-flap end slant, 15 deg off square (cortex glue_flap_shape)
  const yT = s + f; // top crease chord (side-fold end points)
  const yBt = yT + Lm; // bottom crease chord
  const BH = yBt + s + f;
  const x1 = Wm, x2 = 2 * Wm, xE = 2 * Wm + g;
  warnings.push("Standard pillow-box construction — prototype the first cut.");
  if (Lm < Wm) warnings.push("Length shorter than width — unusual pillow proportions.");
  if (s > 0.3 * Wm) warnings.push(`Depth ${(2 * s).toFixed(0)} mm is deep for a ${Wm} mm face — the ends may not close flat; prototype.`);

  const segs = [];
  const line = (layer, xa, ya, xb, yb) => segs.push({ layer, kind: "l", pts: [[xa, ya], [xb, yb]] });
  // parabolic arc through apex via quadratic->cubic
  const arcQ = (layer, p0, apex, p2) => {
    const C = [apex[0], 2 * apex[1] - (p0[1] + p2[1]) / 2];
    const c1 = [p0[0] + (2 / 3) * (C[0] - p0[0]), p0[1] + (2 / 3) * (C[1] - p0[1])];
    const c2 = [p2[0] + (2 / 3) * (C[0] - p2[0]), p2[1] + (2 / 3) * (C[1] - p2[1])];
    segs.push({ layer, kind: "c", pts: [p0, c1, c2, p2] });
  };

  for (const [yc, dir] of [[yT, -1], [yBt, 1]]) {
    for (const xa of [0, x1]) {
      // crease arc (sagitta s) and crescent cut arc (sagitta s + f), shared end points
      arcQ("crease", [xa, yc], [xa + Wm / 2, yc + dir * s], [xa + Wm, yc]);
      arcQ("cut", [xa, yc], [xa + Wm / 2, yc + dir * (s + f)], [xa + Wm, yc]);
    }
    // glue flap end: one slant from the fold corner out to the flap edge
    line("cut", x2, yc, xE, yc - dir * gc);
  }
  // side edges + side creases + glue flap edge
  line("cut", 0, yT, 0, yBt);
  line("crease", x1, yT, x1, yBt);
  line("crease", x2, yT, x2, yBt);
  line("cut", xE, yT + gc, xE, yBt - gc);

  const S = PT_PER_MM;
  const segments = segs.map((sg) => ({ ...sg, pts: sg.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: xE * S, heightPt: BH * S, flapDepthPt: f * S, style: "pillowbox" };
  const dims = [
    { x1: 0, y1: (BH / 2) * S, x2: x1 * S, y2: (BH / 2) * S, valuePt: Wm * S, label: "face {v}", rotated: false },
    { x1: (xE + 6) * S, y1: yT * S, x2: (xE + 6) * S, y2: yBt * S, valuePt: Lm * S, label: "L at side folds {v}", rotated: true },
    { x1: (x1 / 2 + 6) * S, y1: (yT - s) * S, x2: (x1 / 2 + 6) * S, y2: yT * S, valuePt: s * S, label: "curve {v}", rotated: true },
    { x1: (x1 / 2 - 6) * S, y1: 0, x2: (x1 / 2 - 6) * S, y2: (yT - s) * S, valuePt: f * S, label: "flap {v}", rotated: true },
    { x1: x2 * S, y1: (BH / 2 + 10) * S, x2: xE * S, y2: (BH / 2 + 10) * S, valuePt: g * S, label: "glue {v}", rotated: false },
    { x1: 0, y1: BH * S + 17, x2: xE * S, y2: BH * S + 17, valuePt: xE * S, rotated: false },
    { x1: -10, y1: 0, x2: -10, y2: BH * S, valuePt: BH * S, rotated: true },
  ];
  return { segments, blank, dims, warnings, valid: true, meta: { sagitta: s, flap: f, depth: 2 * s, glue: g } };
}
