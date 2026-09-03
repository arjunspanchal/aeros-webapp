// SNACK BOX dieline — production hinged-lid corrugated snack box, E-FLUTE
// 1.5 mm board (garlic
// knots / sides box family). Same construction language as the production
// pizza die: rolled back wall with raised lock tabs, side walls with snap
// bumps, hinged lid with side wings, lip with centred finger notch.
//
// Calibrated by BANDED SCALING of the embedded 200 x 105 x 35 mm production
// master (fully dimensioned single-up from the 4-up layout): panel bands
// follow internal W (width) and L (depth), wall bands follow height H, the
// tab strip and lip stay fixed. At 200 x 105 x 35 the output IS the
// production die.

import { PT_PER_MM } from "./cakebox.js";
import { SNACK_REF } from "./snack-ref.js";
import { makeCaliperRemap, refPoints } from "./caliper.js";

const XB = [330.4, 365.4, 565.4, 600.4]; // wall | base panel | wall
const YB = [113.1, 156.1, 191.1, 296.1, 331.1, 433.6, 465.6]; // tabs | back | base | front | lid | lip
const REF_W = XB[2] - XB[1]; // 200
const REF_L = YB[3] - YB[2]; // 105
const REF_LID = YB[5] - YB[4]; // 102.5
const REF_H = 35;

export function buildSnackboxDieline({ L, W, H, thickness, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L); // internal depth (hinge to front)
  const Wm = toMm(W); // internal width
  const Hm = toMm(H);

  const warnings = [];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (Wm < 120) warnings.push("Below ~120 mm wide the back tabs and finger notch crowd — check the preview.");
  if (Hm < 25 || Hm > 50) warnings.push("Wall height outside the proven 25–50 mm range for this die family.");

  const fW = Wm / REF_W;
  const fL = Lm / REF_L;
  const fH = Hm / REF_H;
  const xScales = [fH, fW, fH];
  const yScales = [1, fH, fL, fH, (Lm - (REF_L - REF_LID)) / REF_LID, 1];

  const mapAxis = (v, bands, scales) => {
    let out = 0;
    for (let i = 0; i < scales.length; i++) {
      const b0 = bands[i], b1 = bands[i + 1];
      if (v >= b1) out += (b1 - b0) * scales[i];
      else { out += Math.max(0, v - b0) * scales[i]; return out; }
    }
    return out;
  };
  // allowance offsets in this reference sit within 3.96 mm of a band anchor,
  // nearest real feature is 4.96 mm out — radius 4.45 splits them cleanly
  const { remapX, remapY } = makeCaliperRemap({ thickness, refCaliper: 1.5, anchorsX: XB, anchorsY: YB, points: refPoints(SNACK_REF), radius: 4.45, warnings });
  const mapX = (x) => mapAxis(Math.max(remapX(x), XB[0]), XB, xScales) * PT_PER_MM;
  const mapY = (y) => mapAxis(Math.max(remapY(y), YB[0]), YB, yScales) * PT_PER_MM;

  const segments = [];
  for (const tag of ["cut", "crease"]) {
    for (const s of SNACK_REF[tag]) {
      segments.push({ layer: tag, kind: s[0], pts: s.slice(1).map(([x, y]) => [mapX(x), mapY(y)]) });
    }
  }

  const widthPt = mapX(XB[3]);
  const heightPt = mapY(YB[6]);
  const blank = { widthPt, heightPt, flapDepthPt: Hm * PT_PER_MM, style: "snackbox" };
  const dims = [
    { x1: mapX(XB[1]), y1: mapY(YB[2]) + (Lm / 2) * PT_PER_MM, x2: mapX(XB[2]), y2: mapY(YB[2]) + (Lm / 2) * PT_PER_MM, valuePt: Wm * PT_PER_MM, rotated: false },
    { x1: mapX(XB[3]) + 17, y1: mapY(YB[2]), x2: mapX(XB[3]) + 17, y2: mapY(YB[3]), valuePt: Lm * PT_PER_MM, rotated: true },
    { x1: mapX(XB[0]) - 15, y1: mapY(YB[1]), x2: mapX(XB[0]) - 15, y2: mapY(YB[2]), valuePt: Hm * PT_PER_MM, rotated: true },
    { x1: 0, y1: heightPt + 17, x2: widthPt, y2: heightPt + 17, valuePt: widthPt, rotated: false },
  ];
  return { segments, blank, dims, warnings, valid: true };
}
