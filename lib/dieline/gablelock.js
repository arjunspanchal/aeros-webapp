// GABLE BOX, HANDLE-LOCK: one-piece carry-out box read off a customer's flat sample (3-Nov-2026, 30 x 20 x 12 cm, 110 g),
// measured against a tape on the opened blank, so features are +/- 3-5 mm until a real blank is checked.
//
//   glue on the last panel | x order: END | SIDE B | END | SIDE D | glue    y: handle | roof | wall H | base flaps
//   Roof: each SIDE panel carries a roof panel (W/2 - 4) and a handle panel (double ply when closed) with a half-cut hand hole.
//   Top lock: rounded ears on the handle ends pass through a slot in the END trapezoid flaps.
//   Base: 1-2-3 snap lock, no glue: END flaps fold first (straight edge beside SIDE B), SIDE B trapezoid, SIDE D with two tabs.
// Proportions follow the sample at W 200 / L 300; lock features stay absolute. Output in points, y-down.
import { PT_PER_MM } from "./cakebox.js";

const KAPPA = 0.5522847498;
const HANDLE = 62, GLUE = 22;

export function buildGablelockDieline({ L, W, H, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L), Wm = toMm(W), Hm = toMm(H);
  const warnings = ["Read off a flat sample, not a die file — prototype first."];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  if (Lm < 200 || Wm < 120) return { segments: [], blank: null, warnings: ["Too small for the handle ears and hand hole (L >= 200, W >= 120)."], valid: false };

  const sW = Wm / 200, sL = Lm / 300;
  const ROOF = Wm / 2 - 4;
  const TRAP_D = 77 * sW, TRAP_RUN = 52 * sW;
  const END_D = 100 * sW, END_LAT = 100 * sW, END_NOTCH = 56 * sW; // end base flap
  const B_RUN = 70 * sL, B_KNEE = 101 * sW, B_D = 127 * sW; // SIDE B base flap
  const D_D = 98 * sW, D_TAB = 122 * sW, D_TABW = 65 * sL; // SIDE D base flap
  const xA = 0, xB = Wm, xC = Wm + Lm, xD = 2 * Wm + Lm, xE = 2 * Wm + 2 * Lm;

  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });
  const bez = (layer, a, b, c, d) => segs.push({ layer, kind: "c", pts: [a, b, c, d] });
  const poly = (pts) => { for (let i = 0; i < pts.length - 1; i++) line("cut", pts[i], pts[i + 1]); };
  const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy); return [dx / n, dy / n]; };
  // polyline with one rounded corner at `q`, from p to r
  const fillet = (p, q, r, rad) => {
    const u1 = unit(q, p), u2 = unit(q, r);
    const ang = Math.acos(u1[0] * u2[0] + u1[1] * u2[1]);
    const d = rad / Math.tan(ang / 2), c = KAPPA * d;
    const a = [q[0] + u1[0] * d, q[1] + u1[1] * d], b = [q[0] + u2[0] * d, q[1] + u2[1] * d];
    line("cut", p, a);
    bez("cut", a, [a[0] - u1[0] * c, a[1] - u1[1] * c], [b[0] - u2[0] * c, b[1] - u2[1] * c], b);
    return b;
  };

  // ---- body creases and free edge ----
  for (const x of [xB, xC, xD, xE]) line("crease", [x, 0], [x, Hm]);
  line("crease", [0, 0], [xE, 0]);
  line("crease", [0, Hm], [xE, Hm]);
  line("cut", [0, 0], [0, Hm]);
  // glue flap on the last SIDE panel
  const gd = GLUE * Math.tan((15 * Math.PI) / 180);
  poly([[xE, 0], [xE + GLUE, gd], [xE + GLUE, Hm - gd], [xE, Hm]]);

  // ---- END panels: top trapezoid with the ear slot, asymmetric base flap ----
  for (const [xa, straightRight] of [[xA, true], [xC, false]]) {
    const r = 12;
    const P0 = [xa, 0], Q1 = [xa + TRAP_RUN, -TRAP_D], Q2 = [xa + Wm - TRAP_RUN, -TRAP_D], P3 = [xa + Wm, 0];
    const b1 = fillet(P0, Q1, Q2, r);
    const u = unit(Q2, Q1), v = unit(Q2, P3);
    const ang = Math.acos(u[0] * v[0] + u[1] * v[1]);
    const d = r / Math.tan(ang / 2), c = KAPPA * d;
    const a2 = [Q2[0] + u[0] * d, Q2[1] + u[1] * d], b2 = [Q2[0] + v[0] * d, Q2[1] + v[1] * d];
    line("cut", b1, a2);
    bez("cut", a2, [a2[0] - u[0] * c, a2[1] - u[1] * c], [b2[0] - v[0] * c, b2[1] - v[1] * c], b2);
    line("cut", b2, P3);
    const cx = xa + Wm / 2;
    poly([[cx - 1.5, -5], [cx + 1.5, -5], [cx + 1.5, -48], [cx - 1.5, -48], [cx - 1.5, -5]]);
    // base flap: mirror so the straight edge sits beside SIDE B
    const m = (u0, y) => [straightRight ? xa + u0 : xa + Wm - u0, Hm + y];
    const k1 = m(END_LAT, END_NOTCH), k2 = m(END_LAT + 8, END_NOTCH + 4), tip = m(END_LAT + 10, END_D), tr = m(Wm, END_D), root2 = m(Wm, 0);
    line("cut", m(0, 0), k1);
    line("cut", k1, k2);
    const e = fillet(k2, tip, tr, 10);
    line("cut", e, tr);
    line("cut", tr, root2);
  }

  // ---- SIDE panels: roof, handle with ears + half-cut hand hole ----
  const lugR = 14;
  for (const xs of [xB, xD]) {
    line("crease", [xs, -ROOF], [xs + Lm, -ROOF]);
    for (const dir of [1, -1]) {
      const X = (u) => (dir === 1 ? xs + u : xs + Lm - u);
      const Y = (v) => -ROOF - v;
      line("cut", [X(0), 0], [X(0), Y(HANDLE - lugR)]);
      const q = KAPPA * lugR;
      bez("cut", [X(0), Y(HANDLE - lugR)], [X(0), Y(HANDLE - lugR + q)], [X(lugR - q), Y(HANDLE)], [X(lugR), Y(HANDLE)]);
      bez("cut", [X(lugR), Y(HANDLE)], [X(lugR + q), Y(HANDLE)], [X(2 * lugR), Y(HANDLE - lugR + q)], [X(2 * lugR), Y(HANDLE - lugR)]);
      line("cut", [X(2 * lugR), Y(HANDLE - lugR)], [X(24), Y(27)]); // ear inner edge down to the notch
      line("cut", [X(24), Y(27)], [X(46), Y(54)]); // shoulder
    }
    line("cut", [xs + 46, -ROOF - 54], [xs + Lm - 46, -ROOF - 54]);
    // hand hole: half cut, hinged on the roof|handle crease
    const cx = xs + Lm / 2, hw = 54, hd = 24, r = 6, q = KAPPA * r, y0 = -ROOF;
    line("cut", [cx - hw, y0], [cx - hw, y0 - hd + r]);
    bez("cut", [cx - hw, y0 - hd + r], [cx - hw, y0 - hd + r - q], [cx - hw + r - q, y0 - hd], [cx - hw + r, y0 - hd]);
    line("cut", [cx - hw + r, y0 - hd], [cx + hw - r, y0 - hd]);
    bez("cut", [cx + hw - r, y0 - hd], [cx + hw - r + q, y0 - hd], [cx + hw, y0 - hd + r - q], [cx + hw, y0 - hd + r]);
    line("cut", [cx + hw, y0 - hd + r], [cx + hw, y0]);
  }

  // ---- base: SIDE B trapezoid ----
  {
    const R = (u, y) => [xB + u, Hm + y];
    const R2 = (u, y) => [xB + Lm - u, Hm + y];
    line("cut", R(0, 0), R(B_RUN, B_KNEE));
    const e1 = fillet(R(B_RUN, B_KNEE), R(B_RUN + 5, B_D), R2(B_RUN + 5, B_D), 8);
    const e2 = fillet(e1, R2(B_RUN + 5, B_D), R2(B_RUN, B_KNEE), 8);
    line("cut", e2, R2(0, 0));
  }
  // ---- base: SIDE D with two end tabs ----
  poly([[xD, Hm], [xD, Hm + D_TAB], [xD + D_TABW, Hm + D_TAB], [xD + D_TABW, Hm + D_D], [xD + Lm - D_TABW, Hm + D_D], [xD + Lm - D_TABW, Hm + D_TAB], [xD + Lm, Hm + D_TAB], [xD + Lm, Hm]]);

  const minY = -ROOF - HANDLE, maxY = Hm + B_D, maxX = xE + GLUE;
  const Sc = PT_PER_MM;
  const X = (x) => x * Sc, Y = (y) => (y - minY) * Sc;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [X(x), Y(y)]) }));
  const check = {
    earHeightMm: HANDLE - 27, slotLengthMm: 43, slotWidthMm: 3,
    roofRunVsHalfWMm: Wm / 2 - ROOF,
    endFlapsSumVsL: { sum: 2 * END_D, L: Lm },
    sideFlapsSumVsW: { sum: B_D + D_TAB, W: Wm },
  };
  const blank = { widthPt: maxX * Sc, heightPt: (maxY - minY) * Sc, flapDepthPt: END_D * Sc, style: "gablelock", check };
  const yR = -ROOF / 2, xMid = xB + Lm / 2;
  const dims = [
    { x1: X(xB), y1: Y(Hm / 2), x2: X(xC), y2: Y(Hm / 2), valuePt: Lm * Sc, label: "L {v}", rotated: false },
    { x1: X(xA), y1: Y(Hm / 2), x2: X(xB), y2: Y(Hm / 2), valuePt: Wm * Sc, label: "W {v}", rotated: false },
    { x1: X(xC + Wm / 2), y1: Y(0), x2: X(xC + Wm / 2), y2: Y(Hm), valuePt: Hm * Sc, label: "H {v}", rotated: true },
    { x1: X(xMid + 80), y1: Y(-ROOF), x2: X(xMid + 80), y2: Y(0), valuePt: ROOF * Sc, label: "roof {v}", rotated: true },
    { x1: X(xMid + 80), y1: Y(minY), x2: X(xMid + 80), y2: Y(-ROOF), valuePt: HANDLE * Sc, label: "handle {v}", rotated: true },
    { x1: X(xMid - 54), y1: Y(-ROOF - 24) - 8, x2: X(xMid + 54), y2: Y(-ROOF - 24) - 8, valuePt: 108 * Sc, label: "hand hole {v}", rotated: false },
    { x1: X(xA + Wm / 2 + 12), y1: Y(-TRAP_D), x2: X(xA + Wm / 2 + 12), y2: Y(0), valuePt: TRAP_D * Sc, label: "{v}", rotated: true },
    { x1: X(xB + 150), y1: Y(Hm), x2: X(xB + 150), y2: Y(Hm + B_D), valuePt: B_D * Sc, label: "{v}", rotated: true },
    { x1: X(xD + Lm / 2), y1: Y(Hm), x2: X(xD + Lm / 2), y2: Y(Hm + D_D), valuePt: D_D * Sc, label: "{v}", rotated: true },
    { x1: X(xA + 150), y1: Y(Hm), x2: X(xA + 150), y2: Y(Hm + END_D), valuePt: END_D * Sc, label: "{v}", rotated: true },
    { x1: 0, y1: Y(maxY) + 17, x2: X(maxX), y2: Y(maxY) + 17, valuePt: maxX * Sc, rotated: false },
    { x1: X(maxX) + 17, y1: 0, x2: X(maxX) + 17, y2: Y(maxY), valuePt: (maxY - minY) * Sc, rotated: true },
  ];
  return { segments, blank, dims, warnings, valid: true };
}
