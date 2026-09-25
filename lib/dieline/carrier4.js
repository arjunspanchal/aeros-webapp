// 4-CUP CARRIER (carry box) — emits the embedded PCKG/Testing Grounds "Jallo
// Creamery 4-Cup Carrier" die (carrier4-ref.js) at its reference size, and
// band-scales it for other sizes: the four wall panels follow the requested
// wall width, the wall band follows the height, and the gable/handle strip and
// bottom-lock flaps stay at the die maker's proven proportions.
//
// Reference: 4 walls x 165.5 mm, wall band 108.8 mm, assembled 165.5 x 165.5
// x 228 mm (wall + gable), blank 744 x 328.7 mm.
//
// Inputs: L = wall width (one side of the square box), W = unused (kept at the
// wall width), H = wall height to the gable crease.

import { PT_PER_MM } from "./cakebox.js";
import { CARRIER4_REF } from "./carrier4-ref.js";

const REF_P = 165.5; // wall panel width on the reference die
const REF_HW = 108.8; // wall band height (bottom crease -> gable crease)
const XB = [0, 82.7, 248.2, 413.7, 579.2, 744]; // glue flap | 4 walls (x in ref space)
const YB = [0, 119.2, 228, 328.7]; // gable + handle | wall band | bottom lock

export function buildCarrier4Dieline({ L, W, H, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const P = +L > 0 ? toMm(L) : REF_P;
  const Hw = +H > 0 ? toMm(H) : REF_HW;

  const warnings = [
    "4-cup carry box embedded VERBATIM from the PCKG / Testing Grounds 'Jallo Creamery' production die (165.5 x 165.5 x 228, blank 744 x 328.7) — die-exact at that size.",
  ];
  const exact = Math.abs(P - REF_P) < 0.05 && Math.abs(Hw - REF_HW) < 0.05;
  if (!exact) {
    warnings.push("Off the reference size: wall panels and wall height are band-scaled; the gable peak, hand hole and bottom lock keep the die maker's proportions. Prototype before cutting a new die.");
  }

  const fP = P / REF_P, fH = Hw / REF_HW;
  const xScales = [fP, fP, fP, fP, fP]; // glue flap follows the panel width
  const yScales = [1, fH, 1]; // gable strip and bottom lock stay fixed
  const mapAxis = (v, bands, scales) => {
    let out = 0;
    for (let i = 0; i < scales.length; i++) {
      const b0 = bands[i], b1 = bands[i + 1];
      if (v >= b1) out += (b1 - b0) * scales[i];
      else { out += Math.max(0, v - b0) * scales[i]; return out; }
    }
    return out;
  };
  const mx = (x) => mapAxis(Math.max(x, 0), XB, xScales) * PT_PER_MM;
  const my = (y) => mapAxis(Math.max(y, 0), YB, yScales) * PT_PER_MM;

  const segments = [];
  for (const tag of ["cut", "crease"]) {
    for (const s of CARRIER4_REF[tag]) {
      segments.push({ layer: tag, kind: s[0], pts: s.slice(1).map(([x, y]) => [mx(x), my(y)]) });
    }
  }

  const BW = mx(XB[5]), BH = my(YB[3]);
  const blank = { widthPt: BW, heightPt: BH, flapDepthPt: my(YB[1]), style: "carrier4" };
  const boxH = Hw + (YB[2] - YB[1]); // wall + gable = assembled height
  const dims = [
    { x1: mx(XB[1]), y1: my(YB[1]) + (Hw / 2) * PT_PER_MM, x2: mx(XB[2]), y2: my(YB[1]) + (Hw / 2) * PT_PER_MM, valuePt: P * PT_PER_MM, label: "wall {v}", rotated: false },
    { x1: mx(XB[2]) + 12, y1: my(YB[1]), x2: mx(XB[2]) + 12, y2: my(YB[2]), valuePt: Hw * PT_PER_MM, label: "wall H {v}", rotated: true },
    { x1: BW + 10, y1: my(YB[0]), x2: BW + 10, y2: my(YB[2]), valuePt: boxH * PT_PER_MM, label: "box H {v}", rotated: true },
    { x1: 0, y1: BH + 17, x2: BW, y2: BH + 17, valuePt: BW, rotated: false },
  ];
  return { segments, blank, dims, warnings, valid: true, meta: { panel: P, wallH: Hw, boxH, exact } };
}
