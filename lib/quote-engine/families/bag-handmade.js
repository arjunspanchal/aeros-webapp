// Hand-made bags printed offset: the route for runs under the machine MOQ and
// for bags the machine cannot make. From the bag skill:
//
//   (sheet paper × 1.10 + punching + hand labour + handle) × 1.03 + print + packing
//
// Paper is costed on a STANDARD offset sheet (never cut-to-size: small orders
// cannot buy paper cut to size), and the sheet is found the way the plant does
// it: a one-piece blank, or two half blanks, on each standard sheet.
// Port of Aeros Artworks/_tools/offset_bag_fit.py.

const IN = 25.4;
// Standard sheets Blueline can run (press max 25 × 36 in). Inches.
export const HANDMADE_SHEETS = [[18, 23], [20, 30], [22, 28], [23, 36], [25, 36]];

const SEAM = 20; // glue lap, mm
const BOTTOM_EXTRA = 29.6; // bottom fold allowance over G/2, mm
const GRIPPER = 12;
const GAP = 3;

/** Flat blanks for a hand-made bag: the whole bag in one piece, or one of its two halves. */
export function handmadeBlanks({ type, W, G, H, machine }) {
  if (type === "vbottom") {
    // No hand-made V-bottom die is on file: the blank is taken as the machine
    // blank plus 20 mm each way (the skill's older sheet rule). An estimate.
    return { one: { w: machine.deckle + 20, h: machine.cutoff + 20 }, half: null, estimated: true };
  }
  const h = H + G / 2 + BOTTOM_EXTRA;
  return { one: { w: SEAM + 2 * W + 2 * G, h }, half: { w: SEAM + W + G, h }, estimated: false };
}

/** Blanks of w × h on a sheet: both ways up, gripper on either edge. */
function blanksOn(w, h, sw, sl) {
  let best = 0;
  for (const [aw, al] of [[sw - 10, sl - GRIPPER - 5], [sw - GRIPPER - 5, sl - 10]]) {
    for (const [bw, bh] of [[w, h], [h, w]]) {
      const n = Math.max(0, Math.floor((aw + GAP) / (bw + GAP))) * Math.max(0, Math.floor((al + GAP) / (bh + GAP)));
      if (n > best) best = n;
    }
  }
  return best;
}

/**
 * The standard sheet that buys the least paper per bag. A bag whose half
 * blank only fits one to a sheet is made from two sheets (bags per sheet 0.5).
 * Returns null when not even a half blank fits the biggest sheet.
 */
export function fitHandmade(blanks) {
  let best = null;
  for (const [a, b] of HANDMADE_SHEETS) {
    const [sw, sl] = [a * IN, b * IN].sort((x, y) => x - y);
    const area = sw * sl;
    const options = [{ pieces: 1, bags: blanksOn(blanks.one.w, blanks.one.h, sw, sl), blank: blanks.one }];
    if (blanks.half) options.push({ pieces: 2, bags: blanksOn(blanks.half.w, blanks.half.h, sw, sl) / 2, blank: blanks.half });
    for (const o of options) {
      if (!(o.bags > 0)) continue;
      const areaPerBag = area / o.bags;
      // least paper first; on a tie the one-piece bag (less hand work), then the smaller sheet
      if (!best || areaPerBag < best.areaPerBag - 1e-6 || (Math.abs(areaPerBag - best.areaPerBag) <= 1e-6 && o.pieces < best.pieces)) {
        best = {
          label: `${a} × ${b} in`, w: sw, h: sl, areaPerBag, bagsPerSheet: o.bags, sheetsPerBag: 1 / o.bags, pieces: o.pieces, blank: o.blank,
          utilisation: (o.pieces * o.blank.w * o.blank.h) / areaPerBag,
        };
      }
    }
  }
  return best;
}

const FLOOD_SLABS = new Set(["flood", "p100", "metallic"]);

/**
 * Print on the offset sheet, ₹ per 1,000 sheets. Line work and logos go on the
 * walk-in card; a flood is priced on the Pantone card, as on cups (Arjun, 2-Nov-2026).
 */
export function handmadePrintPer1000(slab, colours, rates, { process = false } = {}) {
  if (!colours) return { per1000: 0, card: null };
  // CMYK process work runs on the walk-in card whatever the coverage (Jallo
  // take-out bag, 4 colours ₹1,600 per 1,000 sheets). Pantone floods do not.
  if (FLOOD_SLABS.has(slab) && !process) {
    return { per1000: rates.get("cup.offset.pantone_first") + rates.get("cup.offset.pantone_extra") * (colours - 1), card: "Pantone card (flood)" };
  }
  return { per1000: rates.get("box.print.blueline_walkin.first") + rates.get("box.print.blueline_walkin.extra") * (colours - 1), card: "walk-in card" };
}
