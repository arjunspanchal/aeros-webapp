// BOWL SLEEVE dieline — straight belly band for a round container, with an
// optional circular medallion (disc) die-cut into the front panel and a
// tapered glue flap. Calibrated to the Zepto Cafe 750 mL anti-leak sleeve
// keyline (vendor: Instera Prints v01, duplex 280 gsm):
//
//   flat 447.92 x 89 mm = wrap 432.92 (side 80 | front 177.92 | side 80 |
//   back 95) + 15 mm glue flap tapered 2.96 mm per side; 148 mm dia disc
//   centred on the front panel bulging 29.5 mm above and below the band.
//
// Inputs: L = container diameter at the sleeve (wrap = pi x dia), W = sleeve
// height, H = disc diameter (0 = plain band). Panel splits keep the
// reference proportions; flap and taper are the vendor's constants.
// RED = cut, GREEN = crease (panel folds + flap fold).

import { PT_PER_MM } from "./cakebox.js";

const FLAP = 15, FLAP_TAPER = 2.96;
const P_SIDE = 80 / 432.92, P_FRONT = 177.92 / 432.92; // reference splits

export function buildBowlsleeveDieline({ L, W, H, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const dia = toMm(L);
  const Hb = toMm(W);
  const discD = H > 0 ? toMm(H) : 0;

  const warnings = ["Calibrated to the Zepto Cafe 750 mL anti-leak sleeve keyline (Ø137.8 × 89, disc 148) — glue the tapered flap; the disc medallion follows the band's curve."];
  if (!(dia > 0) || !(Hb > 0)) {
    return { segments: [], blank: null, warnings: ["Diameter and height must be positive."], valid: false };
  }
  const wrap = Math.PI * dia;
  const pS = P_SIDE * wrap, pF = P_FRONT * wrap;
  const cx = pS + pF / 2, cy = Hb / 2, r = discD / 2;
  const bulge = discD > Hb;
  if (discD > 0 && !bulge) warnings.push("Disc smaller than the sleeve height — no die-cut bulge; it's just artwork.");
  if (bulge && discD > pF - 6) warnings.push("Disc wider than the front panel — it will cross the side creases.");

  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });
  const bez = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });
  // arc of the disc from angle t1 to t2 (rad, y-down screen angles), split ≤ 90°
  const arc = (t1, t2) => {
    const n = Math.ceil(Math.abs(t2 - t1) / (Math.PI / 2));
    const dt = (t2 - t1) / n;
    const k = (4 / 3) * Math.tan(dt / 4);
    for (let i = 0; i < n; i++) {
      const a = t1 + i * dt, b = a + dt;
      const p0 = [cx + r * Math.cos(a), cy - r * Math.sin(a)];
      const p3 = [cx + r * Math.cos(b), cy - r * Math.sin(b)];
      const p1 = [p0[0] - k * r * Math.sin(a), p0[1] - k * r * Math.cos(a)];
      const p2 = [p3[0] + k * r * Math.sin(b), p3[1] + k * r * Math.cos(b)];
      bez("cut", p0, p1, p2, p3);
    }
  };

  // ---- outline ----
  line("cut", [0, 0], [0, Hb]);
  if (bulge) {
    const hc = Math.sqrt(r * r - cy * cy); // half chord at the band edges
    const tR = Math.asin(cy / r), tL = Math.PI - tR;
    line("cut", [0, 0], [cx - hc, 0]);
    arc(tL, tR); // over the top
    line("cut", [cx + hc, 0], [wrap, 0]);
    line("cut", [wrap, Hb], [cx + hc, Hb]);
    arc(-tR, -tL); // under the bottom
    line("cut", [cx - hc, Hb], [0, Hb]);
  } else {
    line("cut", [0, 0], [wrap, 0]);
    line("cut", [wrap, Hb], [0, Hb]);
  }
  // tapered glue flap
  line("cut", [wrap, 0], [wrap + FLAP, FLAP_TAPER]);
  line("cut", [wrap + FLAP, FLAP_TAPER], [wrap + FLAP, Hb - FLAP_TAPER]);
  line("cut", [wrap + FLAP, Hb - FLAP_TAPER], [wrap, Hb]);
  // panel creases + flap fold
  for (const x of [pS, pS + pF, 2 * pS + pF, wrap]) line("crease", [x, 0], [x, Hb]);

  // ---- normalise + scale ----
  const minY = bulge ? cy - r : 0;
  const BW = wrap + FLAP, BH = bulge ? discD : Hb;
  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, (y - minY) * S]) }));
  const blank = { widthPt: BW * S, heightPt: BH * S, flapDepthPt: FLAP * S, style: "bowlsleeve" };
  const yMid = (cy - minY) * S;
  const dims = [
    { x1: 0, y1: yMid, x2: pS * S, y2: yMid, valuePt: pS * S, rotated: false },
    { x1: (2 * pS + pF) * S, y1: yMid, x2: wrap * S, y2: yMid, valuePt: (wrap - 2 * pS - pF) * S, rotated: false },
    { x1: (BW + 6) * S, y1: -minY * S, x2: (BW + 6) * S, y2: (Hb - minY) * S, valuePt: Hb * S, rotated: true },
    // wrap annotated with the input bowl diameter it derives from
    { x1: 0, y1: BH * S + 17, x2: wrap * S, y2: BH * S + 17, valuePt: wrap * S, label: `wrap {v} = π × Ø${+dia.toFixed(1)}`, rotated: false },
  ];
  if (bulge) {
    // disc diameter drawn across the medallion itself
    dims.push({ x1: (cx - r) * S, y1: (cy - minY) * S - 30, x2: (cx + r) * S, y2: (cy - minY) * S - 30, valuePt: discD * S, label: "disc Ø {v}", rotated: false });
  }
  return { segments, blank, dims, warnings, valid: true, meta: { wrap, pS, pF, pB: wrap - 2 * pS - pF, discD, flap: FLAP } };
}
