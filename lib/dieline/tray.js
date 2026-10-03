// EAR-LOCK TRAY dieline (FEFCO 0421 family) — glue-free open tray: base with
// four walls, side-wall corner ears wrap the end walls, end walls carry a
// fold-over lip whose tabs lock into slots in the base. The same proven lock
// pattern as the 0427 mailer sides. For a telescope (top + bottom) set, the
// walls are DOUBLE board (ears / lips fold over), so the base outside is
// L + 4t x W + 4t: generate the cover at (L + 4t + 2, W + 4t + 2) — 1 mm play
// per side — with the cover height.
// Internal L x W x H; thickness from the material caliper.

import { PT_PER_MM } from "./cakebox.js";

export function buildTrayDieline({ L, W, H, thickness, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L); // long side (ear walls attach to the long sides)
  const D = toMm(W); // short side
  const Hm = toMm(H);
  const t = +thickness > 0 ? +thickness : 0.5;

  const warnings = ["Standard ear-lock tray (0421 family) — prototype the first cut."];
  if (!(Lm > 0) || !(D > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (Hm > D / 2) warnings.push("Walls taller than half the width — lip tabs crowd the base slots.");

  const hi = Math.max(8, Hm - 1.5 * t); // end-wall fold-over lip
  const ear = Math.max(8, Hm - t); // side-wall corner ears
  const ch = Math.min(10, ear / 2);
  const tabL = Math.max(18, Math.min(32, Lm / 6));
  const tabD = 7;

  // layout: base centred; long walls above/below (y), end walls left/right (x)
  const cx = D / 2 + Hm + t + hi + tabD;
  const cy = Lm / 2 + Hm; // long walls have no lip
  // NOTE axes: base L runs VERTICALLY here (long walls left/right? keep simple):
  // base W x L with: LEFT/RIGHT = end walls (short sides, with lips), TOP/BOTTOM
  // = long walls (with ears). Base spans x in [cx-D/2, cx+D/2], y in [cy-Lm/2, cy+Lm/2].
  const bx1 = cx - D / 2, bx2 = cx + D / 2;
  const by1 = cy - Lm / 2, by2 = cy + Lm / 2;

  const segs = [];
  const line = (layer, xa, ya, xb, yb) => segs.push({ layer, kind: "l", pts: [[xa, ya], [xb, yb]] });

  // base creases
  line("crease", bx1, by1, bx2, by1);
  line("crease", bx1, by2, bx2, by2);
  line("crease", bx1, by1, bx1, by2);
  line("crease", bx2, by1, bx2, by2);

  // ---- long walls (top/bottom) with corner ears ----
  for (const [yw, dir] of [[by1, -1], [by2, +1]]) {
    const yOut = yw + dir * Hm;
    line("cut", bx1, yOut, bx2, yOut); // wall outer edge
    for (const [xw, xdir] of [[bx1, -1], [bx2, +1]]) {
      line("crease", xw, yw, xw, yOut); // ear fold (wall side edge)
      line("cut", xw, yOut, xw + xdir * ear, yOut); // ear outer edge (along wall rim)
      line("cut", xw + xdir * ear, yOut, xw + xdir * ear, yw + dir * ch);
      line("cut", xw + xdir * ear, yw + dir * ch, xw + xdir * (ear - ch), yw);
      line("cut", xw + xdir * (ear - ch), yw, xw + xdir * t, yw);
    }
  }

  // ---- end walls (left/right) with fold-over lip + lock tabs ----
  for (const [xw, xdir] of [[bx1, -1], [bx2, +1]]) {
    const xOut = xw + xdir * Hm; // wall | lip fold
    const xLip = xOut + xdir * hi; // lip free edge
    line("cut", xw, by1, xOut, by1); // wall top edge
    line("cut", xw, by2, xOut, by2);
    line("crease", xOut, by1, xOut, by2); // lip fold
    line("cut", xOut, by1, xLip, by1 + 2); // lip end chamfers
    line("cut", xOut, by2, xLip, by2 - 2);
    // lip free edge with two tabs
    const ty1 = cy - Lm / 4 - tabL / 2;
    const ty2 = cy + Lm / 4 - tabL / 2;
    line("cut", xLip, by1 + 2, xLip, ty1);
    for (const ty of [ty1, ty2]) {
      line("cut", xLip, ty, xLip + xdir * tabD, ty + 2);
      line("cut", xLip + xdir * tabD, ty + 2, xLip + xdir * tabD, ty + tabL - 2);
      line("cut", xLip + xdir * tabD, ty + tabL - 2, xLip, ty + tabL);
    }
    line("cut", xLip, ty1 + tabL, xLip, ty2);
    line("cut", xLip, ty2 + tabL, xLip, by2 - 2);
    // matching slots in the base, just inside the wall fold
    for (const ty of [ty1, ty2]) {
      line("cut", xw - xdir * 3, ty, xw - xdir * 3, ty + tabL);
    }
  }

  const S = PT_PER_MM;
  const BW = 2 * cx, BH = 2 * cy;
  const segments = segs.map((sg) => ({ ...sg, pts: sg.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: BW * S, heightPt: BH * S, flapDepthPt: Hm * S, style: "tray" };
  const dims = [
    { x1: bx1 * S, y1: cy * S, x2: bx2 * S, y2: cy * S, valuePt: D * S, rotated: false },
    { x1: (bx2 + Hm + t + hi + tabD) * S + 8, y1: by1 * S, x2: (bx2 + Hm + t + hi + tabD) * S + 8, y2: by2 * S, valuePt: Lm * S, rotated: true },
    { x1: bx1 * S, y1: (by1 - Hm) * S - 12, x2: bx2 * S, y2: (by1 - Hm) * S - 12, valuePt: D * S, rotated: false },
    { x1: 0, y1: BH * S + 17, x2: BW * S, y2: BH * S + 17, valuePt: BW * S, rotated: false },
  ];
  return { segments, blank, dims, warnings, valid: true };
}
