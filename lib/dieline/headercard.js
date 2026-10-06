// TAMPER HEADER CARD — a flat card folded lengthwise over a bag mouth and
// stapled / sealed through both layers. Measured from Arjun's sample
// (IMG_3378 / IMG_3379, 06-Oct-2026):
//   - card L (along the fold) x W (flat, across the fold), rounded corners
//   - CREASE along the full length at `fold` from the tear-strip edge
//   - round-ended SLOT centred on the fold (carry / hang slot once folded)
//   - TAMPER SIDE (Arjun's name, 06-Oct-2026) = the half carrying the TEAR STRIP:
//     two perforation lines parallel to its long edge
//     (at `perf1` and `perf1 + strip`), each with a V-notch at both ends to
//     start the tear — tearing it opens the pack (tamper evident)
// Perforation drawn as real cut dashes (1 mm cut / 1 mm tie = the confirmed
// "PERFORATE 1:1" rule from the wrap box) so the die-maker sets perf rule.
// Axes: x = across (0 = tear-strip edge), y = along the fold.

import { PT_PER_MM } from "./cakebox.js";

export function buildHeaderCardDieline({
  L = 300, W = 110, fold, slotW = 12, slotL = 110, perf1, strip = 9,
  radius = 6, notchW = 4, notchD = 3, perfCut = 1, perfTie = 1, units = "mm",
}) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(+L), Wm = toMm(+W);
  const warnings = ["Header card from the physical sample (photo-measured) — prototype the first cut."];
  if (!(Lm > 0) || !(Wm > 0)) return { segments: [], blank: null, warnings: ["Length and width must be positive."], valid: false };
  // fold = tear-strip side (fold to strip edge) = 75 (Arjun-measured, 06-Oct-2026);
  // current spec: plain side 35 -> card 110 (Arjun 06-Oct-2026: 30 -> 35, max that
  // still nests 16-up on 25x36 with butted rows). Default keeps that ratio.
  const xf = fold != null && +fold > 0 ? toMm(+fold) : Wm * (75 / 110);
  // tear strip sits nearer the edge on a short strip side: 20 mm on the sample (75 side),
  // 10 mm once the side is cut to 30 — so the strip + slot still fit before the fold
  const perfAt = perf1 != null && +perf1 > 0 ? toMm(+perf1) : xf <= 40 ? 10 : 20;
  const sw = toMm(+slotW), sl = toMm(+slotL), p1 = perfAt, p2 = p1 + toMm(+strip);
  const R = Math.min(toMm(+radius), Wm / 4, Lm / 4), nw = toMm(+notchW), nd = toMm(+notchD);
  if (p2 + 5 > xf - sw / 2) warnings.push("Tear strip runs into the slot / fold — move the strip or the fold.");
  if (sl > Lm - 40) warnings.push("Slot leaves under 20 mm of card at each end.");

  const segs = [];
  const line = (layer, x1, y1, x2, y2) => segs.push({ layer, kind: "l", pts: [[x1, y1], [x2, y2]] });
  const cub = (layer, p0, p1_, p2_, p3) => segs.push({ layer, kind: "c", pts: [p0, p1_, p2_, p3] });
  const K = 0.5523;

  // outline: top edge (y = 0) and bottom edge (y = L) carry the V-notches at both perf lines
  const edgeWithNotches = (y, dir) => {
    // left -> right along y, from x = R to x = W - R, with V-notches at p1 and p2
    let x = R;
    for (const xp of [p1, p2]) {
      line("cut", x, y, xp - nw / 2, y);
      line("cut", xp - nw / 2, y, xp, y + dir * nd);
      line("cut", xp, y + dir * nd, xp + nw / 2, y);
      x = xp + nw / 2;
    }
    line("cut", x, y, Wm - R, y);
  };
  edgeWithNotches(0, 1);
  edgeWithNotches(Lm, -1);
  line("cut", 0, R, 0, Lm - R);
  line("cut", Wm, R, Wm, Lm - R);
  // rounded corners
  cub("cut", [0, R], [0, R * (1 - K)], [R * (1 - K), 0], [R, 0]);
  cub("cut", [Wm - R, 0], [Wm - R * (1 - K), 0], [Wm, R * (1 - K)], [Wm, R]);
  cub("cut", [Wm, Lm - R], [Wm, Lm - R * (1 - K)], [Wm - R * (1 - K), Lm], [Wm - R, Lm]);
  cub("cut", [R, Lm], [R * (1 - K), Lm], [0, Lm - R * (1 - K)], [0, Lm - R]);

  // tear-strip perforations (notch tip to notch tip)
  for (const xp of [p1, p2]) {
    for (let y = nd; y < Lm - nd - 0.01; y += perfCut + perfTie) line("cut", xp, y, xp, Math.min(y + perfCut, Lm - nd));
  }

  // fold crease, broken by the slot
  const ys1 = (Lm - sl) / 2, ys2 = (Lm + sl) / 2, r = sw / 2;
  line("crease", xf, 0, xf, ys1);
  line("crease", xf, ys2, xf, Lm);
  // round-ended slot centred on the fold
  line("cut", xf - r, ys1 + r, xf - r, ys2 - r);
  line("cut", xf + r, ys1 + r, xf + r, ys2 - r);
  cub("cut", [xf - r, ys1 + r], [xf - r, ys1 + r * (1 - K)], [xf - r * (1 - K), ys1], [xf, ys1]);
  cub("cut", [xf, ys1], [xf + r * (1 - K), ys1], [xf + r, ys1 + r * (1 - K)], [xf + r, ys1 + r]);
  cub("cut", [xf + r, ys2 - r], [xf + r, ys2 - r * (1 - K)], [xf + r * (1 - K), ys2], [xf, ys2]);
  cub("cut", [xf, ys2], [xf - r * (1 - K), ys2], [xf - r, ys2 - r * (1 - K)], [xf - r, ys2 - r]);

  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: Wm * S, heightPt: Lm * S, flapDepthPt: 0, style: "headercard" };
  const yd = Lm * 0.82;
  const dims = [
    { x1: 0, y1: Lm * S + 17, x2: Wm * S, y2: Lm * S + 17, valuePt: Wm * S, label: "card W {v}", rotated: false },
    { x1: Wm * S + 14, y1: 0, x2: Wm * S + 14, y2: Lm * S, valuePt: Lm * S, label: "card L {v}", rotated: true },
    { x1: 0, y1: yd * S, x2: xf * S, y2: yd * S, valuePt: xf * S, label: "tamper side {v}", rotated: false },
    { x1: xf * S, y1: (yd + 12) * S, x2: Wm * S, y2: (yd + 12) * S, valuePt: (Wm - xf) * S, label: "plain side {v}", rotated: false },
    { x1: 0, y1: (Lm * 0.3) * S, x2: p1 * S, y2: (Lm * 0.3) * S, valuePt: p1 * S, label: "perf {v}", rotated: false },
    { x1: p1 * S, y1: (Lm * 0.3 + 10) * S, x2: p2 * S, y2: (Lm * 0.3 + 10) * S, valuePt: (p2 - p1) * S, label: "tear strip {v}", rotated: false },
    { x1: (xf + r + 6) * S, y1: ys1 * S, x2: (xf + r + 6) * S, y2: ys2 * S, valuePt: sl * S, label: "slot {v}", rotated: true },
    { x1: (xf - r) * S, y1: (ys2 + 7) * S, x2: (xf + r) * S, y2: (ys2 + 7) * S, valuePt: sw * S, label: "slot {v}", rotated: false },
    { x1: (xf + r + 18) * S, y1: 0, x2: (xf + r + 18) * S, y2: ys1 * S, valuePt: ys1 * S, label: "{v}", rotated: true },
  ];
  return { segments, blank, dims, warnings, valid: true, meta: { fold: xf, slot: [sw, sl], perf: [p1, p2], notch: [nw, nd], R } };
}
