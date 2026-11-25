// Turn a pasted list of bag sizes (from an RFQ sheet, an email or WhatsApp)
// into rows. One bag per line. Understands:
//
//   10x5x13                      three numbers, any separator (x, ×, *, tab, comma, space)
//   Venus  10 x 5 x 13           a leading name is kept as the customer's reference
//   10cm x 5cm x 13cm / 10" x 5" a unit written in the line wins over the box's unit
//   5 1/4 x 3 x 9                inch fractions
//   9x6/5                        trade shorthand: height × width / gusset
//   254 x 127 x 330 100gsm       a GSM;  40# or 60 lb  a US basis weight
//   8x4x10 25000 / qty 2000 / 5k / 1 lakh    a quantity: marked, or 5,000 and over
//   #4 5x3.13x9.75 500           a case pack: marked (pack of, /case) or a plain 100–2,500
//   SOS 6x4x12 / TH 10x7x12      a bag type: sos / no handle, th / pth / twisted, fhb / flat handle, v-bottom
//
// The size is converted exactly and never snapped or rounded up. A price in
// the line (Rs 650, $12.40) is ignored.

const UNIT_MM = { mm: 1, cm: 10, in: 25.4 };

export const SIZE_ORDERS = {
  WGH: { label: "Width × gusset × height", pick: ([a, b, c]) => ({ W: a, G: b, H: c }) },
  WHG: { label: "Width × height × gusset", pick: ([a, b, c]) => ({ W: a, H: b, G: c }) },
  HWG: { label: "Height × width × gusset", pick: ([a, b, c]) => ({ H: a, W: b, G: c }) },
};

// Checked in this order: "SOS no handle" and "flat bottom SOS" are SOS bags,
// whatever other words they contain.
const TYPE_WORDS = [
  [/\b(sos|grocery|no[\s-]?handle|without\s+handles?)\b/i, "sos"],
  [/\b(v[\s-]?bottom|vb|pouch)\b/i, "vbottom"],
  [/\b(flat[\s-]?handle|fhb)\b/i, "flat"],
  [/\b(twisted|twist|pth|th|rope|handle)\b/i, "twisted"],
];
const TYPE_STRIP = /\b(sos|grocery|no[\s-]?handle|without\s+handles?|v[\s-]?bottom|vb|pouch|flat[\s-]?(?:handle|bottom)|fhb|twisted|twist|pth|th|rope|handles?|bags?)\b/gi;

const NUM = "(\\d+(?:\\.\\d+)?)";
const toMm = (v, unit) => Math.round(v * UNIT_MM[unit] * 10) / 10;
const numOf = (t) => Number(String(t).replace(/,/g, ""));

/**
 * @returns {{ rows: Array<{ref,W,G,H,gsm,lb,qty,casePack,type,unit,line}>, skipped: Array<{line,text,why}> }}
 */
export function parseSizes(text, { unit = "mm", order = "WGH" } = {}) {
  const rows = [];
  const skipped = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const original = raw.trim();
    if (!original) return;
    const skip = (why) => skipped.push({ line: i + 1, text: original, why });

    // "5 1/4" and "5-1/4" are inch fractions; a bare "1/6" (as in "1/6 BBL") is a name and is left alone.
    let line = original.replace(/(\d+)[ -](\d+)\/(\d+)(?!\d)/g, (m, w, n, d) => (Number(d) ? String(Math.round((Number(w) + Number(n) / Number(d)) * 1000) / 1000) : m));

    // A price is not a size, a quantity or a case pack.
    line = line.replace(/(?:rs\.?|inr|₹|\$|usd|aed)\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*(?:rs\.?|inr|₹|usd|aed)\b/gi, " ");

    // A unit written beside the numbers wins over the unit chosen for the box.
    let lineUnit = unit;
    const unitHit = /\d\s*(cm|mm|inch(?:es)?|in|"|”|'')(?=[\s,;x×*)]|$)/i.exec(line);
    if (unitHit) lineUnit = /^cm$/i.test(unitHit[1]) ? "cm" : /^mm$/i.test(unitHit[1]) ? "mm" : "in";
    line = line.replace(/(\d)\s*(?:cm|mm|inch(?:es)?|in|"|”|'')(?=[\s,;x×*)]|$)/gi, "$1 ");

    // The size: "9x6/5" shorthand, then the first "a x b x c", then (a sheet
    // pasted as columns) the first three numbers after any line number.
    let size, before, after;
    const short = new RegExp(`${NUM}\\s*[x×*X]\\s*${NUM}\\s*/\\s*${NUM}`).exec(line);
    const explicit = new RegExp(`${NUM}\\s*[x×*X]\\s*${NUM}\\s*[x×*X]\\s*${NUM}`).exec(line);
    if (explicit) {
      size = SIZE_ORDERS[order].pick(explicit.slice(1, 4).map(Number));
      before = line.slice(0, explicit.index);
      after = line.slice(explicit.index + explicit[0].length);
    } else if (short) {
      // height × width / gusset, the trade's inch shorthand
      size = { H: Number(short[1]), W: Number(short[2]), G: Number(short[3]) };
      before = line.slice(0, short.index);
      after = line.slice(short.index + short[0].length);
    } else {
      // take a GSM or a lb weight out first so it is not read as a dimension
      const masked = line.replace(/\d+(?:\.\d+)?\s*-?\s*gsm\b|\bgsm\s*:?\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:#|lbs?\b)/gi, (m) => " ".repeat(m.length));
      const isLabel = (idx) => /(?:#|\b(?:no|sr|s\.?\s*no|item|line|sl)\.?\s*)$/i.test(masked.slice(0, idx));
      const found = [...masked.matchAll(/(?<![#\d.])\d+(?:\.\d+)?/g)].filter((m) => !isLabel(m.index) && !(m.index === 0 && /^\d+\s*[.)]\s/.test(masked)));
      if (found.length < 3) return skip("needs three numbers for the size");
      size = SIZE_ORDERS[order].pick(found.slice(0, 3).map((m) => Number(m[0])));
      before = line.slice(0, found[0].index);
      after = line.slice(found[2].index + found[2][0].length);
      const lead = /\d+(?:\.\d+)?\s*-?\s*gsm\b|\d+(?:\.\d+)?\s*(?:#|lbs?\b)/i.exec(before);
      if (lead) after += ` ${lead[0]}`;
    }
    if (![size.W, size.G, size.H].every((d) => d >= 0) || !(size.W > 0 && size.H > 0)) return skip("a size of zero");

    // GSM, basis weight, quantity and case pack come from what follows the size.
    let gsm, lb, qty, casePack;
    let tail = after.replace(/(\d+(?:\.\d+)?)\s*-?\s*gsm\b|\bgsm\s*:?\s*(\d+(?:\.\d+)?)/i, (_, x, y) => { gsm = Number(x ?? y); return " "; });
    // US sheets give a basis weight in lb: "40#", "60 lb". 1 lb per 3,000 sq ft = 1.6275 GSM.
    tail = tail.replace(/(\d+(?:\.\d+)?)\s*(?:#|lbs?\b)/i, (_, x) => { lb = Number(x); return " "; });
    if (gsm === undefined && lb) gsm = Math.round(lb * 1.6275);
    // A quantity is marked (qty, pcs, nos, 25k, 1 lakh) or is 5,000 and over.
    // A case pack is marked (pack of, per case) or is a plain 100–2,500: an RFQ
    // sheet's "500" beside a size is how the bags are packed, not the order.
    tail = tail.replace(/(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?)\b/i, (_, x) => { qty = Math.round(Number(x) * 100000); return " "; });
    tail = tail.replace(/(\d+(?:\.\d+)?)\s*k\b/i, (_, x) => { qty = qty ?? Math.round(Number(x) * 1000); return " "; });
    tail = tail.replace(/(?:qty|quantity|pcs|pieces|nos|units)\s*[:=]?\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:pcs|pieces|nos|units)\b/i, (_, a, b) => { qty = qty ?? numOf(a ?? b); return " "; });
    tail = tail.replace(/(?:case\s*pack|pack(?:ing)?|case|per\s*(?:case|box|carton|bundle)|\/\s*(?:cs|case|box))\s*(?:of)?\s*[:=]?\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:\/|per)\s*(?:cs|case|box|carton|bundle)/i, (_, a, b) => { casePack = numOf(a ?? b); return " "; });
    for (const m of tail.matchAll(/\d{1,3}(?:,\d{2,3})+(?!\d)|\d+/g)) {
      const v = numOf(m[0]);
      if (qty === undefined && v >= 5000) qty = v;
      else if (casePack === undefined && v >= 100 && v <= 2500 && Number.isInteger(v)) casePack = v;
    }

    let type;
    for (const [re, t] of TYPE_WORDS) {
      if (re.test(line)) { type = t; break; }
    }

    // Whatever comes before the size, minus bag-type words and a stray weight, is the customer's name for the line.
    const ref = before.replace(/\d+(?:\.\d+)?\s*-?\s*gsm\b|\d+(?:\.\d+)?\s*(?:#(?!\d)|lbs?\b)/gi, " ").replace(TYPE_STRIP, " ")
      .replace(/[\s:;,\-–|]+$/g, "").replace(/^[\s:;,\-–|]+/g, "").replace(/\s+/g, " ").trim();

    rows.push({ line: i + 1, ref, W: toMm(size.W, lineUnit), G: toMm(size.G, lineUnit), H: toMm(size.H, lineUnit), gsm, lb, qty, casePack, type, unit: lineUnit });
  });
  return { rows, skipped };
}
