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

export function buildPartitionDieline({ L, W, H, cellsX = 3, cellsY = 1, colsMm, rowSpan, rowsMm, colSpan, thickness, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L);
  const Wm = toMm(W);
  const Hm = toMm(H);
  const t = +thickness > 0 ? +thickness : 0.5;
  // UNEQUAL COLUMNS (optional): `colsMm` = cell widths along L (e.g. 4 food cells + an accessory
  // column); scaled to L if they don't sum to it. `rowSpan` = how many leading columns the row
  // walls (the LONG piece) cover — the remaining columns stay single full-width slots.
  const cols = Array.isArray(colsMm) && colsMm.length > 1 ? colsMm.map((v) => toMm(+v)) : null;
  const nx = cols ? cols.length : Math.max(1, Math.round(cellsX));
  // UNEQUAL ROWS (optional, same idea across W): `rowsMm` = row pitches along W (e.g. food rows +
  // a chopstick lane along the length); `colSpan` = how many leading rows the column walls cover.
  const rows = Array.isArray(rowsMm) && rowsMm.length > 1 ? rowsMm.map((v) => toMm(+v)) : null;
  const ny = rows ? rows.length : Math.max(1, Math.round(cellsY));

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
  if (cols) {
    const sum = cols.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - Lm) > 0.5) { warnings.push(`Column widths sum to ${sum.toFixed(1)} mm, not L ${Lm} — scaled to fit.`); for (let i = 0; i < nx; i++) cols[i] *= Lm / sum; }
  }
  if (rows) {
    const sum = rows.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - Wm) > 0.5) { warnings.push(`Row widths sum to ${sum.toFixed(1)} mm, not W ${Wm} — scaled to fit.`); for (let i = 0; i < ny; i++) rows[i] *= Wm / sum; }
  }
  const gen = !!(cols || rows);
  const span = gen && +rowSpan > 0 ? Math.min(nx, Math.round(+rowSpan)) : nx;
  const spanR = gen && +colSpan > 0 ? Math.min(ny, Math.round(+colSpan)) : ny;
  const rbounds = []; // row boundaries along W
  { let acc = 0; for (let j = 0; j < ny - 1; j++) { acc += rows ? rows[j] : Wm / ny; rbounds.push(acc); } }
  const spanW = spanR < ny ? rbounds[spanR - 1] : Wm;
  const bounds = []; // column boundaries along L
  { let acc = 0; for (let i = 0; i < nx - 1; i++) { acc += cols ? cols[i] : Lm / nx; bounds.push(acc); } }
  const spanL = span < nx ? bounds[span - 1] : Lm;
  if (Math.min(...(cols || [Lm / nx])) < 25 || Math.min(...(rows || [Wm / ny])) < 25) warnings.push(rows ? "A row/lane under 25 mm — fine for a chopstick lane, but folds crowd; check the first cut." : "Cells under 25 mm — folds and slots crowd.");

  const segs = [];
  const line = (layer, xa, ya, xb, yb) => segs.push({ layer, kind: "l", pts: [[xa, ya], [xb, yb]] });

  // one serpentine piece at x-offset `ox`:
  //   pw    = piece width (the other internal dim - 1)
  //   n     = cells along the serpentine, pitch = axis length / n
  //   slotXs= crossing positions across the piece width (interlock)
  //   topSlots ? slots across the top folds : slots up from the wall bases
  const serpentine = (ox, pw, n, pitch, slotXs, topSlots) => {
    // pitch: one number, or an array of per-cell pitches; slotXs: one list, or a function of the wall index
    const fAt = (i) => Math.max(6, (Array.isArray(pitch) ? pitch[i] : pitch) - 2 * t); // floor panel
    const sx = (i) => (typeof slotXs === "function" ? slotXs(i) : slotXs);
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
      y += fAt(i); // floor
      if (i === n - 1) break;
      line("crease", ox, y, ox + pw, y); // wall base
      if (topSlots) cutRow(y, [], 0, 0);
      else cutRow(y, sx(i), y, y + H2); // base slot in ply 1
      y += wall;
      line("crease", ox, y - t, ox + pw, y - t); // twin top-fold creases
      line("crease", ox, y + t, ox + pw, y + t);
      if (topSlots) cutRow(y, sx(i), y - H2, y + H2); // slot across the fold
      y += wall;
      line("crease", ox, y, ox + pw, y); // back to floor
      if (!topSlots) cutRow(y, sx(i), y - H2, y); // base slot in ply 2
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
    const colSlots = both ? (gen ? bounds.filter((b) => b < spanL - 0.5) : Array.from({ length: nx - 1 }, (_, j) => ((j + 1) * Lm) / nx)) : [];
    // row wall j takes column slots only where the column walls reach it
    const slotXs = rows ? (j) => (rbounds[j] < spanW - 0.5 ? colSlots : []) : colSlots;
    const lw = (gen ? spanL : Lm) - CLEAR;
    const len = serpentine(ox, lw, ny, rows ? rows : Wm / ny, slotXs, true);
    pieces.push({ w: lw, len });
    maxLen = Math.max(maxLen, len);
    ox += lw + GAP;
  }
  if (nx > 1) {
    // CROSS piece: walls run along W, serpentine advances across L
    const rowXs = both ? (rows ? rbounds.filter((b) => b < spanW - 0.5) : Array.from({ length: ny - 1 }, (_, j) => ((j + 1) * Wm) / ny)) : [];
    // cross wall i sits at bounds[i]; it takes row slots only where the row walls reach it
    const slotXs = gen ? (i) => (bounds[i] < spanL - 0.5 ? rowXs : []) : rowXs;
    const cw = (rows ? spanW : Wm) - CLEAR;
    const len = serpentine(ox, cw, nx, cols ? cols : Lm / nx, slotXs, false);
    pieces.push({ w: cw, len });
    maxLen = Math.max(maxLen, len);
    ox += cw + GAP;
  }

  const BW = ox - GAP;
  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: BW * S, heightPt: maxLen * S, flapDepthPt: wall * S, style: "partition" };
  // two-piece dims only when there ARE two pieces (cols with a single row = one cross piece; 66 Chuim steak box 20-Oct-2026)
  const dims = gen && pieces.length > 1 ? [
    // unequal-column sets: dimension BOTH pieces + wall height + every cell pitch
    { x1: 0, y1: -15, x2: pieces[0].w * S, y2: -15, valuePt: pieces[0].w * S, label: "row piece {v}", rotated: false },
    { x1: -12, y1: 0, x2: -12, y2: pieces[0].len * S, valuePt: pieces[0].len * S, label: "row piece {v}", rotated: true },
    { x1: (pieces[0].w + GAP) * S, y1: -15, x2: BW * S, y2: -15, valuePt: pieces[1].w * S, label: "cross piece {v}", rotated: false },
    { x1: (BW + 6) * S, y1: 0, x2: (BW + 6) * S, y2: pieces[1].len * S, valuePt: pieces[1].len * S, label: "cross piece {v}", rotated: true },
    { x1: (pieces[0].w * 0.25) * S, y1: Math.max(6, (rows ? rows[0] : Wm / ny) - 2 * t) * S, x2: (pieces[0].w * 0.25) * S, y2: (Math.max(6, (rows ? rows[0] : Wm / ny) - 2 * t) + wall) * S, valuePt: wall * S, label: "wall {v}", rotated: true },
    { x1: 0, y1: maxLen * S + 17, x2: BW * S, y2: maxLen * S + 17, valuePt: BW * S, label: "blank {v}", rotated: false },
  ] : [
    { x1: 0, y1: -15, x2: pieces[0].w * S, y2: -15, valuePt: pieces[0].w * S, rotated: false },
    { x1: (BW + 6) * S, y1: 0, x2: (BW + 6) * S, y2: pieces[0].len * S, valuePt: pieces[0].len * S, rotated: true },
    { x1: 0, y1: maxLen * S + 17, x2: BW * S, y2: maxLen * S + 17, valuePt: BW * S, rotated: false },
    ...(gen ? [{ x1: (pieces[0].w * 0.25) * S, y1: Math.max(6, (cols ? cols[0] : Lm / nx) - 2 * t) * S, x2: (pieces[0].w * 0.25) * S, y2: (Math.max(6, (cols ? cols[0] : Lm / nx) - 2 * t) + wall) * S, valuePt: wall * S, label: "wall {v}", rotated: true }] : []),
  ];
  return {
    segments, blank, dims, warnings, valid: true,
    meta: { nx, ny, slotW, wall, pieces: pieces.length, cell: [Lm / nx, Wm / ny], ...(cols ? { cols, rowSpan: span, spanL } : {}), ...(rows ? { rows, colSpan: spanR, spanW } : {}) },
  };
}
