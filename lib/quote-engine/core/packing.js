// Bag carton estimate (inside size). Port of the bag skill's carton_check.py.
// Three separate models: twisted and flat handle never share calibration
// (Arjun, 11-Nov-2026). Always an estimate until a packed case is measured.

import { ceilTo } from "./num.js";

const MAX_STACK_MM = { twisted: 470, flat: 560, sos: 330 };

/**
 * @param {"twisted"|"flat"|"sos"} kind
 * @returns {{w:number,l:number,h:number,stacks:number,cbm:number,tareKg:number,surfaceM2:number}}
 */
export function bagCarton(kind, { W, G, gsm, H, casePack, handleMm = 150, tarePerM2 = 0.875 }) {
  const perBag =
    kind === "twisted" ? 0.95 + 0.0046 * G : kind === "flat" ? 1.22 : 0.0125 * gsm;
  const stack = casePack * perBag;

  let stacks = Math.max(1, Math.ceil((stack + 10) / MAX_STACK_MM[kind]));
  const rows = stacks > 3 ? 2 : 1; // big cases tile as a block, e.g. 2 × 2
  const across = Math.ceil(stacks / rows);
  stacks = across * rows;

  let w, l;
  if (kind === "twisted") {
    w = (W + 20) * across;
    l = (H + handleMm - 40) * rows;
  } else if (kind === "flat") {
    w = (W + 10) * across;
    l = (H + 100) * rows;
  } else {
    w = W * across + 25;
    l = H * rows + 25;
  }

  let h = stack / stacks + (kind === "flat" ? 0 : 10);
  if (kind === "twisted") h = ceilTo(h, 5);

  w = Math.round(w);
  l = Math.round(l);
  h = Math.round(h);
  const [a, b, c] = [w / 1000, l / 1000, h / 1000];
  const surfaceM2 = 2 * (a * b + a * c + b * c);
  return { w, l, h, stacks, cbm: a * b * c, surfaceM2, tareKg: surfaceM2 * tarePerM2 };
}

/** Which carton model a bag type packs with; null when no model exists yet. */
export function cartonKindFor(bagType) {
  if (bagType === "twisted") return "twisted";
  if (bagType === "flat") return "flat";
  if (bagType === "sos") return "sos";
  return null; // V-bottom / flat pouches: not calibrated, measure a case
}
