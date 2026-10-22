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

export function buildTuckboxDieline({ L, W, H, thickness, windowW, windowH, lockTab, vents = 0, ventShape = "slot", ventPitch, ventDrop, fingerNotch = 0, notchShape = "trap", units = "mm" }) {
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
  const mapX0 = (x) => mapAxis(Math.max(remapX(x), 0), TUCK_XB, xScales) * PT_PER_MM;
  // SIDE-WALL LOCK TAB depth. The reference dies (E-flute) carry a 5.0 mm tab on the
  // free edge of each rolled side wall (ref x 0..5 and 364.6..369.6), which band-scales
  // with H (5.9 mm at H 60). On folding board that tab is too deep and POPS OUT of the
  // base slot (Arjun 08-Oct-2026, 66 Chuim sample) -> 4 mm on board (caliper < 1 mm);
  // corrugated keeps the die-maker's tab. `lockTab` (mm) overrides.
  const TAB_REF = 5.0, XR_TAB = TUCK_XB[3] - TAB_REF;
  const tabMm = +lockTab > 0 ? toMm(+lockTab) : t < 1 ? 4 : 0;
  const eL = mapX0(TAB_REF), eR = mapX0(XR_TAB), Tt = tabMm * PT_PER_MM;
  const xShift = tabMm ? eL - Tt : 0; // keep the tab tip at x = 0
  const mapX = (x) => {
    let v = mapX0(x);
    if (tabMm) {
      if (x < TAB_REF) v = eL - ((TAB_REF - x) / TAB_REF) * Tt;
      else if (x > XR_TAB) v = eR + ((x - XR_TAB) / TAB_REF) * Tt;
    }
    return v - xShift;
  };
  const mapY = (y) => mapAxis(Math.max(remap(y, yb), 0), yb, yScales) * PT_PER_MM;

  const segments = [];
  for (const tag of ["cut", "crease"]) {
    for (const s of ref.segs[tag]) {
      segments.push({ layer: tag, kind: s[0], pts: s.slice(1).map(([x, y]) => [mapX(x), mapY(y)]) });
    }
  }

  // optional CUP HOLE in the lid (the top when closed): petal cut — opening
  // cut under size and slit into tabs that fold down and grip the cup.
  // windowW = crease-ring Ø (tab root), windowH = cut Ø (opening).
  const ringD = +windowW > 0 ? toMm(+windowW) : 0;
  const cutD = +windowH > 0 ? toMm(+windowH) : ringD > 0 ? ringD - 24 : 0;
  let holeDims = [];
  if (ringD > 0) {
    const S = PT_PER_MM, K = 0.5522847498, SLITS = 12, SLIT_W = 1.2;
    const lx0 = mapX(TUCK_XB[1]) / S, lx1 = mapX(TUCK_XB[2]) / S;
    const ly0 = mapY(yb[1]) / S, ly1 = mapY(yb[2]) / S;
    const cx = (lx0 + lx1) / 2, cy = (ly0 + ly1) / 2, rO = ringD / 2, rI = Math.max(4, cutD / 2);
    if (ringD > Math.min(Lm, Wm) - 16) warnings.push(`Cup hole ring Ø${ringD} leaves under 8 mm of lid board each side — reduce the hole or enlarge the box.`);
    const push = (layer, kind, pts) => segments.push({ layer, kind, pts: pts.map(([x, y]) => [x * S, y * S]) });
    const circ = (layer, r) => {
      const k = K * r;
      push(layer, "c", [[cx + r, cy], [cx + r, cy - k], [cx + k, cy - r], [cx, cy - r]]);
      push(layer, "c", [[cx, cy - r], [cx - k, cy - r], [cx - r, cy - k], [cx - r, cy]]);
      push(layer, "c", [[cx - r, cy], [cx - r, cy + k], [cx - k, cy + r], [cx, cy + r]]);
      push(layer, "c", [[cx, cy + r], [cx + k, cy + r], [cx + r, cy + k], [cx + r, cy]]);
    };
    circ("cut", rI);
    circ("crease", rO);
    for (let i = 0; i < SLITS; i++) {
      const a = (i / SLITS) * 2 * Math.PI + Math.PI / SLITS, dd = SLIT_W / 2 / rI;
      for (const sg of [-1, 1]) {
        const t = a + sg * dd;
        push("cut", "l", [[cx + rI * Math.cos(t), cy + rI * Math.sin(t)], [cx + rO * Math.cos(a), cy + rO * Math.sin(a)]]);
      }
    }
    holeDims = [
      { x1: (cx - rO) * S, y1: (cy + rO + 6) * S, x2: (cx + rO) * S, y2: (cy + rO + 6) * S, valuePt: ringD * S, label: "cup hole ring \u00d8 {v}", rotated: false },
      { x1: (cx - rI) * S, y1: cy * S, x2: (cx + rI) * S, y2: cy * S, valuePt: 2 * rI * S, label: "cut \u00d8 {v}", rotated: false },
    ];
  }

  const widthPt = mapX(TUCK_XB[3]);
  const heightPt = mapY(yb[5]);

  // optional REAR VENTS: `vents` round-ended slots (4 x 16 mm, 25 mm pitch) standing in the
  // BACK wall, centred on it — steam relief for hot food. Sizes read off the UNSTBL
  // "Takeaway System" render (12-Oct-2026), not a sample: ASSUMED.
  const featDims = [];
  const nV = Math.max(0, Math.round(+vents || 0));
  if (nV > 0) {
    const S = PT_PER_MM, K = 0.5522847498, VW = 4, VL = Math.min(16, Hm - 20), VP = 25, r = VW / 2;
    const bx = (mapX(TUCK_XB[1]) + mapX(TUCK_XB[2])) / 2 / S, by = (mapY(yb[2]) + mapY(yb[3])) / 2 / S;
    if (VL < 6) warnings.push("Back wall too low for vents.");
    if ((nV - 1) * VP + VW > Lm - 40) warnings.push("Vents run within 20 mm of the back-wall corners — reduce the count.");
    const push = (kind, pts) => segments.push({ layer: "cut", kind, pts: pts.map(([x, y]) => [x * S, y * S]) });
    if (ventShape === "round") {
      // round steam vents: O6 holes in a row centred along the back wall (Mog Mog sheet, ASSUMED).
      // `ventPitch` (mm, default 20) spaces them; `ventDrop` (mm) puts the row that far below the back
      // wall's top edge (the lid hinge) instead of mid-height — Mog Mog 230x185x55: 3 at L/4 pitch, 15 below.
      const RD = 3, RP = +ventPitch > 0 ? toMm(+ventPitch) : 20;
      const vy = +ventDrop > 0 ? mapY(yb[2]) / S + toMm(+ventDrop) : by;
      for (let i = 0; i < nV; i++) {
        const cx = bx + (i - (nV - 1) / 2) * RP, cy = vy, k = K * RD;
        push("c", [[cx + RD, cy], [cx + RD, cy - k], [cx + k, cy - RD], [cx, cy - RD]]);
        push("c", [[cx, cy - RD], [cx - k, cy - RD], [cx - RD, cy - k], [cx - RD, cy]]);
        push("c", [[cx - RD, cy], [cx - RD, cy + k], [cx - k, cy + RD], [cx, cy + RD]]);
        push("c", [[cx, cy + RD], [cx + k, cy + RD], [cx + RD, cy + k], [cx + RD, cy]]);
      }
      const x0r = bx - ((nV - 1) / 2) * RP;
      featDims.push({ x1: (x0r - RD) * S, y1: (vy - RD - 5) * S, x2: (x0r + RD) * S, y2: (vy - RD - 5) * S, valuePt: 2 * RD * S, label: "vent \u00d8 {v}", rotated: false });
      if (nV > 1) featDims.push({ x1: x0r * S, y1: (vy + RD + 7) * S, x2: (x0r + RP) * S, y2: (vy + RD + 7) * S, valuePt: RP * S, label: "pitch {v}", rotated: false });
      if (+ventDrop > 0) featDims.push({ x1: (x0r - RD - 8) * S, y1: mapY(yb[2]), x2: (x0r - RD - 8) * S, y2: vy * S, valuePt: (vy * S - mapY(yb[2])), label: "{v}", rotated: true });
    } else for (let i = 0; i < nV; i++) {
      const cx = bx + (i - (nV - 1) / 2) * VP, y0 = by - VL / 2 + r, y1 = by + VL / 2 - r;
      push("l", [[cx - r, y0], [cx - r, y1]]);
      push("l", [[cx + r, y0], [cx + r, y1]]);
      push("c", [[cx - r, y0], [cx - r, y0 - K * r], [cx - K * r, y0 - r], [cx, y0 - r]]);
      push("c", [[cx, y0 - r], [cx + K * r, y0 - r], [cx + r, y0 - K * r], [cx + r, y0]]);
      push("c", [[cx + r, y1], [cx + r, y1 + K * r], [cx + K * r, y1 + r], [cx, y1 + r]]);
      push("c", [[cx, y1 + r], [cx - K * r, y1 + r], [cx - r, y1 + K * r], [cx - r, y1]]);
    }
    const x0 = bx - ((nV - 1) / 2) * VP;
    if (ventShape !== "round") {
    const xd = x0 + (nV - 1) * VP + r + 9;
    featDims.push({ x1: xd * S, y1: (by - VL / 2) * S, x2: xd * S, y2: (by + VL / 2) * S, valuePt: VL * S, label: "vent {v}", rotated: true });
    if (nV > 1) featDims.push({ x1: x0 * S, y1: (by + VL / 2 + 7) * S, x2: (x0 + VP) * S, y2: (by + VL / 2 + 7) * S, valuePt: VP * S, label: "pitch {v}", rotated: false });
    }
  }

  // optional FINGER NOTCH: a wide trapezoid scoop in the FRONT wall's free edge (the rim when
  // erected) so a finger gets under the lid — `fingerNotch` = width at the rim (mm), 12 deep,
  // sides slant in 6 mm each. Read off the same render: ASSUMED.
  const fN = +fingerNotch > 0 ? toMm(+fingerNotch) : 0;
  if (fN > 0) {
    const S = PT_PER_MM, ND = Math.min(12, Hm * 0.3), NS = 6;
    const cxp = (mapX(TUCK_XB[1]) + mapX(TUCK_XB[2])) / 2, half = (fN / 2) * S;
    const i = segments.findIndex((sg) => sg.layer === "cut" && sg.kind === "l"
      && Math.abs(sg.pts[0][1] - heightPt) < 0.05 && Math.abs(sg.pts[1][1] - heightPt) < 0.05
      && Math.min(sg.pts[0][0], sg.pts[1][0]) < cxp - half && Math.max(sg.pts[0][0], sg.pts[1][0]) > cxp + half);
    if (i < 0) warnings.push("Finger notch skipped — front-wall rim not found as one straight cut.");
    else {
      const [a, b] = segments[i].pts[0][0] < segments[i].pts[1][0] ? segments[i].pts : [segments[i].pts[1], segments[i].pts[0]];
      const yN = heightPt - ND * S, xi = half - NS * S;
      const ln = (p, q) => ({ layer: "cut", kind: "l", pts: [p, q] });
      if (notchShape === "round") {
        // semicircular U scoop, radius = width / 2 (Mog Mog sheet "secure locking lid" close-up, ASSUMED)
        const R = half, k = 0.5522847498 * R, yc = heightPt;
        const cv = (p0, p1, p2, p3) => ({ layer: "cut", kind: "c", pts: [p0, p1, p2, p3] });
        segments.splice(i, 1, ln(a, [cxp - R, yc]),
          cv([cxp - R, yc], [cxp - R, yc - k], [cxp - k, yc - R], [cxp, yc - R]),
          cv([cxp, yc - R], [cxp + k, yc - R], [cxp + R, yc - k], [cxp + R, yc]),
          ln([cxp + R, yc], b));
        featDims.push({ x1: cxp - R, y1: yc - R - 8 * S, x2: cxp + R, y2: yc - R - 8 * S, valuePt: fN * S, label: "finger notch {v} (U)", rotated: false });
      } else {
      segments.splice(i, 1,
        ln(a, [cxp - half, heightPt]), ln([cxp - half, heightPt], [cxp - xi, yN]), ln([cxp - xi, yN], [cxp + xi, yN]),
        ln([cxp + xi, yN], [cxp + half, heightPt]), ln([cxp + half, heightPt], b));
      featDims.push({ x1: cxp - half, y1: yN - 8 * S, x2: cxp + half, y2: yN - 8 * S, valuePt: fN * S, label: "finger notch {v}", rotated: false });
      }
    }
  }
  const blank = { widthPt, heightPt, flapDepthPt: Hm * PT_PER_MM, style: "tuckbox" };
  const dims = [
    { x1: mapX(TUCK_XB[1]), y1: mapY(yb[3]) + (Wm / 2) * PT_PER_MM, x2: mapX(TUCK_XB[2]), y2: mapY(yb[3]) + (Wm / 2) * PT_PER_MM, valuePt: Lm * PT_PER_MM, rotated: false },
    { x1: mapX(TUCK_XB[3]) + 17, y1: mapY(yb[3]), x2: mapX(TUCK_XB[3]) + 17, y2: mapY(yb[4]), valuePt: Wm * PT_PER_MM, rotated: true },
    { x1: mapX(TUCK_XB[0]) - 15, y1: mapY(yb[2]), x2: mapX(TUCK_XB[0]) - 15, y2: mapY(yb[3]), valuePt: Hm * PT_PER_MM, rotated: true },
    { x1: 0, y1: heightPt + 17, x2: widthPt, y2: heightPt + 17, valuePt: widthPt, rotated: false },
    ...holeDims,
    ...featDims,
  ];
  return { segments, blank, dims, warnings, valid: true };
}
