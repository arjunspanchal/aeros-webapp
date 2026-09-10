// ROPE-HANDLE BAG — OFFSET HALF-PUNCH keyline, calibrated to the Aeros
// "DRINK PAPER BAG PUNCH" production die (Sep-2026): a full rope-handle bag
// blank does not fit an offset bed, so the die cuts HALF the bag — one face,
// one gusset and a 20 mm seam lap — and two impressions paste into one bag.
// Reference (die-exact): face 291.3 × gusset 194.8 × height 270 mm
// (blank 506.1 × 427 = 19.93 × 16.81 in).
//
// Construction decoded from the die:
//   layout x: 20 seam | face W | gusset G (centre crease at G/2)
//   hem 30 mm; two Ø5 rope holes centred ON the hem crease, 105 mm apart
//     symmetric about the face — punched flat, they self-align when the hem
//     folds over
//   bottom: diamond apex G/2 above the bottom crease (same rule as the SOS
//     engine), cross crease at H − G/2, flap G/2 + 29.6 deep, split at the
//     face|gusset boundary with 4.7 mm tapers, corner radius 7.7, 20 mm
//     chamfer where the seam meets the bottom crease
// RED = cut (incl. holes), GREEN = crease.

import { PT_PER_MM } from "./cakebox.js";

const SEAM = 20, HEM = 30, CHAMFER = 20;
const HOLE_D = 5, HOLE_SPACING = 105;
const FLAP_LAP = 29.6, FLAP_TAPER = 4.7, CORNER_R = 7.7;
const K = 0.5522847498;

export function buildRopebagKeyline({ L, W, H, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Wm = toMm(L); // face width
  const G = toMm(W); // gusset
  const Hm = toMm(H); // bag height

  const warnings = [];
  if (!(Wm > 0) || !(G > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  warnings.push("OFFSET HALF-PUNCH: one impression = one face + one gusset + 20 mm seam; TWO impressions paste into one bag (a full rope-handle blank doesn't fit the offset bed). Calibrated to the Aeros drink-bag production die (291.3×194.8×270).");
  if (Wm < HOLE_SPACING + 35) warnings.push("Face narrower than ~140 mm — the fixed 105 mm rope-hole spacing crowds the edges; confirm hole positions.");
  if (Hm < G) warnings.push("Height under one gusset — the bottom cross crease rises above mid-bag; check the construction.");

  const xF0 = SEAM, xF1 = SEAM + Wm, xG1 = xF1 + G, xGm = xF1 + G / 2;
  const yHem = HEM, yBot = HEM + Hm, yApex = yBot - G / 2;
  const flapD = G / 2 + FLAP_LAP;
  const yFB = yBot + flapD; // flap bottom edge
  const yFC = yFB - CORNER_R; // corner start

  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });
  const bez = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });
  const circle = (cx, cy, r) => {
    const k = K * r;
    bez("cut", [cx + r, cy], [cx + r, cy - k], [cx + k, cy - r], [cx, cy - r]);
    bez("cut", [cx, cy - r], [cx - k, cy - r], [cx - r, cy - k], [cx - r, cy]);
    bez("cut", [cx - r, cy], [cx - r, cy + k], [cx - k, cy + r], [cx, cy + r]);
    bez("cut", [cx, cy + r], [cx + k, cy + r], [cx + r, cy + k], [cx + r, cy]);
  };

  // ---- outer cut ----
  line("cut", [0, 0], [xG1, 0]); // top edge
  line("cut", [0, 0], [0, yBot - CHAMFER]); // seam left edge
  line("cut", [0, yBot - CHAMFER], [xF0, yBot]); // seam chamfer
  line("cut", [xG1, 0], [xG1, yBot]); // right edge, panel band
  // face flap: taper both sides, rounded corners
  const fL0 = [xF0, yBot], fL1 = [xF0 + FLAP_TAPER, yFC];
  const fR0 = [xF1, yBot], fR1 = [xF1 - FLAP_TAPER, yFC];
  line("cut", fL0, fL1);
  bez("cut", fL1, [fL1[0] + 0.1, yFC + K * CORNER_R], [fL1[0] + CORNER_R - K * CORNER_R + 0.1, yFB], [fL1[0] + CORNER_R + 0.3, yFB]);
  line("cut", [fL1[0] + CORNER_R + 0.3, yFB], [fR1[0] - CORNER_R - 0.3, yFB]);
  bez("cut", [fR1[0] - CORNER_R - 0.3, yFB], [fR1[0] - CORNER_R + K * CORNER_R - 0.1, yFB], [fR1[0] - 0.1, yFC + K * CORNER_R], fR1);
  line("cut", fR0, fR1);
  // gusset flap: same treatment
  const gL0 = [xF1, yBot], gL1 = [xF1 + FLAP_TAPER, yFC];
  const gR0 = [xG1, yBot], gR1 = [xG1 - FLAP_TAPER, yFC];
  line("cut", gL0, gL1);
  bez("cut", gL1, [gL1[0] + 0.1, yFC + K * CORNER_R], [gL1[0] + CORNER_R - K * CORNER_R + 0.1, yFB], [gL1[0] + CORNER_R + 0.3, yFB]);
  line("cut", [gL1[0] + CORNER_R + 0.3, yFB], [gR1[0] - CORNER_R - 0.3, yFB]);
  bez("cut", [gR1[0] - CORNER_R - 0.3, yFB], [gR1[0] - CORNER_R + K * CORNER_R - 0.1, yFB], [gR1[0] - 0.1, yFC + K * CORNER_R], gR1);
  line("cut", gR0, gR1);

  // ---- rope holes: Ø5 ON the hem crease, fixed 105 mm apart on the face ----
  const cxMid = xF0 + Wm / 2, r = HOLE_D / 2;
  const holes = [cxMid - HOLE_SPACING / 2, cxMid + HOLE_SPACING / 2];
  for (const cx of holes) circle(cx, yHem, r);

  // ---- creases ----
  // hem crease, broken at the holes across the face; solid over seam + gusset
  line("crease", [0, yHem], [xF0, yHem]);
  line("crease", [xF0, yHem], [holes[0] - r, yHem]);
  line("crease", [holes[0] + r, yHem], [holes[1] - r, yHem]);
  line("crease", [holes[1] + r, yHem], [xG1, yHem]);
  // verticals: seam fold, face|gusset, gusset centre (through hem; centre runs through the flap too)
  line("crease", [xF0, 0], [xF0, yBot]);
  line("crease", [xF1, 0], [xF1, yBot]);
  line("crease", [xGm, 0], [xGm, yFB]);
  // bottom crease + cross crease at H − G/2 (full width incl. seam)
  line("crease", [xF0, yBot], [xG1, yBot]);
  line("crease", [0, yApex], [xG1, yApex]);
  // diamond diagonals
  line("crease", [xF1, yBot], [xGm, yApex]);
  line("crease", [xGm, yApex], [xG1, yBot]);

  // ---- scale ----
  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: xG1 * S, heightPt: yFB * S, flapDepthPt: flapD * S, style: "ropebag" };
  const dims = [
    { x1: xF0 * S, y1: (yHem + (Hm - G / 2) / 2) * S, x2: xF1 * S, y2: (yHem + (Hm - G / 2) / 2) * S, valuePt: Wm * S, label: "face {v}", rotated: false },
    { x1: xF1 * S, y1: (yHem + 40) * S, x2: xG1 * S, y2: (yHem + 40) * S, valuePt: G * S, label: "gusset {v}", rotated: false },
    { x1: (xG1 + 6) * S, y1: yHem * S, x2: (xG1 + 6) * S, y2: yBot * S, valuePt: Hm * S, label: "height {v}", rotated: true },
    { x1: holes[0] * S, y1: (yHem - 12) * S, x2: holes[1] * S, y2: (yHem - 12) * S, valuePt: HOLE_SPACING * S, label: "rope holes {v}", rotated: false },
    { x1: 0, y1: yFB * S + 17, x2: xG1 * S, y2: yFB * S + 17, valuePt: xG1 * S, rotated: false },
  ];
  return {
    segments, blank, dims, warnings, valid: true,
    meta: { seam: SEAM, hem: HEM, holeD: HOLE_D, holeSpacing: HOLE_SPACING, flapD, halfBag: true },
  };
}
