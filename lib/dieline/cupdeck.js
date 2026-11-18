// CUP DECK INSERT — drop-in, no-glue insert that holds two cups at the rim of an open tray (Arvis fish and chips box,
// 04-Nov-2026, read from their photo). One strip with three creases that folds into a closed square tube:
//
//   end leg | deck (cup holes) | inner leg | foot
//
// The end leg stands against the box end wall. The foot runs back under the deck and butts the end leg, which stops the
// inner leg from kicking out into the food area; nothing else holds the tube shut. Legs are H - 1 so the deck sits just
// under the rim and a lid clears it.
//
// Inputs: W = insert width across the box (box inside - 2 x ~1.5 mm), D = deck depth along the box, H = box wall height,
// holeD = cup hole Ø, holes = 1 or 2 across W, slits = short cuts on the centre line between the holes (from the photo).
// Output in points, y-down.
import { PT_PER_MM } from "./cakebox.js";

const KAPPA = 0.5522847498;
const FOOT_CLEAR = 1; // foot stops this short of the end leg's inner face
const TIP = 4; // chamfer on the two free corners so the piece drops in without catching

export function buildCupdeckDieline({ W, D, H, holeD, holes = 2, slits = 3, slitL = 5, slitPitch = 21, thickness, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const w = toMm(W), d = toMm(D), h = toMm(H), hole = toMm(holeD);
  const t = +thickness > 0 ? +thickness : 0.42;
  const n = Math.round(holes) === 1 ? 1 : 2;
  if (![w, d, h, hole].every((v) => v > 0)) {
    return { segments: [], blank: null, warnings: ["Enter width, deck depth, wall height and hole Ø."], valid: false };
  }
  const leg = h - 1;
  const foot = d - 2 * t - FOOT_CLEAR;
  const y1 = leg, y2 = y1 + d, y3 = y2 + leg, y4 = y3 + foot; // creases at y1, y2, y3; free ends at 0 and y4
  const cy = (y1 + y2) / 2;
  // two holes: side margins = half the centre web, so the deck edge and the web carry the same board either side
  const side = n === 2 ? (w - 2 * hole) / 4 : (w - hole) / 2;
  const web = n === 2 ? 2 * side : 0;
  const cxs = n === 2 ? [side + hole / 2, w - side - hole / 2] : [w / 2];

  const warnings = [];
  if (side < 4) warnings.push(`Only ${side.toFixed(1)} mm of board between hole and side edge.`);
  if (n === 2 && web < 6) warnings.push(`Only ${web.toFixed(1)} mm of web between the holes.`);
  if (d - hole < 8) warnings.push(`Only ${((d - hole) / 2).toFixed(1)} mm of deck in front of and behind the holes.`);

  const segs = [];
  const line = (layer, xa, ya, xb, yb) => segs.push({ layer, kind: "l", pts: [[xa, ya], [xb, yb]] });
  // outline, starting at the end leg's free edge
  line("cut", TIP, 0, w - TIP, 0);
  line("cut", w - TIP, 0, w, TIP);
  line("cut", w, TIP, w, y4 - TIP);
  line("cut", w, y4 - TIP, w - TIP, y4);
  line("cut", w - TIP, y4, TIP, y4);
  line("cut", TIP, y4, 0, y4 - TIP);
  line("cut", 0, y4 - TIP, 0, TIP);
  line("cut", 0, TIP, TIP, 0);
  for (const y of [y1, y2, y3]) line("crease", 0, y, w, y);
  // cup holes: true circles from four Beziers
  const r = hole / 2, k = KAPPA * r;
  for (const cx of cxs) {
    const q = [
      [[cx + r, cy], [cx + r, cy + k], [cx + k, cy + r], [cx, cy + r]],
      [[cx, cy + r], [cx - k, cy + r], [cx - r, cy + k], [cx - r, cy]],
      [[cx - r, cy], [cx - r, cy - k], [cx - k, cy - r], [cx, cy - r]],
      [[cx, cy - r], [cx + k, cy - r], [cx + r, cy - k], [cx + r, cy]],
    ];
    for (const p of q) segs.push({ layer: "cut", kind: "c", pts: p });
  }
  // centre-line slits between the holes
  if (n === 2) {
    for (let i = 0; i < slits; i++) {
      const yc = cy + (i - (slits - 1) / 2) * slitPitch;
      line("cut", w / 2, yc - slitL / 2, w / 2, yc + slitL / 2);
    }
  }

  const S = PT_PER_MM;
  const segments = segs.map((sg) => ({ ...sg, pts: sg.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = {
    widthPt: w * S, heightPt: y4 * S, flapDepthPt: leg * S, style: "cupdeck",
    check: { leg, foot: +foot.toFixed(2), hole, side: +side.toFixed(2), web: +web.toFixed(2), pitch: n === 2 ? +(cxs[1] - cxs[0]).toFixed(2) : 0, deckMargin: +((d - hole) / 2).toFixed(2) },
  };
  const dims = [
    { x1: 0, y1: (y4 + 8) * S, x2: w * S, y2: (y4 + 8) * S, valuePt: w * S, label: "insert W {v}", rotated: false },
    { x1: (w + 8) * S, y1: 0, x2: (w + 8) * S, y2: y1 * S, valuePt: leg * S, label: "end leg {v}", rotated: true },
    { x1: (w + 8) * S, y1: y1 * S, x2: (w + 8) * S, y2: y2 * S, valuePt: d * S, label: "deck {v}", rotated: true },
    { x1: (w + 8) * S, y1: y2 * S, x2: (w + 8) * S, y2: y3 * S, valuePt: leg * S, label: "inner leg {v}", rotated: true },
    { x1: (w + 8) * S, y1: y3 * S, x2: (w + 8) * S, y2: y4 * S, valuePt: foot * S, label: "foot {v}", rotated: true },
    { x1: (w + 24) * S, y1: 0, x2: (w + 24) * S, y2: y4 * S, valuePt: y4 * S, label: "blank {v}", rotated: true },
    { x1: (cxs[0] - r) * S, y1: (cy + r + 5) * S, x2: (cxs[0] + r) * S, y2: (cy + r + 5) * S, valuePt: hole * S, label: "hole dia {v}", rotated: false },
  ];
  return { segments, blank, dims, warnings, valid: true };
}
