// D-CUT BAG dieline — die-cut stadium-handle bag with fold-over hem and
// glued flat bottom, calibrated to Aeros's Burma Burma Small Bag production
// artwork (724 x ~525 mm blank, dimensions annotated on the file):
//
//   seam 25 | FACE 209.5 | gusset 140 | FACE 209.5 | gusset 140   = 724 mm
//   body 317.5 tall; 63.7 mm fold-over hem (rounded corners) above FACE 1
//   handle: 80 x 25.5 mm stadium slot, centre 33 mm below the mouth, cut in
//   both faces AND mirrored in the hem so the holes align when it folds over
//   bottom: crease at body height, then ~G/2 + 26 mm flaps with straight
//   cuts at the panel boundaries (gussets fold in first, faces glue over)
//
// Handle size is ergonomic, so it stays FIXED across bag sizes; everything
// else is parametric. RED = cut, GREEN = crease.

import { PT_PER_MM } from "./cakebox.js";

const KAPPA = 0.5522847498;

// die constants from the Burma Burma reference
const SEAM = 25;
const SEAM_DROP = 10; // chamfer on the seam's top corner
const HEM = 63.7;
const HEM_R = 16; // hem corner radius
const HANDLE_W = 80;
const HANDLE_H = 25.5;
const HANDLE_DROP = 33; // slot centre below the mouth fold
// When the gussets fold in, each half (G/2) lies BEHIND the face, so only the
// middle (F - G) of the face is single ply. The handle must be punched inside
// that zone: if it is not, the folded gusset edge lands inside the slot and
// the handle tears/looks wrong (Arjun, 25-Sep-2026 — the fault is visible on
// the production sample, and the Burma Burma reference itself violates it:
// F 209.5 - G 140 = 69.5 clear against an 80 mm handle).
const CLEAR_MARGIN = 6; // web needed between the slot end and the gusset fold


// HARD CONSTRAINT (locked 25-Sep-2026) — call this for ANY D-cut bag dims
// before drawing, quoting or ordering a die. Returns the clash verdict plus
// the two ways out (max gusset for that face, min face for that gusset).
export function checkDcutHandleClearance(faceMm, gussetMm, handleW = HANDLE_W) {
  const clear = faceMm - gussetMm;
  const need = handleW + 2 * CLEAR_MARGIN;
  return {
    clash: clear < need,
    clear: Math.round(clear * 10) / 10,
    need,
    webPerEnd: Math.round(((clear - handleW) / 2) * 10) / 10,
    maxGusset: Math.round((faceMm - need) * 10) / 10,
    minFace: Math.round((gussetMm + need) * 10) / 10,
  };
}

export function buildDcutbagDieline({ L, W, H, units = "mm" }) {
  // L = face width, W = gusset, H = body height (bags are W x G x H)
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const F = toMm(L);
  const G = toMm(W);
  const Hb = toMm(H);

  const warnings = [
    "Calibrated to the Burma Burma Small Bag production file — bottom flap depth (G/2 + 26) and hem come from that die; verify the first production sample.",
  ];
  if (!(F > 0) || !(G > 0) || !(Hb > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (G > F) warnings.push("Gusset wider than the face — check W / G order (bags are W x G x H).");
  if (F < HANDLE_W + 40) warnings.push("Face too narrow for the 80 mm handle slot — needs ~40 mm of web around it.");
  const fit = checkDcutHandleClearance(F, G);
  if (fit.clash) {
    warnings.unshift(
      `GUSSET FOULS THE HANDLE — DO NOT CUT THIS DIE: face ${F} \u2212 gusset ${G} leaves only ${fit.clear} mm single-ply, but the ${HANDLE_W} mm slot needs ${fit.need} mm (the gusset fold intrudes ${Math.abs(fit.webPerEnd)} mm into each end of the handle). Fix: gusset \u2264 ${fit.maxGusset} mm, or face \u2265 ${fit.minFace} mm.`,
    );
  }
  if (Hb < HANDLE_DROP + HANDLE_H) warnings.push("Bag too short for the handle position.");

  const bottom = G / 2 + 26;
  const BW = SEAM + 2 * F + 2 * G;
  // y = 0 at the mouth fold; hem above (negative y), flaps below the body
  const yTop = -HEM;
  const yBot = Hb + bottom;

  const segs = [];
  const line = (layer, x1, y1, x2, y2) => segs.push({ layer, kind: "l", pts: [[x1, y1], [x2, y2]] });
  const bez = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });
  const arc90 = (layer, x1, y1, x2, y2, cx, cy) => {
    const k = KAPPA;
    bez(layer, [x1, y1], [x1 + (cx - x1) * k, y1 + (cy - y1) * k], [x2 + (cx - x2) * k, y2 + (cy - y2) * k], [x2, y2]);
  };

  const xF1 = SEAM; // seam | face 1
  const xG1 = xF1 + F; // face 1 | gusset 1
  // (gusset-fold landing lines are drawn after the panels, see GUSSET SHADOW)
  const xF2 = xG1 + G; // gusset 1 | face 2
  const xG2 = xF2 + F; // face 2 | gusset 2

  // ---- cut outline ----
  // left edge + chamfered seam top
  line("cut", 0, SEAM_DROP, 0, yBot);
  line("cut", 0, SEAM_DROP, xF1, 0);
  // hem over face 1 (rounded outer corners)
  line("cut", xF1, 0, xF1, yTop + HEM_R);
  arc90("cut", xF1, yTop + HEM_R, xF1 + HEM_R, yTop, xF1, yTop);
  line("cut", xF1 + HEM_R, yTop, xG1 - HEM_R, yTop);
  arc90("cut", xG1 - HEM_R, yTop, xG1, yTop + HEM_R, xG1, yTop);
  line("cut", xG1, yTop + HEM_R, xG1, 0);
  // straight mouth edge across gusset 1 | face 2 | gusset 2
  line("cut", xG1, 0, BW, 0);
  // right edge, bottom edge
  line("cut", BW, 0, BW, yBot);
  line("cut", BW, yBot, 0, yBot);
  // bottom flap separation cuts at the panel boundaries
  for (const x of [xF1, xG1, xF2, xG2]) line("cut", x, Hb, x, yBot);

  // ---- creases ----
  // vertical panel folds through the body
  for (const x of [xF1, xG1, xF2, xG2]) line("crease", x, 0, x, Hb);
  // gusset centre folds (flat collapse)
  line("crease", xG1 + G / 2, 0, xG1 + G / 2, Hb);
  line("crease", xG2 + G / 2, 0, xG2 + G / 2, Hb);
  // mouth fold (hem) across face 1 + seam
  line("crease", 0, 0, xG1, 0);
  // bottom fold across the full blank
  line("crease", 0, Hb, BW, Hb);

  // ---- handle slots (stadium 80 x 25.5) ----
  const stadium = (cx, cy) => {
    const r = HANDLE_H / 2;
    const x1 = cx - HANDLE_W / 2 + r, x2 = cx + HANDLE_W / 2 - r;
    line("cut", x1, cy - r, x2, cy - r);
    line("cut", x1, cy + r, x2, cy + r);
    arc90("cut", x2, cy - r, x2 + r, cy, x2 + r, cy - r);
    arc90("cut", x2 + r, cy, x2, cy + r, x2 + r, cy + r);
    arc90("cut", x1, cy + r, x1 - r, cy, x1 - r, cy + r);
    arc90("cut", x1 - r, cy, x1, cy - r, x1 - r, cy - r);
  };
  stadium(xF1 + F / 2, HANDLE_DROP); // face 1
  stadium(xF2 + F / 2, HANDLE_DROP); // face 2
  stadium(xF1 + F / 2, -HANDLE_DROP); // hem (aligns with face 1 when folded)

  // shift everything so y starts at 0 for export
  // ---- GUSSET SHADOW: where the folded gusset halves land on each face ----
  // dashed safe lines through the handle band, so a clash is visible on the die
  {
    const yA = yTop, yB = HANDLE_DROP + HANDLE_H;
    for (const xa of [xF1, xF2]) {
      for (const xi of [xa + G / 2, xa + F - G / 2]) line("safe", xi, yA, xi, yB);
    }
  }

  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, (y - yTop) * S]) }));
  const BH = HEM + Hb + bottom;
  const blank = { widthPt: BW * S, heightPt: BH * S, flapDepthPt: bottom * S, style: "dcutbag" };

  const yMid = (HEM + Hb / 2) * S;
  const dims = [
    { x1: xF1 * S, y1: yMid, x2: xG1 * S, y2: yMid, valuePt: F * S, rotated: false }, // face
    { x1: xG1 * S, y1: yMid + 28, x2: xF2 * S, y2: yMid + 28, valuePt: G * S, rotated: false }, // gusset
    { x1: (xG2 + G / 4) * S, y1: HEM * S, x2: (xG2 + G / 4) * S, y2: (HEM + Hb) * S, valuePt: Hb * S, rotated: true }, // height
    { x1: 0, y1: -15, x2: SEAM * S, y2: -15, valuePt: SEAM * S, rotated: false }, // seam
    { x1: (xF1 + F / 2 - HANDLE_W / 2) * S, y1: (HEM + HANDLE_DROP - 22) * S, x2: (xF1 + F / 2 + HANDLE_W / 2) * S, y2: (HEM + HANDLE_DROP - 22) * S, valuePt: HANDLE_W * S, rotated: false }, // handle
    { x1: 0, y1: BH * S + 17, x2: BW * S, y2: BH * S + 17, valuePt: BW * S, rotated: false }, // blank W
  ];

  return {
    segments,
    blank,
    dims,
    warnings,
    valid: true,
    meta: { seam: SEAM, hem: HEM, bottom, handle: { w: HANDLE_W, h: HANDLE_H, drop: HANDLE_DROP } },
  };
}
