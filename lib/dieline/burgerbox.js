// Parametric dieline (KLD) for the Aeros burger CLAMSHELL box.
//
// Source geometry: one blank of the production Zepto burger-box 640x780 6-up
// layout (blank 204 x 381 mm): base tray ~102 x 102 with flared walls, hinged
// lid 100 x 100, wall height 39.1 mm, double-crease spine, rounded side wings
// and front tuck lips. Cut/crease layers came colour-separated in the source.
//
// Because this die is organic (curved wings/lips), it is parametrised by
// BANDED SCALING rather than feature-by-feature reconstruction: the reference
// blank is embedded verbatim (burger-ref.js) and stretched piecewise —
// horizontal centre band follows box width W, side wings follow wall height H,
// vertical panel bands follow depth D and wall bands follow H. At the
// reference size (W=102, D=102, H=39) the output is the production die,
// exactly. Corner radii stretch slightly at other sizes — normal die-shop
// tolerance, flagged in the UI.
//
// Inputs are the BASE TRAY internal footprint W x D and wall height H (mm).
//
// CALIPER NOTE (Sep-2026 audit): unlike tuckbox/pizzabox/snackbox, this die
// does NOT restep its fold allowances for the selected board caliper — the
// organic curved wings put reference points at every distance from the band
// anchors, so no allowance/feature separation radius exists (see caliper.js).
// Allowances stay as cut in the reference die; caliper is stamp/outer-size only.

import { PT_PER_MM } from "./cakebox.js";
import { BURGER_REF } from "./burger-ref.js";

// Reference band edges (mm, from the extracted crease frame)
const XB = [6.76, 57.67, 159.61, 210.74]; // wing | centre | wing
const YB = [10.4, 64.33, 164.32, 242.55, 344.58, 391.6]; // lip | lid | spine | base | front
const REF_W = XB[2] - XB[1]; // 101.94
const REF_D = YB[4] - YB[3]; // 102.03
const REF_H = 39.11;

export function buildBurgerboxDieline({ L, W, H, units = "mm" }) {
  // L = depth (front-to-back), W = width (hinge-parallel), H = wall height
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Dmm = toMm(L);
  const Wmm = toMm(W);
  const Hmm = toMm(H);

  const warnings = [];
  if (!(Dmm > 0) || !(Wmm > 0) || !(Hmm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (Wmm < 70 || Dmm < 70) warnings.push("Below ~70 mm the wing curves crowd each other — check the preview closely.");
  if (Hmm < 30 || Hmm > 55) warnings.push("Wall height outside the proven 30–55 mm range — lips/wings are stretched, review before cutting a die.");
  const fW = Wmm / REF_W;
  const fD = Dmm / REF_D;
  const fH = Hmm / REF_H;
  if (Math.max(fW, fD, fH) / Math.min(fW, fD, fH) > 1.6) {
    warnings.push("Strongly non-uniform scaling — corner radii and tuck shapes distort; treat as a draft for the die maker.");
  }

  // piecewise-linear band mapping
  const xScales = [fH, fW, fH];
  const yScales = [fH, fD, fH, fD, fH];
  const mapAxis = (v, bands, scales) => {
    let out = 0;
    for (let i = 0; i < scales.length; i++) {
      const b0 = bands[i];
      const b1 = bands[i + 1];
      if (v >= b1) {
        out += (b1 - b0) * scales[i];
      } else {
        out += Math.max(0, v - b0) * scales[i];
        return out;
      }
    }
    return out;
  };
  // points left of the first band edge keep their offset to it
  const mapX = (x) => (x < XB[0] ? (x - XB[0]) * xScales[0] : mapAxis(x, XB, xScales)) * PT_PER_MM;
  const mapY = (y) => (y < YB[0] ? (y - YB[0]) * yScales[0] : mapAxis(y, YB, yScales)) * PT_PER_MM;

  const segments = [];
  for (const tag of ["cut", "crease"]) {
    for (const s of BURGER_REF[tag]) {
      const pts = s.slice(1).map(([x, y]) => [mapX(x), mapY(y)]);
      segments.push({ layer: tag, kind: s[0], pts });
    }
  }

  const widthPt = mapX(XB[3]);
  const heightPt = mapY(YB[5]);
  const blank = { widthPt, heightPt, flapDepthPt: Hmm * PT_PER_MM, style: "burgerbox" };

  const dims = [
    { x1: mapX(XB[1]), y1: mapY(YB[3]) + (Dmm / 2) * PT_PER_MM, x2: mapX(XB[2]), y2: mapY(YB[3]) + (Dmm / 2) * PT_PER_MM, valuePt: Wmm * PT_PER_MM, rotated: false },
    { x1: mapX(XB[2]) + 20, y1: mapY(YB[3]), x2: mapX(XB[2]) + 20, y2: mapY(YB[4]), valuePt: Dmm * PT_PER_MM, rotated: true },
    { x1: mapX(XB[2]) + 20, y1: mapY(YB[2]), x2: mapX(XB[2]) + 20, y2: mapY(YB[2]) + Hmm * PT_PER_MM, valuePt: Hmm * PT_PER_MM, rotated: true },
    { x1: 0, y1: heightPt + 17, x2: widthPt, y2: heightPt + 17, valuePt: widthPt, rotated: false },
  ];

  return { segments, blank, dims, warnings, valid: true };
}
