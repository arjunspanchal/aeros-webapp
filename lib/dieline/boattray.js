// Parametric dieline (KLD) for the Aeros paper BOAT TRAY: the front-lock food box (foodbox.js) WITHOUT the lid
// (Arjun 03-Nov-2026: "They are exactly like the front lock food boxes without the lid").
//
// Kept from the food box: tapered one-piece tray, base + four flared walls, a corner flap hinged on each LONG wall's
// corner edge, one short shared fold at the base corner, flap pasted INSIDE the end wall (4-corner pasted, nests open).
// Dropped with the lid: lid + lid lip, hinge slit, locking teeth, end-wall rim flaps + slots, end-wall holes.
//
// The food box flares 7 mm a side; a boat tray flares 33-36 mm, so its geometry cannot be scaled from that die. Walls
// are true trapezoids: each wall's flat height is the SLANT, sqrt(h^2 + flare^2), and the corner flap is sized to the
// wedge left between two neighbouring wall edges in the flat (33 deg here, 70 deg on the food box).
//
// Inputs: L, W = top opening (long, short), bottomL, bottomW = base, H = vertical height. Output in points, y-down.
import { PT_PER_MM } from "./cakebox.js";

const KAPPA = 0.5522847498;
const hyp = (...v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

export function buildBoattrayDieline({ L, W, H, bottomL, bottomW, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lt = toMm(L), Wt = toMm(W), h = toMm(H), Lb = toMm(bottomL), Wb = toMm(bottomW);
  const warnings = [];
  if (![Lt, Wt, h, Lb, Wb].every((v) => v > 0)) {
    return { segments: [], blank: null, warnings: ["Enter top L x W, bottom L x W and height."], valid: false };
  }
  if (Lt <= Lb || Wt <= Wb) {
    return { segments: [], blank: null, warnings: ["The top must be larger than the bottom both ways."], valid: false };
  }
  if (Lb < Wb) warnings.push("Bottom L is smaller than bottom W — the flaps hinge on the long walls; check orientation.");

  const Ty = (Lt - Lb) / 2; // end-wall flare, along the long axis
  const Tx = (Wt - Wb) / 2; // long-wall flare, along the short axis
  const Hl = hyp(h, Tx); // long wall flat (slant) height
  const He = hyp(h, Ty); // end wall flat (slant) height
  const R = [-Hl, -Ty]; // long wall rim corner (top-left field)
  const S = [-Tx, -He]; // end wall rim corner
  const E = hyp(...R); // corner edge length (same on both walls: they meet when folded)

  // Flat wedge between the two wall edges at the base corner
  const unit = (p) => { const n = hyp(...p); return [p[0] / n, p[1] / n]; };
  const u = unit(R), v = unit(S);
  const phi = Math.acos(u[0] * v[0] + u[1] * v[1]);
  const nU = [-u[1], u[0]]; // normal to the long-wall edge, pointing into the wedge
  const n = nU[0] * v[0] + nU[1] * v[1] > 0 ? nU : [-nU[0], -nU[1]];
  const nV0 = [-v[1], v[0]];
  const nV = nV0[0] * u[0] + nV0[1] * u[1] > 0 ? nV0 : [-nV0[0], -nV0[1]];

  // Corner flap, from the food-box proportions: shared fold 14.5 % of the edge, tip 55.5 % along, then cut back to the rim corner
  const kd = 0.145 * E;
  const K = [v[0] * kd, v[1] * kd];
  const clear = 2.5; // relief off the end-wall edge
  const P1 = [K[0] + v[0] * 2.5 + nV[0] * clear, K[1] + v[1] * 2.5 + nV[1] * clear];
  const aT = 0.555 * E;
  const pLimit = aT * Math.tan(phi);
  const pT = 0.72 * pLimit;
  const Tip = [u[0] * aT + n[0] * pT, u[1] * aT + n[1] * pT];
  const r = Math.min(6, E * 0.09);
  const a1 = unit([P1[0] - Tip[0], P1[1] - Tip[1]]), a2 = unit([R[0] - Tip[0], R[1] - Tip[1]]);
  const ang = Math.acos(a1[0] * a2[0] + a1[1] * a2[1]);
  const d = r / Math.tan(ang / 2);
  const T1 = [Tip[0] + a1[0] * d, Tip[1] + a1[1] * d];
  const T2 = [Tip[0] + a2[0] * d, Tip[1] + a2[1] * d];
  const c = (KAPPA * d);
  const C1 = [T1[0] - a1[0] * c, T1[1] - a1[1] * c];
  const C2 = [T2[0] - a2[0] * c, T2[1] - a2[1] * c];

  // ---- fold check: the flap, folded about the corner edge, lies on the end wall ----
  // (a along the edge, p into the wall) -> height up the end wall = a cos(t) + p sin(t), t = edge lean on that wall
  const t = Math.atan2(Tx, He);
  const hOnEnd = aT * Math.cos(t) + pT * Math.sin(t);
  const check = {
    wedgeDeg: (phi * 180) / Math.PI,
    edgeMm: E,
    flapTipAlongMm: aT,
    flapTipOutMm: pT,
    flapHeightOnEndWallMm: hOnEnd,
    endWallHeightMm: He,
    flapsMeetOnEndWall: pT * 2 > Wt,
  };
  if (hOnEnd > He - 2) warnings.push("Corner flap would stand above the end-wall rim when folded — check before cutting.");
  if (check.flapsMeetOnEndWall) warnings.push("The two corner flaps would overlap on the end wall.");
  if (h < 25 || h > 80) warnings.push("Height is outside the 25–80 mm food-box range — corner flap proportions are extrapolated.");
  warnings.push("Boat tray from the food-box construction, not yet die-proven — prototype first.");

  // Work in mm, origin at the base top-left: x across W, y along L
  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });
  const bez = (layer, a, b, c2, e) => segs.push({ layer, kind: "c", pts: [a, b, c2, e] });

  // base
  line("crease", [0, 0], [Wb, 0]);
  line("crease", [Wb, 0], [Wb, Lb]);
  line("crease", [Wb, Lb], [0, Lb]);
  line("crease", [0, Lb], [0, 0]);
  // wall rims
  line("cut", [-Hl, -Ty], [-Hl, Lb + Ty]);
  line("cut", [Wb + Hl, -Ty], [Wb + Hl, Lb + Ty]);
  line("cut", [-Tx, -He], [Wb + Tx, -He]);
  line("cut", [-Tx, Lb + He], [Wb + Tx, Lb + He]);
  // the four corners, mirrored from the top-left
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const m = ([x, y]) => [sx === 1 ? x : Wb - x, sy === 1 ? y : Lb - y];
    line("crease", m([0, 0]), m(R)); // flap hinge on the long wall
    line("crease", m([0, 0]), m(K)); // shared fold on the end wall
    line("cut", m(K), m(S)); // end wall edge
    line("cut", m(K), m(P1));
    line("cut", m(P1), m(T1));
    bez("cut", m(T1), m(C1), m(C2), m(T2));
    line("cut", m(T2), m(R));
  }

  const minX = -Hl, minY = -He, maxX = Wb + Hl, maxY = Lb + He;
  const Sc = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [(x - minX) * Sc, (y - minY) * Sc]) }));
  const X = (x) => (x - minX) * Sc, Y = (y) => (y - minY) * Sc;
  const blank = { widthPt: (maxX - minX) * Sc, heightPt: (maxY - minY) * Sc, flapDepthPt: Hl * Sc, style: "boattray", check };
  const yMid = Lb / 2, xMid = Wb / 2;
  const dims = [
    { x1: X(0), y1: Y(yMid - Lb * 0.3), x2: X(Wb), y2: Y(yMid - Lb * 0.3), valuePt: Wb * Sc, label: "bottom {v}", rotated: false },
    { x1: X(xMid), y1: Y(0), x2: X(xMid), y2: Y(Lb), valuePt: Lb * Sc, label: "bottom {v}", rotated: true },
    { x1: X(-Hl), y1: Y(yMid + 20), x2: X(0), y2: Y(yMid + 20), valuePt: Hl * Sc, label: "slant {v}", rotated: false },
    { x1: X(xMid + 25), y1: Y(-He), x2: X(xMid + 25), y2: Y(0), valuePt: He * Sc, label: "slant {v}", rotated: true },
    { x1: X(-Tx), y1: Y(-He) - 14, x2: X(Wb + Tx), y2: Y(-He) - 14, valuePt: Wt * Sc, label: "top {v}", rotated: false },
    { x1: X(-Hl) - 14, y1: Y(-Ty), x2: X(-Hl) - 14, y2: Y(Lb + Ty), valuePt: Lt * Sc, label: "top {v}", rotated: true },
    { x1: 0, y1: Y(maxY) + 17, x2: X(maxX), y2: Y(maxY) + 17, valuePt: (maxX - minX) * Sc, rotated: false },
    { x1: X(maxX) + 17, y1: 0, x2: X(maxX) + 17, y2: Y(maxY), valuePt: (maxY - minY) * Sc, rotated: true },
  ];
  return { segments, blank, dims, warnings, valid: true };
}
