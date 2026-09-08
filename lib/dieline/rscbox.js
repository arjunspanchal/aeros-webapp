// SHIPPER / RSC (FEFCO 0201) dieline — regular slotted container for the
// heavy corrugated shippers (5-ply master cartons). Modelled on the Aeros
// 8 oz DW cup shipper keyline ("8 OZ.pdf", Sep-2026): panels L | W | L | W
// (415 | 340 | 415 | 340 on the reference), panel height 500, meeting flaps
// W/2 deep top and bottom, and a 20 mm artwork-safe inset frame on every
// vertical panel — the reference is an ARTWORK keyline (plain panel frames),
// so the production details here follow standard double-wall RSC practice
// and are flagged for the die maker:
//   score widths  = internal + 1 caliper (L+t, W+t)
//   panel height  = H + t + 3 mm slack
//   flap depth    = (W+t)/2  (flaps meet)
//   slot width    = t + 3 (≈9.5 mm on 5-ply), cut to the flap score
//   join flap     = 40 mm, chamfered 12 mm (stitch/glue lap)
// RED = cut, GREEN = score, ORANGE DASH = artwork-safe frame (20 mm inset).

import { PT_PER_MM } from "./cakebox.js";

const JOIN_W = 40, JOIN_CHAMFER = 12;
const SLACK_H = 3, SLOT_EXTRA = 3, SAFE_INSET = 20;
const DEF_T = 6.5; // BC 5-ply

export function buildRscboxDieline({ L, W, H, thickness, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L);
  const Wm = toMm(W);
  const Hm = toMm(H);

  const warnings = [];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  const t = +thickness > 0 ? +thickness : DEF_T;
  if (t < 2.5) warnings.push("Caliper under 2.5 mm — RSC shippers are normally 3/5/7-ply corrugated; check the material.");
  warnings.push("Allowances follow standard RSC practice (score = internal + 1 caliper, flap = (W+t)/2, slot = caliper + 3) — the reference keyline is an artwork template without production slots, so have the die maker confirm.");

  const pL = Lm + t, pW = Wm + t;
  const PH = Hm + t + SLACK_H;
  // flaps are sized to the SMALLER footprint dim so the majors meet flush
  const F = (Math.min(Lm, Wm) + t) / 2;
  if (Wm > Lm) warnings.push("W > L: flap depth follows the smaller dim (L), so the flaps on the W panels meet and the L-panel flaps underlap — swap L/W if you want it the other way.");
  const S = Math.max(6, t + SLOT_EXTRA);

  const x0 = JOIN_W;
  const scores = [x0, x0 + pL, x0 + pL + pW, x0 + 2 * pL + pW, x0 + 2 * pL + 2 * pW];
  const xEnd = scores[4];
  const yF0 = F, yF1 = F + PH, yBot = F + PH + F;

  const segs = [];
  const line = (layer, a, b) => segs.push({ layer, kind: "l", pts: [a, b] });

  // slot notches sit on the three internal scores; outer edges are plain cuts
  const slotX = [scores[1], scores[2], scores[3]];
  const edgeRun = (y, ySlot) => {
    // horizontal blank edge at y, notched at each slot down/up to the flap score ySlot
    let x = x0;
    for (const sx of slotX) {
      line("cut", [x, y], [sx - S / 2, y]);
      line("cut", [sx - S / 2, y], [sx - S / 2, ySlot]);
      line("cut", [sx - S / 2, ySlot], [sx + S / 2, ySlot]);
      line("cut", [sx + S / 2, ySlot], [sx + S / 2, y]);
      x = sx + S / 2;
    }
    line("cut", [x, y], [xEnd, y]);
  };
  edgeRun(0, yF0);
  edgeRun(yBot, yF1);

  // right edge — full height
  line("cut", [xEnd, 0], [xEnd, yBot]);
  // left edge — flap edges + chamfered join flap over the panel band
  line("cut", [x0, 0], [x0, yF0]);
  line("cut", [x0, yF0], [0, yF0 + JOIN_CHAMFER]);
  line("cut", [0, yF0 + JOIN_CHAMFER], [0, yF1 - JOIN_CHAMFER]);
  line("cut", [0, yF1 - JOIN_CHAMFER], [x0, yF1]);
  line("cut", [x0, yF1], [x0, yBot]);

  // vertical scores (join + 3 internal), panel band only
  for (const sx of scores.slice(0, 4)) line("crease", [sx, yF0], [sx, yF1]);
  // horizontal flap scores, drawn per panel between slot half-widths
  for (const y of [yF0, yF1]) {
    for (let i = 0; i < 4; i++) {
      const a = scores[i] + (i > 0 ? S / 2 : 0);
      const b = scores[i + 1] - (i < 3 ? S / 2 : 0);
      line("crease", [a, y], [b, y]);
    }
  }

  // artwork-safe frames — 20 mm inset per vertical panel (reference convention)
  for (let i = 0; i < 4; i++) {
    const a = scores[i] + SAFE_INSET, b = scores[i + 1] - SAFE_INSET;
    const c = yF0 + SAFE_INSET, d = yF1 - SAFE_INSET;
    line("safe", [a, c], [b, c]);
    line("safe", [b, c], [b, d]);
    line("safe", [b, d], [a, d]);
    line("safe", [a, d], [a, c]);
  }

  const Sc = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * Sc, y * Sc]) }));
  const blank = { widthPt: xEnd * Sc, heightPt: yBot * Sc, flapDepthPt: F * Sc, style: "rscbox" };
  const yMid = (yF0 + PH / 2) * Sc;
  const dims = [
    { x1: scores[0] * Sc, y1: yMid, x2: scores[1] * Sc, y2: yMid, valuePt: pL * Sc, label: "L panel {v}", rotated: false },
    { x1: scores[1] * Sc, y1: yMid + 26, x2: scores[2] * Sc, y2: yMid + 26, valuePt: pW * Sc, label: "W panel {v}", rotated: false },
    { x1: (xEnd + 6) * Sc, y1: yF0 * Sc, x2: (xEnd + 6) * Sc, y2: yF1 * Sc, valuePt: PH * Sc, label: "panel {v}", rotated: true },
    { x1: (xEnd + 6) * Sc + 26, y1: 0, x2: (xEnd + 6) * Sc + 26, y2: yF0 * Sc, valuePt: F * Sc, label: "flap {v}", rotated: true },
    { x1: 0, y1: yBot * Sc + 17, x2: xEnd * Sc, y2: yBot * Sc + 17, valuePt: xEnd * Sc, rotated: false },
  ];
  return {
    segments, blank, dims, warnings, valid: true,
    meta: { pL, pW, PH, F, slot: S, join: JOIN_W, t },
  };
}
