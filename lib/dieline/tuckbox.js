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

export function buildTuckboxDieline({ L, W, H, thickness, windowW, windowH, lockTab, vents = 0, ventShape = "slot", ventPitch, ventDrop, fingerNotch = 0, notchShape = "trap", noLid = false, units = "mm" }) {
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
    warnings.push(`Fold allowances stepped for ${t} mm caliper (reference die cut for E-flute 1.5 mm) — have the die maker confirm before cutting.${t < 1 ? ` Side-wall inner ply held to H - ${(t + 0.5).toFixed(2)} mm so it clears the base.` : ""}`);
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
  // absBand (21-Nov-2026): in that band the allowance zones at both ends keep their real size and only the middle
  // stretches. The LENGTH band needs it: the front wall / lid insets beside the base creases are caliper allowances
  // (0.5-4 mm in the reference), but plain band scaling multiplied them by L / 152.4 - on the 356 mm steak box the
  // front wall came out 5.5 mm short each side and its dust flap stood off the side wall. Identity when the scale is 1.
  const mapAxis = (v, bands, scales, absBand = -1) => {
    let out = 0;
    for (let i = 0; i < scales.length; i++) {
      const b0 = bands[i], b1 = bands[i + 1], B = b1 - b0, tgt = B * scales[i];
      if (v >= b1) { out += tgt; continue; }
      const u = Math.max(0, v - b0);
      if (i !== absBand) return out + u * scales[i];
      const Z = Math.min(ALLOW_R * tf, B / 2 - 0.01);
      return out + (u <= Z ? u : u >= B - Z ? tgt - (B - u) : Z + ((u - Z) * (tgt - 2 * Z)) / (B - 2 * Z));
    }
    return out;
  };
  const mapXraw = (x) => mapAxis(Math.max(remapX(x), 0), TUCK_XB, xScales, 1) * PT_PER_MM;
  // INNER PLY of the rolled side wall on folding board (21-Nov-2026). Reference (E-flute 1.5 mm): wall 50.8, roll
  // 57.8 -> 53.8, inner ply 53.8 -> 5.0 = 48.8 = H - (caliper + 0.5), so the ply hangs clear of the base. Stepping the
  // caliper narrowed the roll but left the ply's free edge where it was, so on 0.42-0.5 mm board the ply came out
  // 0.7-1.1 mm LONGER than the wall and bottomed on the base before the roll closed (3D fold check, all seven proven
  // sizes). On board (< 1 mm) the ply is now held to H - (caliper + 0.5): everything outboard of the outer roll crease
  // moves in by the difference. Corrugated keeps the die maker's own blank untouched.
  const X_ROLL = 53.8, X_ROLL_R = TUCK_XB[3] - X_ROLL;
  const plyFix = t < 1 ? mapXraw(X_ROLL) - mapXraw(5.0) - (Hm - (t + 0.5)) * PT_PER_MM : 0;
  const mapX0 = (x) => mapXraw(x) + (x < X_ROLL - 1e-6 ? plyFix : x > X_ROLL_R + 1e-6 ? -plyFix : 0);
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

  // CORNER EAR CAP (25-Nov-2026, Good Pet matchbox drawer). The front and back walls each carry a corner ear that folds round
  // the corner and lies inside the rolled side wall, i.e. ALONG W. The die maker sized the ears by W (ear / W = 0.31 / 0.36 /
  // 0.43 on the 6x6 / 6x4 / 6x2 dies, the two ears never closer than 6.8 mm), but the side band scales them with H, so a tall
  // wall on a narrow box grows ears that cross inside the side wall (110 x 111 x 99: by 33 mm). When the two ears would come
  // closer than 2 mm, both are narrowed about their fold by the same factor. Only bites when they would cross: every box with
  // the ears 2 mm or more apart (all filed dies, the closest at 4.3 mm) is unchanged.
  {
    const S = PT_PER_MM, E = 0.05;
    const bx0 = mapX(TUCK_XB[1]), bx1 = mapX(TUCK_XB[2]);
    const bands = [[mapY(yb[2]), mapY(yb[3])], [mapY(yb[4]), mapY(yb[5])]]; // back wall, front wall
    const inBand = (sg, [y0, y1]) => sg.pts.every((p) => p[1] >= y0 - E && p[1] <= y1 + E) && !sg.pts.every((p) => Math.abs(p[1] - y0) < E || Math.abs(p[1] - y1) < E);
    // ear lines: inside a wall band, outboard of a base crease, not lying on the band's edge lines (those are shared with the side wall)
    const earsOf = (band, side) => segments.filter((sg) => sg.layer === "cut" && inBand(sg, band) && sg.pts.every((p) => (side < 0 ? p[0] <= bx0 + 1.2 * S : p[0] >= bx1 - 1.2 * S)) && sg.pts.some((p) => (side < 0 ? p[0] < bx0 - E : p[0] > bx1 + E)));
    const width = (segs, side) => (segs.length ? Math.max(...segs.flatMap((sg) => sg.pts.map((p) => (side < 0 ? bx0 - p[0] : p[0] - bx1)))) / S : 0);
    const eB = width(earsOf(bands[0], -1), -1), eF = width(earsOf(bands[1], -1), -1);
    if (eB > 0 && eF > 0 && eB + eF > Wm - 2) {
      const k = (Wm - 2) / (eB + eF);
      for (const band of bands) for (const side of [-1, 1]) for (const sg of earsOf(band, side)) {
        sg.pts = sg.pts.map(([x, y]) => [side < 0 ? (x < bx0 ? bx0 - (bx0 - x) * k : x) : (x > bx1 ? bx1 + (x - bx1) * k : x), y]);
      }
      warnings.push(`Corner ears narrowed to ${(eF * k).toFixed(1)} / ${(eB * k).toFixed(1)} mm: the wall is tall for a ${Wm.toFixed(1)} mm wide box and at full width the front and back ears would cross by ${(eB + eF - Wm).toFixed(1)} mm inside the side wall (now 2 mm apart). Not die-proven - prototype first.`);
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
  // NO LID (Arjun 04-Nov-2026, "a box like Chuim without lid"): the same locked tray, rolled walls + lock tabs + ears kept.
  // Everything above the back-wall fold goes and the back wall becomes a mirror of the front wall, so it has a plain rim.
  if (noLid) {
    const yBack = mapY(yb[3]), yFront = mapY(yb[4]), EPS = 0.05, S = PT_PER_MM;
    const yMirror = yBack + yFront;
    const maxY = (sg) => Math.max(...sg.pts.map((p) => p[1]));
    const minY = (sg) => Math.min(...sg.pts.map((p) => p[1]));
    const kept = segments.filter((sg) => maxY(sg) > yBack + EPS);
    const back = segments.filter((sg) => minY(sg) >= yFront - EPS).map((sg) => ({ ...sg, pts: sg.pts.map(([x, y]) => [x, yMirror - y]) }));
    const yTop = yBack - (heightPt - yFront);
    const out = [...kept, ...back].map((sg) => ({ ...sg, pts: sg.pts.map(([x, y]) => [x, y - yTop]) }));
    const h = heightPt - yTop, bx0 = mapX(TUCK_XB[1]), bx1 = mapX(TUCK_XB[2]), by0 = yBack - yTop, by1 = yFront - yTop;
    const xRoll = (() => { // outer wall / inner ply fold, from the rolled wall's own creases
      const xs = out.filter((sg) => sg.layer === "crease" && sg.kind === "l" && Math.abs(sg.pts[0][0] - sg.pts[1][0]) < EPS && sg.pts[0][0] < bx0 - EPS).map((sg) => sg.pts[0][0]);
      return [Math.min(...xs), Math.max(...xs)];
    })();
    const earX = Math.min(...out.filter((sg) => sg.layer === "cut" && minY(sg) > by1 + EPS).flatMap((sg) => sg.pts.map((p) => p[0])));
    const earFold = Math.min(...out.filter((sg) => sg.layer === "crease" && sg.kind === "l" && minY(sg) >= by1 - EPS && Math.abs(sg.pts[0][0] - sg.pts[1][0]) < EPS).map((sg) => sg.pts[0][0]));
    const slotCuts = out.filter((sg) => sg.layer === "cut" && sg.kind === "l" && Math.abs(sg.pts[0][0] - bx0) < EPS && Math.abs(sg.pts[1][0] - bx0) < EPS);
    const slotY = slotCuts[0].pts.map((p) => p[1]);
    const tabEdge = out.find((sg) => sg.layer === "cut" && sg.kind === "l" && Math.abs(sg.pts[0][0]) < EPS && Math.abs(sg.pts[1][0]) < EPS);
    const tabY = tabEdge.pts.map((p) => p[1]).sort((u, v) => u - v);
    const dimsNoLid = [
      { x1: bx0, y1: (by0 + by1) / 2, x2: bx1, y2: (by0 + by1) / 2, valuePt: Lm * S, label: "base L {v}", rotated: false },
      { x1: bx0 + 30 * S, y1: by0, x2: bx0 + 30 * S, y2: by1, valuePt: Wm * S, label: "base W {v}", rotated: true },
      { x1: bx0 + 30 * S, y1: 0, x2: bx0 + 30 * S, y2: by0, valuePt: Hm * S, label: "wall {v}", rotated: true },
      { x1: xRoll[1], y1: by0 + 20 * S, x2: bx0, y2: by0 + 20 * S, valuePt: bx0 - xRoll[1], label: "rolled wall {v}", rotated: false },
      { x1: Tt, y1: by0 + 12 * S, x2: xRoll[0], y2: by0 + 12 * S, valuePt: xRoll[0] - Tt, label: "inner ply {v}", rotated: false },
      { x1: Tt + 6 * S, y1: tabY[0], x2: Tt + 6 * S, y2: tabY[1], valuePt: tabY[1] - tabY[0], label: `lock tab {v} x ${tabMm} deep`, rotated: true },
      { x1: bx0 + 8 * S, y1: Math.min(...slotY), x2: bx0 + 8 * S, y2: Math.max(...slotY), valuePt: Math.abs(slotY[0] - slotY[1]), label: "lock slot {v}", rotated: true },
      { x1: earX, y1: h - 8 * S, x2: earFold, y2: h - 8 * S, valuePt: earFold - earX, label: "ear {v}", rotated: false },
      { x1: 0, y1: h + 17, x2: widthPt, y2: h + 17, valuePt: widthPt, label: "blank {v}", rotated: false },
      { x1: widthPt + 17, y1: 0, x2: widthPt + 17, y2: h, valuePt: h, label: "blank {v}", rotated: true },
    ];
    return { segments: out, blank: { widthPt, heightPt: h, flapDepthPt: Hm * S, style: "tuckbox" }, dims: dimsNoLid, warnings, valid: true };
  }
  // frame (mm) for the 3D fold program: the base panel band
  const blank = { widthPt, heightPt, flapDepthPt: Hm * PT_PER_MM, style: "tuckbox",
    frame: { bx0: mapX(TUCK_XB[1]) / PT_PER_MM, bx1: mapX(TUCK_XB[2]) / PT_PER_MM, by0: mapY(yb[3]) / PT_PER_MM, by1: mapY(yb[4]) / PT_PER_MM, L: Lm, W: Wm, H: Hm, caliper: t } };
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
