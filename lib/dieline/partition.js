// PARTITION TRAY keyline — one-piece DOUBLE-WALL serpentine dividers (the
// kraft chocolate-tray construction): each divider wall is TWO plies joined
// by a fold at the top, rising from the floor panels of the same blank —
//
//   floor | wall up | top fold | wall down | floor | wall up | ...
//
// One serpentine piece per direction. Grids with both columns and rows get
// two pieces that interlock at the crossings: the LONG piece (walls across
// the width) takes slots cut across its top folds, the CROSS piece takes
// slots up from its wall bases — slot width clears the double ply. Single
// row/column needs just one piece; the floors hold the walls upright, no
// tabs or glue. Inputs: the BOX's internal L x W x H + columns x rows.
// The top fold is twin creases (2 x board apart); walls run 1 mm under the
// wall height. RED = cut, GREEN = crease.

import { PT_PER_MM } from "./cakebox.js";

const GAP = 10, CLEAR = 1;

export function buildPartitionDieline({ L, W, H, cellsX = 3, cellsY = 1, thickness, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L);
  const Wm = toMm(W);
  const Hm = toMm(H);
  const t = +thickness > 0 ? +thickness : 0.5;
  const nx = Math.max(1, Math.round(cellsX));
  const ny = Math.max(1, Math.round(cellsY));

  const warnings = ["One-piece double-wall serpentine — each wall is two plies with the fold on top, rising from the floor panels. Verify the fit on the first cut; floors absorb the board build-up."];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (nx === 1 && ny === 1) {
    return { segments: [], blank: null, warnings: ["1 × 1 needs no partition — add cells."], valid: false };
  }
  const wall = Hm - CLEAR;
  const slotW = Math.max(4, 4 * t + 2); // clears the double ply
  const both = nx > 1 && ny > 1;
  if (Lm / nx < 25 || Wm / ny < 25) warnings.push("Cells under 25 mm — folds and slots crowd.");

  const segs = [];
  const line = (layer, xa, ya, xb, yb) => segs.push({ layer, kind: "l", pts: [[xa, ya], [xb, yb]] });

  // one serpentine piece at x-offset `ox`:
  //   pw    = piece width (the other internal dim - 1)
  //   n     = cells along the serpentine, pitch = axis length / n
  //   slotXs= crossing positions across the piece width (interlock)
  //   topSlots ? slots across the top folds : slots up from the wall bases
  const serpentine = (ox, pw, n, pitch, slotXs, topSlots) => {
    const f = Math.max(6, pitch - 2 * t); // floor panel
    let y = 0;
    const cutRow = (yy, xs, y0, y1) => {
      // vertical slot holes at xs between y0..y1 (drawn as rectangles)
      for (const sx of xs) {
        const a = ox + sx - slotW / 2, b = ox + sx + slotW / 2;
        line("cut", a, y0, b, y0);
        line("cut", b, y0, b, y1);
        line("cut", b, y1, a, y1);
        line("cut", a, y1, a, y0);
      }
    };
    const H2 = wall / 2;
    for (let i = 0; i < n; i++) {
      y += f; // floor
      if (i === n - 1) break;
      line("crease", ox, y, ox + pw, y); // wall base
      if (topSlots) cutRow(y, [], 0, 0);
      else cutRow(y, slotXs, y, y + H2); // base slot in ply 1
      y += wall;
      line("crease", ox, y - t, ox + pw, y - t); // twin top-fold creases
      line("crease", ox, y + t, ox + pw, y + t);
      if (topSlots) cutRow(y, slotXs, y - H2, y + H2); // slot across the fold
      y += wall;
      line("crease", ox, y, ox + pw, y); // back to floor
      if (!topSlots) cutRow(y, slotXs, y - H2, y); // base slot in ply 2
    }
    const len = y;
    // outline
    line("cut", ox, 0, ox + pw, 0);
    line("cut", ox + pw, 0, ox + pw, len);
    line("cut", ox + pw, len, ox, len);
    line("cut", ox, len, ox, 0);
    return len;
  };

  let ox = 0, maxLen = 0;
  const pieces = [];
  if (ny > 1) {
    // LONG piece: walls run along L, serpentine advances across W
    const slotXs = both ? Array.from({ length: nx - 1 }, (_, j) => ((j + 1) * Lm) / nx) : [];
    const len = serpentine(ox, Lm - CLEAR, ny, Wm / ny, slotXs, true);
    pieces.push({ w: Lm - CLEAR, len });
    maxLen = Math.max(maxLen, len);
    ox += Lm - CLEAR + GAP;
  }
  if (nx > 1) {
    // CROSS piece: walls run along W, serpentine advances across L
    const slotXs = both ? Array.from({ length: ny - 1 }, (_, j) => ((j + 1) * Wm) / ny) : [];
    const len = serpentine(ox, Wm - CLEAR, nx, Lm / nx, slotXs, false);
    pieces.push({ w: Wm - CLEAR, len });
    maxLen = Math.max(maxLen, len);
    ox += Wm - CLEAR + GAP;
  }

  const BW = ox - GAP;
  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: BW * S, heightPt: maxLen * S, flapDepthPt: wall * S, style: "partition" };
  const dims = [
    { x1: 0, y1: -15, x2: pieces[0].w * S, y2: -15, valuePt: pieces[0].w * S, rotated: false },
    { x1: (BW + 6) * S, y1: 0, x2: (BW + 6) * S, y2: pieces[0].len * S, valuePt: pieces[0].len * S, rotated: true },
    { x1: 0, y1: maxLen * S + 17, x2: BW * S, y2: maxLen * S + 17, valuePt: BW * S, rotated: false },
  ];
  return {
    segments, blank, dims, warnings, valid: true,
    meta: { nx, ny, slotW, wall, pieces: pieces.length, cell: [Lm / nx, Wm / ny] },
  };
}
