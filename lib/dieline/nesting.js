// Cup-fan SHEET NESTING — replicates the press layout style of Aeros's
// production sheets: fans run in horizontal bands, alternating upright /
// inverted so the arcs interleave, bands stacked down the print area.
// The horizontal pitch is found by collision search on the actual fan
// outline (convex hull), so tighter fans nest tighter — the 250 mL DW
// reference (668.37 x 395.37 print area) reproduces as 12-up (3 x 4).
//
// buildCupNesting(fanDoc, { printW, printH, gap }) -> a segments doc for the
// standard exporters: all fan outlines (cut/crease/safe carried through) +
// the print-area frame on the SAFE layer, plus meta { ups, perBand, bands,
// pitch }. Dimensions in the doc are pt (same as fan docs).

import { PT_PER_MM } from "./cakebox.js";

// exact ordered fan outline (CONCAVE — the arc valleys are what interleaving
// exploits) built from the fan's parameters, in the fan doc's coordinates
function fanOutline(meta, blank) {
  const S = 72 / 25.4;
  const { Rt, Rb, theta, seam } = meta;
  const hA = theta / 2;
  const P = (R, a) => [R * Math.sin(a) * S, R * Math.cos(a) * S];
  const raw = [];
  const N = 36;
  for (let i = 0; i <= N; i++) raw.push(P(Rt, -hA + (i / N) * theta)); // top arc L->R
  const nx = Math.cos(hA), ny = -Math.sin(hA);
  raw.push([P(Rt, hA)[0] + seam * nx * S, P(Rt, hA)[1] + seam * ny * S]); // flap top
  raw.push([P(Rb, hA)[0] + seam * nx * S, P(Rb, hA)[1] + seam * ny * S]); // flap bottom
  for (let i = N; i >= 0; i--) raw.push(P(Rb, -hA + (i / N) * theta)); // bottom arc R->L
  // normalise exactly like the engine: x - minX, y' = maxY - y (apex = Rt)
  let minX = 1e18, maxY = -1e18;
  for (const [x, y] of raw) { minX = Math.min(minX, x); maxY = Math.max(maxY, y); }
  maxY = Math.max(maxY, Rt * S);
  return raw.map(([x, y]) => [x - minX, maxY - y]);
}

function polyDist(A, B) {
  // 0 if overlapping, else min vertex-edge distance (both directions)
  const segd = (p, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)));
    return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
  };
  const inside = (p, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (poly[i][1] > p[1] !== poly[j][1] > p[1] && p[0] < ((poly[j][0] - poly[i][0]) * (p[1] - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c;
    }
    return c;
  };
  for (const p of A) if (inside(p, B)) return 0;
  for (const p of B) if (inside(p, A)) return 0;
  // segment-segment crossing (convex polys can cross without vertex containment)
  const x2 = (a, b, c, d) => {
    const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * q[1] - r[1] * q[0];
    if (!den) return false;
    const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
    const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t > 0 && t < 1 && u > 0 && u < 1;
  };
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
    if (x2(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return 0;
  }
  let d = 1e18;
  for (const [P, Q] of [[A, B], [B, A]]) {
    for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segd(p, Q[i], Q[(i + 1) % Q.length]));
  }
  return d;
}

export function buildCupNesting(fanDoc, { printW = 668.37, printH = 395.37, gap = 2.5, overhang = 10 } = {}) {
  if (!fanDoc?.valid || !fanDoc.blank) return null;
  const S = PT_PER_MM;
  const gapPt = gap * S;
  const FW = fanDoc.blank.widthPt, FH = fanDoc.blank.heightPt;
  const PW = printW * S, PH = printH * S;
  // production sheets let the edge fans bleed past the print area (the
  // 250 mL reference overhangs ~9 mm each side) — allow the same
  const ovPt = overhang * S;
  const uW = PW + 2 * ovPt; // usable width for die placement
  if (FW > PW || FH > PH) return { valid: false, warnings: ["Fan larger than the print area."] };

  if (!fanDoc.meta?.Rt) return { valid: false, warnings: ["Fan metadata missing."] };
  const poly = fanOutline(fanDoc.meta, fanDoc.blank);
  const cx = FW / 2, cyy = FH / 2;
  const flipAt = (dx, dy) => poly.map(([x, y]) => [2 * cx - x + dx, 2 * cyy - y + dy]);
  const shiftAt = (dx, dy) => poly.map(([x, y]) => [x + dx, y + dy]);

  // Lattice matched to the production sheets (measured off the 250 mL
  // reference): upright fans on a (PX, PY) grid; inverted fans offset by
  // (DX, DY) where DY is a SHALLOW drop (~0.17 x fan height on the
  // reference, not half-pitch) so the arcs ride each other, and the row
  // pitch PY tucks the next row deep into the arc valleys (~0.8 x height).
  // For each candidate DY: DX = min offset clearing the U->I pair,
  // PX = DX + min offset clearing I->U', PY = smallest row pitch clearing
  // the stacked pairs. Keep the DY that yields the most ups.
  // minimal positive x-offset of the inverted fan clearing the upright
  const minDxPos = (dy) => {
    let lo = FW * 0.35, hi = FW + gapPt;
    if (polyDist(poly, flipAt(hi, dy)) < gapPt) return null;
    for (let k = 0; k < 35; k++) {
      const mid = (lo + hi) / 2;
      if (polyDist(poly, flipAt(mid, dy)) >= gapPt) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  // nearest-to-zero NEGATIVE x-offset that clears (the fan is asymmetric —
  // the flap sits on one side — so the two sides differ)
  const maxDxNeg = (dy) => {
    let lo = -(FW + gapPt), hi = -FW * 0.35;
    if (polyDist(poly, flipAt(lo, dy)) < gapPt) return null;
    for (let k = 0; k < 35; k++) {
      const mid = (lo + hi) / 2;
      if (polyDist(poly, flipAt(mid, dy)) >= gapPt) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  let best = null;
  for (let i = 0; i <= 24; i++) {
    const DY = (i / 24) * 0.45 * FH;
    const DX = minDxPos(DY);
    const dxNeg = maxDxNeg(DY);
    if (DX == null || dxNeg == null) continue;
    const PX = DX - dxNeg;
    // row pitch: uprights stacked + all inverted neighbours across rows
    let PY = null;
    for (let j = 0; j <= 40; j++) {
      const cand = (0.55 + (j / 40) * 0.55) * FH + gapPt;
      if (polyDist(poly, shiftAt(0, cand)) < gapPt) continue;
      if (polyDist(poly, flipAt(DX, DY - cand)) < gapPt) continue;
      if (polyDist(poly, flipAt(DX - PX, DY - cand)) < gapPt) continue;
      if (polyDist(poly, flipAt(DX, DY + cand)) < gapPt) continue;
      if (polyDist(poly, flipAt(DX - PX, DY + cand)) < gapPt) continue;
      PY = cand;
      break;
    }
    if (PY == null) continue;
    const nU = 1 + Math.floor((uW - FW) / PX);
    const nRu = 1 + Math.floor((PH - FH) / PY);
    let nI = 0;
    for (let k = 0; ; k++) { const x = -ovPt + DX + k * PX; if (x + FW > PW + ovPt) break; nI++; }
    let nRi = 0;
    for (let k = 0; ; k++) { const y = DY + k * PY; if (y + FH > PH) break; nRi++; }
    const ups = nU * nRu + nI * nRi;
    if (!best || ups > best.ups || (ups === best.ups && PY < best.PY)) best = { PX, PY, DX, DY, nU, nRu, nI, nRi, ups };
  }
  if (!best || !best.ups) return { valid: false, warnings: ["Nothing fits — grow the print area."] };
  const { PX, PY, DX, DY, nU, nRu, nI, nRi, ups } = best;

  const placements = [];
  for (let r = 0; r < nRu; r++) for (let c = 0; c < nU; c++) placements.push({ x: -ovPt + c * PX, y: r * PY, flipped: false });
  for (let r = 0; r < nRi; r++) for (let c = 0; c < nI; c++) placements.push({ x: -ovPt + DX + c * PX, y: DY + r * PY, flipped: true });

  const segs = [];
  for (const pos of placements) {
    for (const fs of fanDoc.segments) {
      const pts = fs.pts.map(([x, y]) => {
        const [fx, fy] = pos.flipped ? [2 * cx - x, 2 * cyy - y] : [x, y];
        return [fx + pos.x, fy + pos.y];
      });
      segs.push({ layer: fs.layer, kind: fs.kind, pts });
    }
  }
  // print-area frame (safe layer, dashed)
  segs.push({ layer: "safe", kind: "l", pts: [[0, 0], [PW, 0]] });
  segs.push({ layer: "safe", kind: "l", pts: [[PW, 0], [PW, PH]] });
  segs.push({ layer: "safe", kind: "l", pts: [[PW, PH], [0, PH]] });
  segs.push({ layer: "safe", kind: "l", pts: [[0, PH], [0, 0]] });

  return {
    segments: segs,
    blank: { widthPt: PW, heightPt: PH, flapDepthPt: fanDoc.blank.flapDepthPt, style: "cupnesting" },
    dims: [
      { x1: 0, y1: -15, x2: PW, y2: -15, valuePt: PW, rotated: false },
      { x1: PW + 17, y1: 0, x2: PW + 17, y2: PH, valuePt: PH, rotated: true },
    ],
    warnings: [
      `${ups}-up (${nU}x${nRu} upright + ${nI}x${nRi} inverted at +${(DX / S).toFixed(1)},+${(DY / S).toFixed(1)}), pitch ${(PX / S).toFixed(1)} x ${(PY / S).toFixed(1)} mm, gap ${gap} mm, edge fans may overhang the print area by up to ${overhang} mm (as on the production sheets) - verify against the press's grip/registration margins.`,
    ],
    valid: true,
    meta: { ups, nU, nRu, nI, nRi, pitchMm: +(PX / S).toFixed(2), vPitchMm: +(PY / S).toFixed(2), dxMm: +(DX / S).toFixed(2), dyMm: +(DY / S).toFixed(2) },
  };
}
