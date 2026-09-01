// BOWL SLEEVE dieline — VERTICAL anti-leak strap for a round bowl + lid,
// calibrated to the Zepto Cafe 750 mL bagasse-bowl keyline (vendor: Instera
// Prints, duplex 280 gsm) and Arjun's physical sample:
//
//   physical sample (hand-measured): side 80 | TOP 175 | side 80 |
//   bottom 95 + 15 mm glue flap — the TOP panel EQUALS the bowl Ø at the
//   creases (175). The vendor keyline drew the top panel 177.92 (~3 mm
//   generous vs the produced die); the sample is the authority. The Ø148
//   disc is a circular extension of the top panel capping the lid dome;
//   the strap folds over the lid, down both sides, glues under the base.
//
// Inputs: L = bowl Ø at the crease (reference 175), W = strap width
// (reference 89), H = disc Ø (reference 148; 0 = plain strap). Side drop,
// bottom span and flap keep the reference proportions/constants.
// RED = cut, GREEN = crease (4 corner folds + flap fold).

import { PT_PER_MM } from "./cakebox.js";

const FLAP = 15, FLAP_TAPER = 2.96;
const REF_DIA = 175, REF_SIDE = 80, REF_BOTTOM = 95;

export function buildBowlsleeveDieline({ L, W, H, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const dia = toMm(L); // bowl Ø at the crease
  const Hb = toMm(W); // strap width
  const discD = H > 0 ? toMm(H) : 0;

  const warnings = ["Vertical anti-leak strap calibrated to the Zepto Cafe 750 mL bagasse-bowl PHYSICAL SAMPLE — top panel = bowl Ø at the creases exactly (175); the vendor keyline drew it ~3 mm wider. Side drop and bottom span scale from the reference — verify on the actual bowl + lid."];
  if (!(dia > 0) || !(Hb > 0)) {
    return { segments: [], blank: null, warnings: ["Diameter and strap width must be positive."], valid: false };
  }
  const top = dia; // top panel = bowl Ø at the creases (physical sample)
  const side = (REF_SIDE / REF_DIA) * dia;
  const bottom = (REF_BOTTOM / REF_DIA) * dia;
  const wrap = 2 * side + top + bottom;
  const cx = side + top / 2, cy = Hb / 2, r = discD / 2;
  const bulge = discD > Hb;
  if (discD > 0 && !bulge) warnings.push("Disc smaller than the strap width — no die-cut bulge; it's just artwork.");
  if (bulge && discD > top - 6) warnings.push("Disc wider than the top panel — it will cross the corner creases.");

  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });
  const bez = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });
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
    const hc = Math.sqrt(r * r - cy * cy);
    const tR = Math.asin(cy / r), tL = Math.PI - tR;
    line("cut", [0, 0], [cx - hc, 0]);
    arc(tL, tR);
    line("cut", [cx + hc, 0], [wrap, 0]);
    line("cut", [wrap, Hb], [cx + hc, Hb]);
    arc(-tR, -tL);
    line("cut", [cx - hc, Hb], [0, Hb]);
  } else {
    line("cut", [0, 0], [wrap, 0]);
    line("cut", [wrap, Hb], [0, Hb]);
  }
  line("cut", [wrap, 0], [wrap + FLAP, FLAP_TAPER]);
  line("cut", [wrap + FLAP, FLAP_TAPER], [wrap + FLAP, Hb - FLAP_TAPER]);
  line("cut", [wrap + FLAP, Hb - FLAP_TAPER], [wrap, Hb]);
  // corner creases: side|top, top|side, side|bottom, bottom|flap
  for (const x of [side, side + top, 2 * side + top, wrap]) line("crease", [x, 0], [x, Hb]);

  // ---- normalise + scale ----
  const minY = bulge ? cy - r : 0;
  const BW = wrap + FLAP, BH = bulge ? discD : Hb;
  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, (y - minY) * S]) }));
  const blank = { widthPt: BW * S, heightPt: BH * S, flapDepthPt: FLAP * S, style: "bowlsleeve" };
  const yMid = (cy - minY) * S;
  const dims = [
    { x1: 0, y1: yMid, x2: side * S, y2: yMid, valuePt: side * S, label: "side {v}", rotated: false },
    { x1: side * S, y1: yMid + 26, x2: (side + top) * S, y2: yMid + 26, valuePt: top * S, label: `top {v} = bowl Ø at crease`, rotated: false },
    { x1: (2 * side + top) * S, y1: yMid, x2: wrap * S, y2: yMid, valuePt: bottom * S, label: "bottom {v}", rotated: false },
    { x1: (BW + 6) * S, y1: -minY * S, x2: (BW + 6) * S, y2: (Hb - minY) * S, valuePt: Hb * S, rotated: true },
    { x1: 0, y1: BH * S + 17, x2: wrap * S, y2: BH * S + 17, valuePt: wrap * S, rotated: false },
  ];
  if (bulge) {
    dims.push({ x1: (cx - r) * S, y1: (cy - minY) * S - 30, x2: (cx + r) * S, y2: (cy - minY) * S - 30, valuePt: discD * S, label: "disc Ø {v}", rotated: false });
  }
  return { segments, blank, dims, warnings, valid: true, meta: { wrap, side, top, bottom, discD, flap: FLAP, dia } };
}
