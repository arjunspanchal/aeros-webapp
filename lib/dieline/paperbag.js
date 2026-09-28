// Paper bag KEYLINE (flat blank / artwork layout) — SOS, handle and V-bottom.
//
// Geometry follows the SAME blank maths as the Aeros bag rate calculator
// (lib/calc/calculator.js), so the keyline and the costing always agree:
//   pasting seam pw : W <= 100 -> 15, W <= 300 -> 20, else 25 mm
//   blank width     : 2W + 2G + pw
//   bottom fold     : SOS / handle -> 0.75 x G ; V-bottom -> 15 mm
// Panel order on the flat blank (left to right):
//   seam | FRONT (W) | gusset (G, centre fold) | BACK (W) | gusset (G, centre fold)
// The SOS bottom carries the classic 45-degree diamond folds at each gusset
// centre. Handle bags add a top turnover hem (default 35 mm — NOTE: the rate
// calculator's paper height excludes the hem, so consumption for hemmed bags
// runs that much higher).
//
// Bags are machine-formed, not die-cut: RED here is the blank outline (trim),
// GREEN the fold lines — the sheet a printer needs for artwork placement.

import { PT_PER_MM } from "./cakebox.js";

export const BAG_TYPES = [
  { id: "sos", label: "SOS (flat top)" },
  { id: "handle", label: "Handle bag (turnover top)" },
  { id: "v_bottom", label: "V-bottom" },
];

export function buildPaperbagKeyline({ L, W, H, bagType = "sos", hem, windowW, bottomFold, flapRadius, units = "mm" }) {
  // L = bag width Wb, W = gusset G, H = bag height (matches W x G x H convention)
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Wb = toMm(L);
  const G = toMm(W);
  const Hb = toMm(H);

  const warnings = [];
  if (!(Wb > 0) || !(G > 0) || !(Hb > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  const pw = Wb <= 100 ? 15 : Wb <= 300 ? 20 : 25;
  const isV = bagType === "v_bottom";
  // V-bottom paste fold: 15 mm machine default (matches the rate calculator);
  // handmade tamper pouches use a deeper fold (25 mm on the HomeRun sample)
  const bottom = isV ? (+bottomFold > 0 ? toMm(+bottomFold) : 15) : 0.75 * G;
  if (isV && +bottomFold > 0 && Math.abs(bottom - 15) > 0.01) warnings.push(`Bottom paste fold ${bottom} mm (rate calculator assumes 15 mm).`);
  const hemMm = bagType === "handle" ? (+hem >= 0 ? +hem : 35) : +hem > 0 ? +hem : 0;
  if (G > Wb) warnings.push("Gusset wider than the bag face — check W / G order (bags are W x G x H).");
  if (bagType === "handle" && hemMm > 0) {
    warnings.push(`Top hem of ${hemMm} mm added — rate-calculator paper height excludes it.`);
  }

  // optional tamper flap: a fold-over seal flap on the BACK panel, extending
  // above the mouth (chamfered ends so it clears the gussets when folded over)
  const flap = +windowW > 0 ? toMm(+windowW) : 0;
  const FLAP_TAPER = 12;
  // Die-makers radius the flap's outer corners: a sharp point on a fold-over
  // seal flap dog-ears in the stack and starts a tear at the seal line
  // (Arjun 2026-09-28, HomeRun V-bottom pouch). 4 mm default; 0 = square.
  const flapR = +flapRadius >= 0 ? toMm(+flapRadius) : 4;
  if (flap > 0) warnings.push(`Tamper flap of ${flap} mm on the back panel — folds over the mouth to seal (adhesive strip under the flap); rate-calculator paper height excludes it.`);

  const BW = pw + 2 * Wb + 2 * G;
  const yTop = flap;
  const BH = flap + hemMm + Hb + bottom;

  const segs = [];
  const line = (layer, x1, y1, x2, y2) => segs.push({ layer, kind: "l", pts: [[x1, y1], [x2, y2]] });
  const bez = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });
  // Filleted polyline: walks pts and rounds every interior vertex with radius r,
  // emitting each straight ONCE. Arc handle length is (4/3)tan(a/4)r, which
  // reduces to the usual kappa*r at 90 degrees. r is clamped per-vertex to half
  // the shorter adjoining leg, so a big radius degrades to a square corner
  // instead of overrunning the neighbour.
  const filletPath = (layer, pts, r) => {
    const n = pts.length;
    let cur = pts[0];
    for (let k = 1; k < n - 1; k++) {
      const P0 = pts[k - 1], P1 = pts[k], P2 = pts[k + 1];
      const v1 = [P0[0] - P1[0], P0[1] - P1[1]], v2 = [P2[0] - P1[0], P2[1] - P1[1]];
      const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
      if (!(l1 > 0) || !(l2 > 0)) continue;
      const u1 = [v1[0] / l1, v1[1] / l1], u2 = [v2[0] / l2, v2[1] / l2];
      const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
      const half = Math.tan(theta / 2);
      const rr = Math.min(r, 0.5 * l1 * half, 0.5 * l2 * half);
      if (!(rr > 0.05) || theta < 0.02 || Math.PI - theta < 0.02) {
        line(layer, cur[0], cur[1], P1[0], P1[1]);
        cur = P1;
        continue;
      }
      const t = rr / half;
      const T1 = [P1[0] + u1[0] * t, P1[1] + u1[1] * t];
      const T2 = [P1[0] + u2[0] * t, P1[1] + u2[1] * t];
      const h = (4 / 3) * Math.tan((Math.PI - theta) / 4) * rr;
      line(layer, cur[0], cur[1], T1[0], T1[1]);
      bez(layer, T1, [T1[0] - u1[0] * h, T1[1] - u1[1] * h], [T2[0] - u2[0] * h, T2[1] - u2[1] * h], T2);
      cur = T2;
    }
    line(layer, cur[0], cur[1], pts[n - 1][0], pts[n - 1][1]);
  };

  // vertical panel folds: seam | front | gusset(centre) | back | gusset(centre)
  const xSeam = pw;
  const xFrontEnd = pw + Wb;
  const xG1c = xFrontEnd + G / 2;
  const xG1e = xFrontEnd + G;
  const xBackEnd = xG1e + Wb;
  const xG2c = xBackEnd + G / 2;

  // blank outline (trim) — with the tamper flap rising over the back panel
  if (flap > 0) {
    line("cut", 0, yTop, xG1e, yTop);
    // the flap's two OUTER corners are filleted (flapR); the slant->mouth
    // junctions stay sharp so the flap fold reaches the full panel width
    filletPath("cut", [
      [xG1e, yTop],
      [xG1e + FLAP_TAPER, 0],
      [xBackEnd - FLAP_TAPER, 0],
      [xBackEnd, yTop],
    ], flapR);
    line("cut", xBackEnd, yTop, BW, yTop);
    line("crease", xG1e, yTop, xBackEnd, yTop); // flap fold at the mouth
  } else {
    line("cut", 0, 0, BW, 0);
  }
  line("cut", BW, yTop, BW, BH);
  line("cut", BW, BH, 0, BH);
  line("cut", 0, BH, 0, yTop);

  for (const x of [xSeam, xFrontEnd, xG1c, xG1e, xBackEnd, xG2c]) line("crease", x, yTop, x, BH);

  // top hem
  if (hemMm > 0) line("crease", 0, yTop + hemMm, BW, yTop + hemMm);

  // bottom fold + SOS diamond diagonals: 45° from each gusset EDGE at the fold
  // line, meeting at the gusset centreline G/2 below (the diamond point).
  const yB = BH - bottom;
  line("crease", 0, yB, BW, yB);
  if (!isV) {
    for (const cg of [xG1c, xG2c]) {
      line("crease", cg - G / 2, yB, cg, yB + G / 2);
      line("crease", cg + G / 2, yB, cg, yB + G / 2);
    }
  }

  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: BW * S, heightPt: BH * S, flapDepthPt: bottom * S, style: "paperbag" };

  const yMid = (flap + hemMm + Hb / 2) * S;
  const dims = [
    { x1: xSeam * S, y1: yMid, x2: xFrontEnd * S, y2: yMid, valuePt: Wb * S, rotated: false }, // W across front
    { x1: xFrontEnd * S, y1: yMid + 28, x2: xG1e * S, y2: yMid + 28, valuePt: G * S, rotated: false }, // G
    { x1: (xBackEnd + G / 4) * S, y1: (flap + hemMm) * S, x2: (xBackEnd + G / 4) * S, y2: (flap + hemMm + Hb) * S, valuePt: Hb * S, rotated: true }, // H
    { x1: 0, y1: -15, x2: xSeam * S, y2: -15, valuePt: pw * S, rotated: false }, // seam
    { x1: 0, y1: BH * S + 17, x2: BW * S, y2: BH * S + 17, valuePt: BW * S, rotated: false }, // blank W
  ];

  if (flap > 0) {
    dims.push({ x1: (BW - 12) * S, y1: 0, x2: (BW - 12) * S, y2: flap * S, valuePt: flap * S, label: "flap {v}", rotated: true });
  }
  return { segments, blank, dims, warnings, valid: true, meta: { pw, bottom, hemMm, tamperFlap: flap } };
}
