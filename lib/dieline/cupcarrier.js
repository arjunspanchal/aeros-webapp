// ONE-PIECE CUP CARRIER dieline — flat sling carriers that drop over the
// cups (per the commercial one-piece design): a rounded strip with the cup
// hole(s) in the CENTRAL band and a handle panel at each end; the ends fold
// up and their stadium hand-holes align above the cups.
//
//   [ handle (hand hole) | band: 1 or 2 cup holes | handle (hand hole) ]
//
// HOLE Ø (24-Sep-2026, Arjun: "in the original keyline the 80 mm cup went
// through the hole"): the Kinster die cut Ø75 holes for an 80 mm rim cup —
// on 210 gsm the board flexes and the cup pushes straight through. The hole
// must grip well BELOW the rim: hole Ø = cup rim Ø - 10 mm (a ~0.3 mm/mm
// taper puts that grip ~30 mm down the cup). The engine warns if the hole is
// within 6 mm of the stated rim Ø.
//
// Inputs: L = cup hole Ø (cup RIM Ø - 10 mm),
// W = 2-cup: cup pitch (centre-to-centre) / 1-cup: strip width,
// H = handle panel height. Verify hole Ø against the cup taper.
//
// HANDLE HEIGHT (24-Sep-2026, Arjun: "the handle is not high enough so one
// can hold it properly"): the handle panel must clear the LID DOME plus a
// full hand. The Kinster 250 ml job (Ø75 x 115 pitch)
// ran a 95 mm handle with a 26 mm hole 34 mm down — only 48 mm of clear
// board under the hole, and knuckles landed on the lids. Reference carriers
// run ~1.1x the cup height (~120-140 mm) with a 95 x 32 mm hole ~36 mm from
// the top edge, which puts the grip a hand's width above the lids. Defaults
// follow the reference; the engine warns when the hole bottom sits under
// LID_CLEAR mm above the band.

import { PT_PER_MM } from "./cakebox.js";

const KAPPA = 0.5522847498;
// hand-hole geometry (mm) and the lid clearance the grip needs above the band
const HOLE_W = 95, HOLE_H = 32, HOLE_EDGE = 36, LID_CLEAR = 70;

export function buildCupcarrierDieline({ L, W, H, cups = 2, units = "mm" }) {
  if (+cups === 1) return buildSingleCarrier({ L, W, H, units });
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const holeD = toMm(L);
  const pitch = toMm(W);
  const handleH = toMm(H);

  const warnings = ["One-piece sling carrier (per the commercial design) — hole Ø must be ~10 mm UNDER the cup rim Ø so the cup hangs on its taper; a hole close to the rim Ø lets the cup push through."];
  if (!(holeD > 0) || !(pitch > 0) || !(handleH > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (pitch < holeD + 12) warnings.push("Cup pitch leaves under 12 mm web between the holes — increase pitch.");
  const gripClear = handleH - HOLE_EDGE - HOLE_H / 2;
  if (gripClear < LID_CLEAR) warnings.push(`Handle only ${Math.round(gripClear)} mm of clearance under the hand hole — the grip will foul the lids. Reference carriers run 120-140 mm handle panels (${LID_CLEAR} mm clear minimum).`);
  const web = 24;
  const BW = 2 * pitch; // strip width, holes at ±pitch/2
  if (BW < holeD + 2 * web) warnings.push("Strip too narrow for the hole diameter.");

  const band = holeD + 2 * Math.max(14, web - 8); // central band depth
  const BH = 2 * handleH + band;
  const rO = 16;

  const segs = [];
  const line = (layer, xa, ya, xb, yb) => segs.push({ layer, kind: "l", pts: [[xa, ya], [xb, yb]] });
  const bez = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });
  const arc90 = (layer, x1, y1, x2, y2, cxa, cya) => {
    const k = KAPPA;
    bez(layer, [x1, y1], [x1 + (cxa - x1) * k, y1 + (cya - y1) * k], [x2 + (cxa - x2) * k, y2 + (cya - y2) * k], [x2, y2]);
  };

  // rounded-rect outline
  line("cut", rO, 0, BW - rO, 0);
  arc90("cut", BW - rO, 0, BW, rO, BW, 0);
  line("cut", BW, rO, BW, BH - rO);
  arc90("cut", BW, BH - rO, BW - rO, BH, BW, BH);
  line("cut", BW - rO, BH, rO, BH);
  arc90("cut", rO, BH, 0, BH - rO, 0, BH);
  line("cut", 0, BH - rO, 0, rO);
  arc90("cut", 0, rO, rO, 0, 0, 0);

  // band creases
  line("crease", 0, handleH, BW, handleH);
  line("crease", 0, handleH + band, BW, handleH + band);

  // two cup holes side-by-side in the band
  const circle = (hx, hy, rr) => {
    arc90("cut", hx - rr, hy, hx, hy - rr, hx - rr, hy - rr);
    arc90("cut", hx, hy - rr, hx + rr, hy, hx + rr, hy - rr);
    arc90("cut", hx + rr, hy, hx, hy + rr, hx + rr, hy + rr);
    arc90("cut", hx, hy + rr, hx - rr, hy, hx - rr, hy + rr);
  };
  const cyB = handleH + band / 2;
  circle(BW / 2 - pitch / 2, cyB, holeD / 2);
  circle(BW / 2 + pitch / 2, cyB, holeD / 2);

  // hand holes near each outer end
  for (const yc of [HOLE_EDGE, BH - HOLE_EDGE]) {
    const hw = Math.min(HOLE_W, BW - 60);
    const hh = HOLE_H;
    const r = hh / 2;
    const x1 = BW / 2 - hw / 2 + r, x2 = BW / 2 + hw / 2 - r;
    line("cut", x1, yc - r, x2, yc - r);
    line("cut", x1, yc + r, x2, yc + r);
    bez("cut", [x2, yc - r], [x2 + r * 1.1, yc - r], [x2 + r * 1.1, yc + r], [x2, yc + r]);
    bez("cut", [x1, yc - r], [x1 - r * 1.1, yc - r], [x1 - r * 1.1, yc + r], [x1, yc + r]);
  }

  const S = PT_PER_MM;
  const segments = segs.map((sg) => ({ ...sg, pts: sg.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: BW * S, heightPt: BH * S, flapDepthPt: band * S, style: "cupcarrier" };
  const hx1 = BW / 2 - pitch / 2;
  const dims = [
    { x1: (hx1 - holeD / 2) * S, y1: (cyB - holeD / 2 - 9) * S, x2: (hx1 + holeD / 2) * S, y2: (cyB - holeD / 2 - 9) * S, valuePt: holeD * S, label: "cup hole \u00d8 {v}", rotated: false },
    { x1: (BW / 2 - pitch / 2) * S, y1: cyB * S, x2: (BW / 2 + pitch / 2) * S, y2: cyB * S, valuePt: pitch * S, label: "pitch {v}", rotated: false },
    { x1: (BW + 8) * S, y1: 0, x2: (BW + 8) * S, y2: handleH * S, valuePt: handleH * S, label: "handle {v}", rotated: true },
    { x1: (BW + 8) * S, y1: handleH * S, x2: (BW + 8) * S, y2: (handleH + band) * S, valuePt: band * S, label: "band {v}", rotated: true },
    { x1: 0, y1: BH * S + 17, x2: BW * S, y2: BH * S + 17, valuePt: BW * S, rotated: false },
  ];
  return { segments, blank, dims, warnings, valid: true };
}

// Single-cup sling carrier (like the common template: handle | cup band |
// handle, e.g. 120 + 60 + 120 on a 120 mm strip). The two handle panels fold
// up at the band creases and their stadium holes align as the handle.
function buildSingleCarrier({ L, W, H, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const holeD = toMm(L);
  const BW = toMm(W);
  const handleH = toMm(H);

  const warnings = ["Standard single-cup sling construction — hole Ø must be ~10 mm UNDER the cup rim Ø so the cup hangs on its taper."];
  if (!(holeD > 0) || !(BW > 0) || !(handleH > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (BW < holeD + 20) warnings.push("Strip narrower than hole Ø + 20 mm — weak webs beside the cup hole.");
  const gripClear1 = handleH - HOLE_EDGE - HOLE_H / 2;
  if (gripClear1 < LID_CLEAR) warnings.push(`Handle only ${Math.round(gripClear1)} mm of clearance under the hand hole — raise the handle panel (reference 120-140 mm).`);

  const band = holeD + 4;
  const BH = 2 * handleH + band;
  const rO = 12; // outer corner radius
  const segs = [];
  const line = (layer, xa, ya, xb, yb) => segs.push({ layer, kind: "l", pts: [[xa, ya], [xb, yb]] });
  const bez = (layer, p0, p1, p2, p3) => segs.push({ layer, kind: "c", pts: [p0, p1, p2, p3] });
  const arc90 = (layer, x1, y1, x2, y2, cxa, cya) => {
    const k = KAPPA;
    bez(layer, [x1, y1], [x1 + (cxa - x1) * k, y1 + (cya - y1) * k], [x2 + (cxa - x2) * k, y2 + (cya - y2) * k], [x2, y2]);
  };

  // rounded-rect outline
  line("cut", rO, 0, BW - rO, 0);
  arc90("cut", BW - rO, 0, BW, rO, BW, 0);
  line("cut", BW, rO, BW, BH - rO);
  arc90("cut", BW, BH - rO, BW - rO, BH, BW, BH);
  line("cut", BW - rO, BH, rO, BH);
  arc90("cut", rO, BH, 0, BH - rO, 0, BH);
  line("cut", 0, BH - rO, 0, rO);
  arc90("cut", 0, rO, rO, 0, 0, 0);

  // band creases
  line("crease", 0, handleH, BW, handleH);
  line("crease", 0, handleH + band, BW, handleH + band);

  // cup hole centred in the band
  const cyH = handleH + band / 2;
  const rr = holeD / 2;
  arc90("cut", BW / 2 - rr, cyH, BW / 2, cyH - rr, BW / 2 - rr, cyH - rr);
  arc90("cut", BW / 2, cyH - rr, BW / 2 + rr, cyH, BW / 2 + rr, cyH - rr);
  arc90("cut", BW / 2 + rr, cyH, BW / 2, cyH + rr, BW / 2 + rr, cyH + rr);
  arc90("cut", BW / 2, cyH + rr, BW / 2 - rr, cyH, BW / 2 - rr, cyH + rr);

  // stadium hand holes near each outer end (aligned when folded up)
  for (const [yc] of [[HOLE_EDGE], [BH - HOLE_EDGE]]) {
    const hw = Math.min(HOLE_W - 10, BW - 36);
    const hh = HOLE_H;
    const r = hh / 2;
    const x1 = BW / 2 - hw / 2 + r, x2 = BW / 2 + hw / 2 - r;
    line("cut", x1, yc - r, x2, yc - r);
    line("cut", x1, yc + r, x2, yc + r);
    bez("cut", [x2, yc - r], [x2 + r * 1.1, yc - r], [x2 + r * 1.1, yc + r], [x2, yc + r]);
    bez("cut", [x1, yc - r], [x1 - r * 1.1, yc - r], [x1 - r * 1.1, yc + r], [x1, yc + r]);
  }

  const S = PT_PER_MM;
  const segments = segs.map((sg) => ({ ...sg, pts: sg.pts.map(([x, y]) => [x * S, y * S]) }));
  const blank = { widthPt: BW * S, heightPt: BH * S, flapDepthPt: band * S, style: "cupcarrier1" };
  const dims = [
    { x1: (BW / 2 - rr) * S, y1: (cyH - rr - 9) * S, x2: (BW / 2 + rr) * S, y2: (cyH - rr - 9) * S, valuePt: holeD * S, label: "cup hole \u00d8 {v}", rotated: false },
    { x1: (BW + 8) * S, y1: 0, x2: (BW + 8) * S, y2: handleH * S, valuePt: handleH * S, label: "handle {v}", rotated: true },
    { x1: (BW + 8) * S, y1: handleH * S, x2: (BW + 8) * S, y2: (handleH + band) * S, valuePt: band * S, label: "band {v}", rotated: true },
    { x1: 0, y1: BH * S + 17, x2: BW * S, y2: BH * S + 17, valuePt: BW * S, rotated: false },
  ];
  return { segments, blank, dims, warnings, valid: true };
}
