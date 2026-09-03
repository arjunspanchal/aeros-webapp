// MAILER / TUCK BOX (FEFCO 0427) dieline — calibrated to a professional
// die-maker's size family (6x6x2, 6x4x2, 6x2x2 in; L=152.4 and H=50.8 shared,
// W varies). All three blanks are embedded (tuck-ref.js, cut/crease separated
// by the die maker) and the engine band-scales from the NEAREST-W reference:
//   x: [side assembly | base panel (L) | side assembly]   sides follow H
//   y: [tuck | lid (W) | back | base (W) | front]         tuck/back/front follow H
// Output is die-exact at the three reference sizes; between them the interior
// details (slit spacing, dust-flap proportions) come from the closest
// hand-tuned original, which is how the die maker themselves stepped sizes.
// Die-maker details preserved: thumb-notch tuck, double/triple roll creases,
// corner ears, base lock slits. The reference dies were cut for E-flute
// (1.5 mm); every caliper-dependent feature — roll-crease spacing, tuck
// offsets, lock-slit widths — sits within ~4 mm of a panel band boundary
// (nearest non-allowance feature is ≥5 mm away), so those offsets are
// rescaled by caliper/1.5 while panels stay at internal dims.

import { PT_PER_MM } from "./cakebox.js";
import { TUCK_REFS, TUCK_XB } from "./tuck-ref.js";

const REF_L = TUCK_XB[2] - TUCK_XB[1]; // 152.4
const REF_H = 50.8;
const T_REF = 1.5; // caliper the reference dies were cut for (E-flute)
const ALLOW_R = 4.9; // allowance offsets live within this distance of a band boundary

export function buildTuckboxDieline({ L, W, H, thickness, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L);
  const Wm = toMm(W);
  const Hm = toMm(H);

  const warnings = [];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (Wm < 40) warnings.push("Depth under 40 mm — below the proven die family range.");
  if (Hm < 25 || Hm > 120) warnings.push("Height outside the proven range for this die family — review before cutting.");

  // nearest-W reference
  const ref = Object.values(TUCK_REFS).sort((a, b) => Math.abs(a.W - Wm) - Math.abs(b.W - Wm))[0];
  const yb = ref.yb;

  // caliper compensation: allowance offsets near band boundaries scale with board thickness
  const t = +thickness > 0 ? +thickness : T_REF;
  const tf = Math.min(Math.max(t / T_REF, 0.15), 2.6);
  if (Math.abs(t - T_REF) > 0.01) {
    warnings.push(`Fold allowances stepped for ${t} mm caliper (reference die cut for E-flute 1.5 mm) — have the die maker confirm before cutting.`);
  }
  const remap = (v, anchors) => {
    let a = anchors[0];
    for (const b of anchors) if (Math.abs(v - b) < Math.abs(v - a)) a = b;
    const d = v - a;
    return Math.abs(d) <= ALLOW_R ? a + d * tf : v;
  };
  // dust-flap setback: the flap crease sits outboard of the wall crease (57.8 /
  // 311.8 in ref coords, shared by all three dies) by ~2.7t clearance. Mid-band,
  // so the band-boundary pass misses it; one-sided so the ear geometry just
  // inboard (60.6 / 309.0) stays with the band scale and can never cross over.
  const X_DUST = [[57.8, -1], [311.8, 1]];
  const remapX = (v) => {
    for (const [a, side] of X_DUST) {
      const d = v - a;
      if (d * side > 0 && Math.abs(d) <= ALLOW_R) return a + d * tf;
    }
    return remap(v, TUCK_XB);
  };

  const fL = Lm / REF_L;
  const fW = Wm / ref.W;
  const fH = Hm / REF_H;
  const xScales = [fH, fL, fH];
  const yScales = [fH, fW, fH, fW, fH];
  const mapAxis = (v, bands, scales) => {
    let out = 0;
    for (let i = 0; i < scales.length; i++) {
      const b0 = bands[i], b1 = bands[i + 1];
      if (v >= b1) out += (b1 - b0) * scales[i];
      else { out += Math.max(0, v - b0) * scales[i]; return out; }
    }
    return out;
  };
  const mapX = (x) => mapAxis(Math.max(remapX(x), 0), TUCK_XB, xScales) * PT_PER_MM;
  const mapY = (y) => mapAxis(Math.max(remap(y, yb), 0), yb, yScales) * PT_PER_MM;

  const segments = [];
  for (const tag of ["cut", "crease"]) {
    for (const s of ref.segs[tag]) {
      segments.push({ layer: tag, kind: s[0], pts: s.slice(1).map(([x, y]) => [mapX(x), mapY(y)]) });
    }
  }

  const widthPt = mapX(TUCK_XB[3]);
  const heightPt = mapY(yb[5]);
  const blank = { widthPt, heightPt, flapDepthPt: Hm * PT_PER_MM, style: "tuckbox" };
  const dims = [
    { x1: mapX(TUCK_XB[1]), y1: mapY(yb[3]) + (Wm / 2) * PT_PER_MM, x2: mapX(TUCK_XB[2]), y2: mapY(yb[3]) + (Wm / 2) * PT_PER_MM, valuePt: Lm * PT_PER_MM, rotated: false },
    { x1: mapX(TUCK_XB[3]) + 17, y1: mapY(yb[3]), x2: mapX(TUCK_XB[3]) + 17, y2: mapY(yb[4]), valuePt: Wm * PT_PER_MM, rotated: true },
    { x1: mapX(TUCK_XB[0]) - 15, y1: mapY(yb[2]), x2: mapX(TUCK_XB[0]) - 15, y2: mapY(yb[3]), valuePt: Hm * PT_PER_MM, rotated: true },
    { x1: 0, y1: heightPt + 17, x2: widthPt, y2: heightPt + 17, valuePt: widthPt, rotated: false },
  ];
  return { segments, blank, dims, warnings, valid: true };
}
