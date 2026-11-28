// SINGLE CUP HOLDER BOX WITH HANDLE (CHB-001..004, 13-Nov-2026) — one cup, carried by a handle.
// Traced 1:1 from a reference print layout (100 x 100 x 145 body, filled shapes only — no die file existed), cut/crease
// assigned from the construction:
//   x: glue 16.5 | HANDLE panel L | GUSSET panel W | HANDLE panel L | GUSSET panel W (free edge)
//   top: each HANDLE panel carries a flat lid half (W/2 deep) that folds in at the body top, then a rounded handle cap
//        (crease at its base) with a 36 x 11 hand hole — the two caps stand back to back over the cup.
//        Each GUSSET panel carries a triangle that folds over the lids; its centre slot (3.5 wide) threads over the caps.
//   bottom: 1-2-3 snap-lock, no glue.
// H stretches the body only (exact). L / W other than 100 scale the panel features along their own axis, with the hand hole
// and the slot width kept absolute — not die-proven, prototype first. Output in points, y-down.
import { PT_PER_MM } from "./cakebox.js";

const X0 = 24.13, Y0 = 53.89, YT = 147.3, YB = 292.3, REF_H = 145; // reference frame (mm)
const L_REF = 100, W_REF = 100;

// Reference geometry (mm, reference frame). l = line, c = cubic. Panels start at x 40.61 / 140.61 / 240.61 / 340.61.
const HANDLE_TOP = [ // handle panel at x 40.61 (copied +200 for the other one)
  ["cut", "l", [40.61, 147.3], [40.61, 97.3]],
  ["cut", "l", [40.61, 97.3], [60.36, 97.3]],
  ["cut", "c", [60.36, 97.3], [60.36, 96.5], [57.64, 95.69], [57.68, 94.89]],
  ["cut", "c", [57.68, 94.89], [58.7, 75.36], [73.12, 59.94], [90.61, 59.94]],
  ["cut", "c", [90.61, 59.94], [108.22, 59.94], [122.7, 75.18], [123.54, 94.89]],
  ["cut", "c", [123.54, 94.89], [123.57, 95.5], [120.32, 97.3], [120.86, 97.3]],
  ["cut", "l", [120.86, 97.3], [140.61, 97.3]],
  ["cut", "l", [140.61, 97.3], [140.61, 147.3]],
  ["crease", "l", [60.36, 97.3], [120.86, 97.3]], // cap fold
];
const HAND_HOLE = [ // 36.3 x 11 stadium, kept absolute
  ["cut", "c", [108.74, 83.01], [108.74, 86.04], [106.27, 88.51], [103.25, 88.51]],
  ["cut", "l", [103.25, 88.51], [77.97, 88.51]],
  ["cut", "c", [77.97, 88.51], [74.95, 88.51], [72.48, 86.04], [72.48, 83.01]],
  ["cut", "c", [72.48, 83.01], [72.48, 79.99], [74.95, 77.52], [77.97, 77.52]],
  ["cut", "l", [77.97, 77.52], [103.25, 77.52]],
  ["cut", "c", [103.25, 77.52], [106.27, 77.52], [108.74, 79.99], [108.74, 83.01]],
];
const GUSSET_TOP = [ // triangle on the gusset panel at x 140.61
  ["cut", "l", [140.61, 147.3], [180.6, 60.35]],
  ["cut", "c", [180.6, 60.35], [182.32, 56.54], [186.16, 53.89], [190.61, 53.89]],
  ["cut", "c", [190.61, 53.89], [195.07, 53.89], [198.9, 56.54], [200.63, 60.35]],
  ["cut", "l", [200.63, 60.35], [240.61, 147.3]],
];
const SLOT = [ // 3.5 x 61.7 slot on the triangle centre line, width kept absolute
  ["cut", "c", [192.36, 127.21], [192.36, 128.27], [191.57, 129.13], [190.61, 129.13]],
  ["cut", "c", [190.61, 129.13], [189.65, 129.13], [188.86, 128.27], [188.86, 127.21]],
  ["cut", "l", [188.86, 127.21], [188.86, 67.32]],
  ["cut", "c", [188.86, 67.32], [188.86, 66.26], [189.65, 65.4], [190.61, 65.4]],
  ["cut", "c", [190.61, 65.4], [191.57, 65.4], [192.36, 66.26], [192.36, 67.32]],
  ["cut", "l", [192.36, 67.32], [192.36, 127.21]],
];
const LAST_TRI = [ // the free-edge gusset's triangle stops 0.55 short of the panel edge (reference)
  ["cut", "l", [340.61, 147.3], [380.6, 60.35]],
  ["cut", "c", [380.6, 60.35], [382.32, 56.54], [386.16, 53.89], [390.61, 53.89]],
  ["cut", "c", [390.61, 53.89], [395.07, 53.89], [398.9, 56.54], [400.63, 60.35]],
  ["cut", "l", [400.63, 60.35], [440.06, 147.3]],
];
const BOTTOM = [ // 1-2-3 snap lock, one flap per panel
  ["cut", "l", [140.61, 292.3], [115.34, 342.3]], ["cut", "l", [115.34, 342.3], [115.34, 356.58]],
  ["cut", "c", [115.34, 356.58], [115.34, 359.61], [112.86, 362.08], [109.84, 362.08]], ["cut", "l", [109.84, 362.08], [71.38, 362.08]],
  ["cut", "c", [71.38, 362.08], [68.36, 362.08], [65.89, 359.61], [65.89, 356.58]], ["cut", "l", [65.89, 356.58], [65.89, 342.3]],
  ["cut", "l", [65.89, 342.3], [40.61, 292.3]],
  ["cut", "l", [240.61, 292.3], [190.61, 317.57]], ["cut", "l", [190.61, 317.57], [203.93, 336.5]],
  ["cut", "c", [203.93, 336.5], [204.85, 337.63], [205.41, 339.08], [205.41, 340.65]],
  ["cut", "c", [205.41, 340.65], [205.41, 344.29], [202.45, 347.24], [198.81, 347.24]],
  ["cut", "l", [198.81, 347.24], [143.81, 347.24]], ["cut", "l", [143.81, 347.24], [140.61, 292.3]],
  ["cut", "l", [340.61, 292.3], [337.86, 362.08]], ["cut", "l", [337.86, 362.08], [318.59, 362.08]],
  ["cut", "c", [318.59, 362.08], [315.56, 362.08], [313.1, 359.62], [313.1, 356.58]],
  ["cut", "c", [313.1, 356.58], [313.1, 356.06], [313.17, 355.56], [313.3, 355.08]], ["cut", "l", [313.3, 355.08], [315.89, 342.3]],
  ["cut", "l", [315.89, 342.3], [265.34, 342.3]], ["cut", "l", [265.34, 342.3], [267.92, 355.08]],
  ["cut", "c", [267.92, 355.08], [268.05, 355.56], [268.13, 356.06], [268.13, 356.58]],
  ["cut", "c", [268.13, 356.58], [268.13, 359.62], [265.67, 362.08], [262.63, 362.08]],
  ["cut", "l", [262.63, 362.08], [243.36, 362.08]], ["cut", "l", [243.36, 362.08], [240.61, 292.3]],
  ["cut", "l", [340.61, 292.3], [390.61, 317.57]], ["cut", "l", [390.61, 317.57], [377.29, 336.5]],
  ["cut", "c", [377.29, 336.5], [376.37, 337.63], [375.82, 339.08], [375.82, 340.65]],
  ["cut", "c", [375.82, 340.65], [375.82, 344.29], [378.77, 347.24], [382.41, 347.24]],
  ["cut", "l", [382.41, 347.24], [437.41, 347.24]], ["cut", "l", [437.41, 347.24], [440.06, 292.3]],
];
// The same 1-2-3 snap lock, for other engines (the drawer box sleeve's closed end). Reference frame: four 100 mm panels from
// x 40.61 (tongue | hook | slotted | hook, the last one 99.45 wide), flaps hanging below y 292.3.
export const SNAP_BOTTOM = { segs: BOTTOM, yB: YB, x0: 40.61, panel: 100, lastPanel: 99.45, bodyDepth: 50, depth: 362.08 - YB, hookDepth: 347.24 - YB, tongueW: 115.34 - 65.89, recessW: 315.89 - 265.34, prongW: 265.34 - 243.36 };
const GLUE = [ // 16.48 glue flap, 6.37 chamfer each end
  ["cut", "l", [40.61, 292.3], [24.13, 285.93]], ["cut", "l", [24.13, 285.93], [24.13, 153.67]], ["cut", "l", [24.13, 153.67], [40.61, 147.3]],
];

// lock: "ear" (Arjun 13-Nov-2026, "Keep the cuboid same. Just change the locking system", like a handle-lock carry box he showed):
// each handle cap gets an EAR at both sides of its base with a NOTCH under it; the gusset panels carry short pointed flaps
// (no slot) that fold flat on the lids and tuck their tips under the ears. Lid halves, caps and body unchanged. Our own design
// from a photo of a closed box — prototype first.
const EAR = { notch: 2.5, out: 9.8, h: 8, r: 2.5, flap: 17.5, tipR: 4 };
const C1 = [[57.68, 94.89], [58.7, 75.36], [73.12, 59.94], [90.61, 59.94]]; // left half of the cap arc (reference)
const bz = (P, t) => { const u = 1 - t; return [0, 1].map((i) => u * u * u * P[0][i] + 3 * u * u * t * P[1][i] + 3 * u * t * t * P[2][i] + t * t * t * P[3][i]); };
const splitTail = (P, t) => { // de Casteljau: the part of P from t to 1
  const l = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a = l(P[0], P[1]), b = l(P[1], P[2]), c = l(P[2], P[3]), d = l(a, b), e = l(b, c), f = l(d, e);
  return [f, e, c, P[3]];
};
function earHandleTop() {
  const yCrease = 97.3, yU = yCrease - EAR.notch, yTop = yU - EAR.h, x0 = 60.36, xO = x0 - EAR.out, r = EAR.r, k = 0.5522847498 * r;
  let lo = 0, hi = 1; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (bz(C1, m)[1] > yTop) lo = m; else hi = m; }
  const tail = splitTail(C1, (lo + hi) / 2), xj = tail[0][0];
  const left = [
    ["cut", "l", [40.61, 147.3], [40.61, 97.3]],
    ["cut", "l", [40.61, 97.3], [x0, 97.3]],
    ["cut", "l", [x0, 97.3], [x0, yU]], // notch inner wall
    ["cut", "l", [x0, yU], [xO + r, yU]], // ear underside
    ["cut", "c", [xO + r, yU], [xO + r - k, yU], [xO, yU - r + k], [xO, yU - r]],
    ["cut", "l", [xO, yU - r], [xO, yTop + r]],
    ["cut", "c", [xO, yTop + r], [xO, yTop + r - k], [xO + r - k, yTop], [xO + r, yTop]],
    ["cut", "l", [xO + r, yTop], [xj, yTop]],
    ["cut", "c", ...tail],
  ];
  const mx = ([x, y]) => [181.22 - x, y];
  const right = left.map(([layer, kind, ...pts]) => [layer, kind, ...pts.map(mx)]);
  return [...left, ...right, ["crease", "l", [x0, 97.3], [181.22 - x0, 97.3]]];
}
function earFlap(x0, x1) { // short pointed gusset flap with a rounded tip
  const T = [(x0 + x1) / 2 + (x1 < 440 ? 0 : 0.275), 147.3 - EAR.flap], A = [x0, 147.3], B = [x1, 147.3];
  const toward = (p, q, d) => { const dx = q[0] - p[0], dy = q[1] - p[1], n = Math.hypot(dx, dy); return [q[0] - dx / n * d, q[1] - dy / n * d]; };
  const a = toward(A, T, EAR.tipR), b = toward(B, T, EAR.tipR);
  const m = (p, s) => [p[0] + (T[0] - p[0]) * s, p[1] + (T[1] - p[1]) * s];
  return [["cut", "l", A, a], ["cut", "c", a, m(a, 0.55), m(b, 0.55), b], ["cut", "l", b, B]];
}

export function buildCupholderboxDieline({ L = 100, W = 100, H = 145, units = "mm", lock = "slot" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L), Wm = toMm(W), Hm = toMm(H);
  const warnings = ["Traced from a reference print layout (no production die) — prototype the first cut."];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  if (Math.abs(Lm - L_REF) > 0.01 || Math.abs(Wm - W_REF) > 0.01) warnings.push("L / W differ from the 100 x 100 reference: panel features scaled, hand hole + slot width absolute — check the closure on a sample.");
  if (Hm < 60) warnings.push("Body shorter than 60 mm: the glue-flap chamfers start to meet.");

  const dH = Hm - REF_H;
  const sL = Lm / L_REF, sW = Wm / W_REF;
  const sTop = sW; // lid half = W/2 deep; the cap and triangle follow it
  // panel origins in the output frame (mm): glue 0..16.48
  const G = 40.61 - X0;
  const px = [G, G + Lm, G + Lm + Wm, G + 2 * Lm + Wm];
  const pw = [Lm, Wm, Lm, Wm];
  const ear = lock === "ear";
  const yT = (YT - (ear ? 59.94 : Y0)) * sTop; // body top in output frame (blank top = triangle tip, or cap apex with the ear lock)
  const yB = yT + Hm;

  // map a reference point on panel k (reference panel origin rx) to the output frame
  const map = (k, rx, abs) => ([x, y]) => {
    const s = k % 2 === 0 ? sL : sW;
    const cx = rx + 50; // panel centre (reference)
    const ox = px[k] + pw[k] / 2;
    const dx = abs ? (x - cx) : (x - cx) * s;
    let oy;
    if (y <= YT + 1e-6) oy = yT - (YT - y) * (abs ? 1 : sTop);
    else if (y >= YB - 1e-6) oy = yB + (y - YB) * sW;
    else oy = yT + (y - YT) + (y > (YT + YB) / 2 ? dH : 0);
    return [ox + dx, oy];
  };
  // features absolute in size but centred where the scaled feature centre lands
  const mapAbs = (k, rx, cRef) => {
    const m = map(k, rx, false);
    const c = m(cRef);
    return ([x, y]) => [c[0] + (x - cRef[0]), c[1] + (y - cRef[1])];
  };

  const segs = [];
  const push = (layer, kind, pts) => segs.push({ layer, kind: kind === "l" ? "l" : "c", pts });
  const add = (list, f, dxRef = 0) => list.forEach(([layer, kind, ...pts]) => push(layer, kind, pts.map(([x, y]) => f([x + dxRef, y]))));

  add(GLUE, ([x, y]) => [x - X0, y <= YT + 1e-6 ? yT : y >= YB - 1e-6 ? yB : yT + (y - YT) + (y > (YT + YB) / 2 ? dH : 0)]);
  if (ear) warnings.push("Ear lock: our own design from a photo of a closed box (gusset tips tuck under ears at the handle base) — prototype first.");
  for (const k of [0, 2]) {
    const rx = 40.61 + (k === 2 ? 200 : 0);
    add(ear ? earHandleTop() : HANDLE_TOP, map(k, rx, false), k === 2 ? 200 : 0);
    add(HAND_HOLE, mapAbs(k, rx, [90.61 + (k === 2 ? 200 : 0), 83.01]), k === 2 ? 200 : 0);
  }
  if (ear) {
    add(earFlap(140.61, 240.61), map(1, 140.61, false));
    add(earFlap(340.61, 440.06), map(3, 340.61, false));
  } else {
    add(GUSSET_TOP, map(1, 140.61, false));
    add(SLOT, mapAbs(1, 140.61, [190.61, 97.27]));
    add(LAST_TRI, map(3, 340.61, false));
    add(SLOT, mapAbs(3, 340.61, [390.61, 97.27]), 200);
  }
  BOTTOM.forEach(([layer, kind, ...pts]) => {
    const xm = pts[0][0], k = xm < 140.6 + 0.01 && pts.every((p) => p[0] <= 140.62) ? 0 : pts.every((p) => p[0] >= 140.6 && p[0] <= 240.62) ? 1 : pts.every((p) => p[0] >= 240.6 && p[0] <= 340.62) ? 2 : 3;
    push(layer, kind, pts.map(map(k, 40.61 + 100 * k, false)));
  });

  // body: panel folds, glue fold, body top + bottom creases, free edge
  const xE = px[3] + Wm, xEi = xE - 0.55 * sW;
  push("crease", "l", [[px[0], yT], [px[0], yB]]);
  for (const k of [1, 2, 3]) push("crease", "l", [[px[k], yT], [px[k], yB]]);
  push("crease", "l", [[px[0], yT], [xEi, yT]]);
  push("crease", "l", [[px[0], yB], [xEi, yB]]);
  push("cut", "l", [[xEi, yT], [xE, yT]]);
  push("cut", "l", [[xE, yT], [xE, yB]]);
  push("cut", "l", [[xE, yB], [xEi, yB]]);

  const top = (YT - (ear ? 59.94 : 53.89)) * sTop; // blank top = cap apex (ear lock) or triangle tip (slot lock)
  const BH = yB + (362.08 - YB) * sW;
  // closure numbers (fold check)
  const lid = (YT - 97.3) * sTop;
  const triDepth = top, slotFrom = (YT - 129.13) * sTop, slotTo = (YT - 65.4) * sTop;
  const capBase = [px[0] + (60.36 - 40.61) * sL, px[0] + (120.86 - 40.61) * sL].map((x) => x - px[0]);
  const capMax = [(57.68 - 40.61) * sL, (123.54 - 40.61) * sL];
  const check = {
    lidHalves: `${lid.toFixed(1)} + ${lid.toFixed(1)} vs depth ${Wm.toFixed(1)} (meet at centre)`,
    triangles: `each ${triDepth.toFixed(1)} across L ${Lm.toFixed(1)} — lie on top of the lids, overlap ${(2 * triDepth - Lm).toFixed(1)}`,
    slotVsCap: `slot ${slotFrom.toFixed(1)}–${slotTo.toFixed(1)} from the side; cap base ${capBase[0].toFixed(1)}–${capBase[1].toFixed(1)}, cap widest ${capMax[0].toFixed(1)}–${capMax[1].toFixed(1)} (threaded over the cap)`,
    insideHeight: `${Hm.toFixed(1)} mm floor to closed lid`,
  };
  if (ear) {
    delete check.triangles; delete check.slotVsCap;
    const eIn = (60.36 - EAR.out - 40.61) * sL, eOut = (60.36 - 40.61) * sL;
    check.earLock = `ear spans ${eIn.toFixed(1)}–${eOut.toFixed(1)} from the side wall, ${EAR.notch} mm notch under it; gusset flap tip reaches ${(EAR.flap * sTop).toFixed(1)} (under the ear by ${(EAR.flap * sTop - eIn).toFixed(1)}, ${(eOut - EAR.flap * sTop).toFixed(1)} short of the cap)`;
    if (EAR.flap * sTop <= eIn || EAR.flap * sTop >= eOut) warnings.push("Gusset flap tip does not land under the ear.");
  } else if (slotFrom > capBase[0] || Lm - slotFrom < capBase[1]) warnings.push("Triangle slot shorter than the handle cap base — the triangles will not thread over the caps.");

  const S = PT_PER_MM;
  const segments = segs.map((sg) => ({ ...sg, pts: sg.pts.map(([x, y]) => [x * S, y * S]) }));
  // frame (mm, output frame) for the 3D fold program: panel origins / widths, body top + bottom folds, free edge, lid-half depth
  const blank = { widthPt: xE * S, heightPt: BH * S, flapDepthPt: top * S, style: "cupholderbox", check, frame: { px, pw, yT, yB, xE, lid, lock } };
  const dims = [
    { x1: px[0] * S, y1: (yT + Hm / 2) * S, x2: px[1] * S, y2: (yT + Hm / 2) * S, valuePt: Lm * S, rotated: false },
    { x1: px[1] * S, y1: (yT + Hm / 2 + 10) * S, x2: px[2] * S, y2: (yT + Hm / 2 + 10) * S, valuePt: Wm * S, rotated: false },
    { x1: 0, y1: (yT + Hm / 2 + 20) * S, x2: px[0] * S, y2: (yT + Hm / 2 + 20) * S, valuePt: px[0] * S, rotated: false },
    { x1: (xE + 6) * S, y1: yT * S, x2: (xE + 6) * S, y2: yB * S, valuePt: Hm * S, rotated: true },
    { x1: (xE + 6) * S, y1: (yT - lid) * S, x2: (xE + 6) * S, y2: yT * S, valuePt: lid * S, rotated: true },
    ...(ear ? [
      { x1: (px[1] + Wm / 2 + 6) * S, y1: (yT - EAR.flap * sTop) * S, x2: (px[1] + Wm / 2 + 6) * S, y2: yT * S, valuePt: EAR.flap * sTop * S, rotated: true },
      { x1: (px[0] + 4) * S, y1: 0, x2: (px[0] + 4) * S, y2: (yT - lid) * S, valuePt: (yT - lid) * S, rotated: true },
    ] : [{ x1: (px[1] + Wm / 2 + 6) * S, y1: 0, x2: (px[1] + Wm / 2 + 6) * S, y2: yT * S, valuePt: yT * S, rotated: true }]),
    { x1: (xE + 6) * S, y1: yB * S, x2: (xE + 6) * S, y2: BH * S, valuePt: (BH - yB) * S, rotated: true },
    { x1: 0, y1: BH * S + 17, x2: xE * S, y2: BH * S + 17, valuePt: xE * S, rotated: false },
    { x1: -14, y1: 0, x2: -14, y2: BH * S, valuePt: BH * S, rotated: true }, // page pad is 40 pt: outside dims in pt
  ];
  return { segments, blank, dims, warnings, valid: true };
}
