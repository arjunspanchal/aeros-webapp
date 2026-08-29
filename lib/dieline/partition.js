// PARTITION TRAY keyline — slotted egg-crate divider set for an existing box
// (e.g. the 6x4x2 in mailer family). Standard interlock construction:
//
//   long strips run the box LENGTH, cross strips run the WIDTH; long strips
//   carry slots from the TOP, cross strips from the BOTTOM (slot depth H/2,
//   width 2 x board + clearance) and press together into the grid.
//
// Single-row grids (1 x N or N x 1) have nothing to interlock with, so those
// strips get 20 mm end tabs instead — fold back against the box walls for a
// friction fit. Inputs: internal box L x W x H + cells across (along L) and
// cells deep (along W); strips run 1 mm under the wall height. All pieces on
// one sheet, 10 mm apart. RED = cut, GREEN = crease (tab folds only).

import { PT_PER_MM } from "./cakebox.js";

const GAP = 10, TAB = 20, CLEAR = 1;

export function buildPartitionDieline({ L, W, H, cellsX = 3, cellsY = 1, thickness, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L);
  const Wm = toMm(W);
  const Hm = toMm(H);
  const t = +thickness > 0 ? +thickness : 0.5;
  const nx = Math.max(1, Math.round(cellsX));
  const ny = Math.max(1, Math.round(cellsY));

  const warnings = ["Standard slotted partition construction — strips sit 1 mm under the wall height; verify the friction fit on the first cut."];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (nx === 1 && ny === 1) {
    return { segments: [], blank: null, warnings: ["1 × 1 needs no partition — add cells."], valid: false };
  }
  const slotW = Math.max(3, 2 * t + 1);
  const strip = Hm - CLEAR;
  const half = strip / 2;
  const nLong = ny - 1, nCross = nx - 1;
  if (Lm / nx < 25 || Wm / ny < 25) warnings.push("Cells under 25 mm — slots and tabs crowd.");

  const segs = [];
  const line = (layer, xa, ya, xb, yb) => segs.push({ layer, kind: "l", pts: [[xa, ya], [xb, yb]] });

  // one strip outline at (ox, oy): len x strip, slots cut `fromTop` or from
  // the bottom at the given positions; optional end tabs (single-row case)
  const stripPiece = (ox, oy, len, slotXs, fromTop, tabs) => {
    const x0 = tabs ? ox + TAB : ox;
    const x1 = x0 + len;
    // top edge with slots (fromTop) or plain
    const edge = (y, xs, into) => {
      let cx = x0;
      for (const sx of xs) {
        const a = x0 + sx - slotW / 2, b = x0 + sx + slotW / 2;
        line("cut", cx, y, a, y);
        line("cut", a, y, a, y + into);
        line("cut", a, y + into, b, y + into);
        line("cut", b, y + into, b, y);
        cx = b;
      }
      line("cut", cx, y, x1, y);
    };
    edge(oy, fromTop ? slotXs : [], half);
    edge(oy + strip, fromTop ? [] : slotXs, -half);
    if (tabs) {
      line("crease", x0, oy, x0, oy + strip);
      line("crease", x1, oy, x1, oy + strip);
      line("cut", ox, oy + 2, x0, oy);
      line("cut", ox, oy + strip - 2, x0, oy + strip);
      line("cut", ox, oy + 2, ox, oy + strip - 2);
      line("cut", x1 + TAB, oy + 2, x1, oy);
      line("cut", x1 + TAB, oy + strip - 2, x1, oy + strip);
      line("cut", x1 + TAB, oy + 2, x1 + TAB, oy + strip - 2);
    } else {
      line("cut", x0, oy, x0, oy + strip);
      line("cut", x1, oy, x1, oy + strip);
    }
  };

  let oy = 0, maxW = 0;
  const crossSlots = Array.from({ length: nLong }, (_, i) => ((i + 1) * Wm) / ny);
  const longSlots = Array.from({ length: nCross }, (_, i) => ((i + 1) * Lm) / nx);
  for (let i = 0; i < nLong; i++) {
    stripPiece(0, oy, Lm - CLEAR, longSlots, true, false);
    oy += strip + GAP;
    maxW = Math.max(maxW, Lm - CLEAR);
  }
  const crossTabs = nLong === 0;
  for (let i = 0; i < nCross; i++) {
    stripPiece(0, oy, Wm - CLEAR, crossSlots, false, crossTabs);
    oy += strip + GAP;
    maxW = Math.max(maxW, (Wm - CLEAR) + (crossTabs ? 2 * TAB : 0));
  }

  const BH = oy - GAP;
  const S = PT_PER_MM;
  const segments = segs.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: maxW * S, heightPt: BH * S, flapDepthPt: half * S, style: "partition" };
  const dims = [
    { x1: 0, y1: -15, x2: maxW * S, y2: -15, valuePt: maxW * S, rotated: false },
    { x1: (maxW + 6) * S, y1: 0, x2: (maxW + 6) * S, y2: strip * S, valuePt: strip * S, rotated: true },
    { x1: 0, y1: BH * S + 17, x2: (Lm / nx) * S, y2: BH * S + 17, valuePt: (Lm / nx) * S, rotated: false },
  ];
  return {
    segments, blank, dims, warnings, valid: true,
    meta: { nx, ny, slotW, strip, pieces: nLong + nCross, cell: [Lm / nx, Wm / ny] },
  };
}
