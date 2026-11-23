// Turn a pasted list of bag sizes (from an RFQ sheet, an email or WhatsApp)
// into rows. One bag per line. Understands:
//
//   10x5x13                      three numbers, any separator (x, ×, *, tab, comma, space)
//   Venus  10 x 5 x 13           a leading name is kept as the customer's reference
//   254 x 127 x 330 100gsm       a GSM
//   8x4x10 25000                 a quantity (a 4th number of 500 or more)
//   SOS 6x4x12 / TH 10x7x12      a bag type word: sos, th / pth / twisted, fhb / flat, v-bottom
//
// The size is converted from the chosen unit and never snapped or rounded up.

const UNIT_MM = { mm: 1, cm: 10, in: 25.4 };

export const SIZE_ORDERS = {
  WGH: { label: "Width × gusset × height", pick: ([a, b, c]) => ({ W: a, G: b, H: c }) },
  WHG: { label: "Width × height × gusset", pick: ([a, b, c]) => ({ W: a, H: b, G: c }) },
  HWG: { label: "Height × width × gusset", pick: ([a, b, c]) => ({ H: a, W: b, G: c }) },
};

const TYPE_WORDS = [
  [/\b(v[\s-]?bottom|vb|pouch)\b/i, "vbottom"],
  [/\b(flat[\s-]?handle|fhb|flat)\b/i, "flat"],
  [/\b(twisted|twist|pth|th|rope|handle)\b/i, "twisted"],
  [/\b(sos|no[\s-]?handle|grocery)\b/i, "sos"],
];

const toMm = (v, unit) => Math.round(v * UNIT_MM[unit] * 10) / 10;

/**
 * @returns {{ rows: Array<{ref,W,G,H,gsm,qty,type,line}>, skipped: Array<{line,text,why}> }}
 */
export function parseSizes(text, { unit = "mm", order = "WGH" } = {}) {
  const rows = [];
  const skipped = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;

    // The size is the first "a x b x c". A sheet pasted as columns has no x:
    // then it is the first three numbers, ignoring a line number like "#6".
    const N = "(\\d+(?:\\.\\d+)?)";
    const explicit = new RegExp(`${N}\\s*[x×*X]\\s*${N}\\s*[x×*X]\\s*${N}`).exec(line);
    let dims, before, after;
    if (explicit) {
      dims = explicit.slice(1, 4).map(Number);
      before = line.slice(0, explicit.index);
      after = line.slice(explicit.index + explicit[0].length);
    } else {
      // take a GSM out first so "100gsm" in a column is not read as a dimension
      const noGsm = line.replace(/\d+(?:\.\d+)?\s*-?\s*gsm\b|\bgsm\s*:?\s*\d+(?:\.\d+)?/i, (m) => " ".repeat(m.length));
      const found = [...noGsm.matchAll(/(?<![#\d.])\d+(?:\.\d+)?/g)].filter((m) => !/(?:#|\bno\.?\s*)$/i.test(noGsm.slice(0, m.index)));
      if (found.length < 3) {
        skipped.push({ line: i + 1, text: line, why: "needs three numbers for the size" });
        return;
      }
      dims = found.slice(0, 3).map((m) => Number(m[0]));
      before = line.slice(0, found[0].index);
      after = line.slice(found[2].index + found[2][0].length);
      // a GSM written before the size still counts
      const lead = /(\d+(?:\.\d+)?)\s*-?\s*gsm\b/i.exec(before);
      if (lead) after += ` ${lead[0]}`;
    }
    if (dims.some((d) => !(d > 0))) {
      skipped.push({ line: i + 1, text: line, why: "a size of zero" });
      return;
    }
    const size = SIZE_ORDERS[order].pick(dims);

    // GSM and quantity come from what follows the size.
    let gsm;
    const tail = after.replace(/(\d+(?:\.\d+)?)\s*-?\s*gsm\b|\bgsm\s*:?\s*(\d+(?:\.\d+)?)/i, (_, x, y) => {
      gsm = Number(x ?? y);
      return " ";
    });
    const qty = [...tail.matchAll(/\d{1,3}(?:,\d{3})+(?!\d)|\d+/g)].map((m) => Number(m[0].replace(/,/g, ""))).find((v) => v >= 500);

    let type;
    for (const [re, t] of TYPE_WORDS) {
      if (re.test(line)) { type = t; break; }
    }

    // Whatever comes before the size, minus a bag-type word and a stray GSM, is the customer's name for the line.
    let ref = before.replace(/\d+(?:\.\d+)?\s*-?\s*gsm\b/i, " ");
    for (const [re] of TYPE_WORDS) ref = ref.replace(re, " ");
    ref = ref.replace(/[\s:;,\-–|]+$/g, "").replace(/^[\s:;,\-–|]+/g, "").replace(/\s+/g, " ").trim();

    rows.push({ line: i + 1, ref, W: toMm(size.W, unit), G: toMm(size.G, unit), H: toMm(size.H, unit), gsm, qty, type });
  });
  return { rows, skipped };
}
