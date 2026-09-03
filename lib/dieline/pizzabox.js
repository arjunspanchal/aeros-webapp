// PIZZA BOX dieline — calibrated to the PRODUCTION one-piece die family
// (drawn for E-FLUTE 1.5 mm board; other flutes shift fold allowances)
// (7/8/9/12-inch corrugated pizza boxes; the 12-inch 1-up layout is the
// embedded reference). Construction: base with rolled back wall + raised lock
// tabs, slotted side walls, front wall with slotted fold-over, hinged lid
// whose side wings carry snap bumps that lock into the base side-wall slots,
// rounded lid corners and a front lip with thumb notch.
//
// Parametrised by BANDED SCALING of the embedded reference (same proven
// approach as the burger clamshell): panel bands follow internal W (width)
// and L (depth), wall bands follow height H, tab strip and lid lip stay
// fixed. At W=L=308, H=43 the output IS the production 12-inch die; the
// production 7-inch cross-checks within ~1.5 mm.

import { PT_PER_MM } from "./cakebox.js";
import { PIZZA_REF } from "./pizza-ref.js";
import { makeCaliperRemap, refPoints } from "./caliper.js";

// reference band edges (mm)
const XB = [12.0, 55.0, 366.1, 409.1]; // wall | base panel | wall
const YB = [10.3, 60.3, 103.0, 410.8, 455.5, 763.6, 804.6]; // tabs | back wall | base | front | lid | lip
const REF_W = XB[2] - XB[1]; // 311.1
const REF_L = YB[3] - YB[2]; // 307.8
const REF_LID = YB[5] - YB[4]; // 308.1
const REF_H = 43;

export function buildPizzaboxDieline({ L, W, H, thickness, units = "mm" }) {
  const toMm = units === "in" ? (v) => v * 25.4 : (v) => v;
  const Lm = toMm(L); // internal depth (hinge to front)
  const Wm = toMm(W); // internal width
  const Hm = toMm(H); // wall height

  const warnings = [];
  if (!(Lm > 0) || !(Wm > 0) || !(Hm > 0)) {
    return { segments: [], blank: null, warnings: ["All dimensions must be positive."], valid: false };
  }
  if (Lm < 150 || Wm < 150) warnings.push("Below ~150 mm the lock tabs and slots crowd — check the preview.");
  if (Hm < 35 || Hm > 55) warnings.push("Wall height outside the proven 35–55 mm range for this die family.");

  const fW = Wm / REF_W;
  const fL = Lm / REF_L;
  const fH = Hm / REF_H;

  const xScales = [fH, fW, fH];
  const yScales = [1, fH, fL, fH, (Lm + (REF_LID - REF_L)) / REF_LID, 1]; // lid tracks depth, lip fixed
  const mapAxis = (v, bands, scales) => {
    let out = 0;
    for (let i = 0; i < scales.length; i++) {
      const b0 = bands[i], b1 = bands[i + 1];
      if (v >= b1) out += (b1 - b0) * scales[i];
      else { out += Math.max(0, v - b0) * scales[i]; return out; }
    }
    return out;
  };
  // allowance offsets in this reference sit within 4.4 mm of a band anchor,
  // nearest real feature is 4.95 mm out — radius 4.6 splits them cleanly
  const { remapX, remapY } = makeCaliperRemap({ thickness, refCaliper: 1.5, anchorsX: XB, anchorsY: YB, points: refPoints(PIZZA_REF), radius: 4.6, warnings });
  const mapX = (x) => mapAxis(Math.max(remapX(x), XB[0]), XB, xScales) * PT_PER_MM;
  const mapY = (y) => mapAxis(Math.max(remapY(y), YB[0]), YB, yScales) * PT_PER_MM;

  const segments = [];
  for (const tag of ["cut", "crease"]) {
    for (const s of PIZZA_REF[tag]) {
      const kind = s[0] === "re" ? "re" : s[0];
      if (kind === "re") {
        const [x0, y0] = s[1], [x1, y1] = s[2];
        const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        for (let i = 0; i < 4; i++) {
          segments.push({ layer: tag, kind: "l", pts: [c[i], c[(i + 1) % 4]].map(([x, y]) => [mapX(x), mapY(y)]) });
        }
      } else {
        segments.push({ layer: tag, kind, pts: s.slice(1).map(([x, y]) => [mapX(x), mapY(y)]) });
      }
    }
  }

  const widthPt = mapX(XB[3]);
  const heightPt = mapY(YB[6]);
  const blank = { widthPt, heightPt, flapDepthPt: Hm * PT_PER_MM, style: "pizzabox" };
  const dims = [
    { x1: mapX(XB[1]), y1: mapY(YB[2]) + (Lm / 2) * PT_PER_MM, x2: mapX(XB[2]), y2: mapY(YB[2]) + (Lm / 2) * PT_PER_MM, valuePt: Wm * PT_PER_MM, rotated: false },
    { x1: mapX(XB[3]) + 17, y1: mapY(YB[2]), x2: mapX(XB[3]) + 17, y2: mapY(YB[3]), valuePt: Lm * PT_PER_MM, rotated: true },
    { x1: mapX(XB[0]) - 15, y1: mapY(YB[2]), x2: mapX(XB[0]) - 15, y2: mapY(YB[2]) + Hm * PT_PER_MM, valuePt: Hm * PT_PER_MM, rotated: true },
    { x1: 0, y1: heightPt + 17, x2: widthPt, y2: heightPt + 17, valuePt: widthPt, rotated: false },
  ];
  return { segments, blank, dims, warnings, valid: true };
}
