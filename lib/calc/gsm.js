// GSM (grammage) from a weighed sample: grams / sample area in m².
//
// Shop-floor use: cut a square (or punch a disc), weigh it, read the board's
// real GSM. Built after the CHC-001 cup holder (29-Sep-2026), where a 0.35 g
// Ø40 disc and an 11.1 g box both came out at ~280 gsm on a board sold as 250 —
// and an assumed Ø42 instead of the real Ø40 had read it as 253. Measure the
// sample; never take its size off the drawing.

export const SAMPLE_SHAPES = [
  { id: "sq10", label: "Square 10 × 10 cm", hint: "GSM = grams × 100" },
  { id: "sq5", label: "Square 5 × 5 cm", hint: "GSM = grams × 400" },
  { id: "circle", label: "Circle / disc (enter Ø)", hint: "e.g. a punched cup-hole disc" },
  { id: "rect", label: "Custom rectangle", hint: "any cut piece, L × W" },
];

// Common mill grades per board family (for "nearest grade" only — mills vary).
// ratePerKg = Aeros default purchase rate, editable in the UI (admin only).
export const BOARD_TYPES = [
  { id: "kraft", label: "Brown kraft board", grades: [100, 120, 150, 180, 200, 230, 250, 280, 300, 350, 400], ratePerKg: 50, rateSource: "cup-holder cartons, 29-Sep-2026" },
  { id: "fbb", label: "FBB (folding box board)", grades: [200, 210, 230, 250, 270, 300, 330, 350, 400], ratePerKg: 78, rateSource: "confirmed 18-Sep-2026" },
  { id: "duplex", label: "Duplex (grey / white back)", grades: [200, 230, 250, 270, 300, 350, 400, 450], ratePerKg: 51, rateSource: "confirmed Sep-2026" },
  { id: "artcard", label: "Art card", grades: [170, 210, 250, 300, 350, 400], ratePerKg: 80, rateSource: "confirmed Sep-2026" },
  { id: "other", label: "Other / unknown", grades: [], ratePerKg: 0, rateSource: "" },
];

export const TOLERANCE_PCT = 5; // typical mill tolerance on nominal GSM

const SHEET_25x36_M2 = 0.635 * 0.914; // the only board sheet Aeros buys

/** Sample area in m² for a shape; dims in mm. Returns 0 if incomplete. */
export function sampleAreaM2(shape, { diameterMm, lengthMm, widthMm } = {}) {
  switch (shape) {
    case "sq10": return 0.01;
    case "sq5": return 0.0025;
    case "circle": {
      const d = +diameterMm;
      return d > 0 ? (Math.PI * (d / 2000) ** 2) : 0;
    }
    case "rect": {
      const l = +lengthMm, w = +widthMm;
      return l > 0 && w > 0 ? (l / 1000) * (w / 1000) : 0;
    }
    default: return 0;
  }
}

/**
 * Core calculation.
 * @param {object} p
 * @param {number} p.weightG      total weight on the scale (g)
 * @param {number} p.areaM2       area of ONE piece (m²)
 * @param {number} [p.pieces=1]   pieces weighed together
 * @param {number} [p.resolutionG=0.01] scale resolution (g)
 * @param {number[]} [p.grades]   standard grades to snap to
 * @param {number} [p.ratePerKg]  board rate for the sheet-cost line
 */
export function computeGsm({ weightG, areaM2, pieces = 1, resolutionG = 0.01, grades = [], ratePerKg = 0 }) {
  const w = +weightG, a = +areaM2, n = Math.max(1, Math.round(+pieces || 1)), res = Math.max(0, +resolutionG || 0);
  if (!(w > 0) || !(a > 0)) return null;
  const totalArea = a * n;
  const gsm = w / totalArea;
  // a reading of W is really W ± res/2; carry that through to GSM
  const plusMinus = res / 2 / totalArea;
  const uncertaintyPct = (plusMinus / gsm) * 100;

  let nearest = null;
  if (grades.length) {
    const g = grades.reduce((best, x) => (Math.abs(x - gsm) < Math.abs(best - gsm) ? x : best), grades[0]);
    const devPct = ((gsm - g) / g) * 100;
    nearest = { grade: g, devPct, withinTolerance: Math.abs(devPct) <= TOLERANCE_PCT };
  }

  const sheetG = gsm * SHEET_25x36_M2;
  const sheet = {
    weightG: sheetG,
    costInr: ratePerKg > 0 ? (sheetG / 1000) * ratePerKg : null,
    costPerM2Inr: ratePerKg > 0 ? (gsm / 1000) * ratePerKg : null,
  };

  return { gsm, plusMinus, uncertaintyPct, totalAreaM2: totalArea, pieces: n, nearest, sheet };
}
