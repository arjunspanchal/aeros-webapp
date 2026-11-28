// What a customer may see of a priced line. Everything here is safe to send
// out: no cost, no margin, no mill or vendor name, no machine or plate talk.
// The Excel customer copy and the on-screen quote list are both built from it.

const int = (n) => Number(n).toLocaleString("en-IN");
// Free text typed by staff reaches the customer's Excel, so it is forced to
// plain text (an object from a crafted request must never become a cell).
const text = (v) => (typeof v === "string" ? v.trim().slice(0, 200) : typeof v === "number" ? String(v) : "");

// Mills, printers and vendors whose names must not go out on a quote.
const SUPPLIERS = ["allyking", "ashtavinayak", "blueline", "blue line", "lucky offset", "viana", "jodhani", "om shivaay", "ajit", "sunwood", "khateema", "pudumjee", "wikas", "tnpl", "janta", "carma", "olive", "magnum", "ginni", "smart pack", "priya", "top vision", "dipl", "bionova", "mitul"];
/** The supplier names found in customer-facing free text (item name, size, reference). */
export function supplierWordsIn(...texts) {
  const all = texts.map(text).join(" ").toLowerCase();
  return SUPPLIERS.filter((w) => new RegExp(`\\b${w.replace(/ /g, "\\s*")}\\b`).test(all));
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const BAG_ITEM = { sos: "SOS paper bag", twisted: "Twisted handle paper bag", flat: "Flat handle paper bag", vbottom: "V-bottom paper bag" };
const BAG_BUILD = {
  sos: "square bottom, side gussets, no handle",
  twisted: "twisted paper rope handle pasted inside · square bottom, side gussets",
  flat: "flat paper handle pasted inside · square bottom, side gussets",
  vbottom: "V bottom",
};
const BAG_PRINT = {
  logo: (c) => `${plural(c, "colour")}, logo`,
  solid: (c) => `${plural(c, "colour")}`,
  p50: (c) => `${plural(c, "colour")}, half coverage`,
  flood: (c) => `${plural(c, "colour")}, full flood`,
  p100: (c) => `${plural(c, "colour")}, full coverage`,
  metallic: (c) => `${plural(c, "colour")}, full coverage with metallic`,
};

/** Paper as a customer reads it: a grade, never a mill. House rule: kraft is "Recycled", never virgin. */
function bagMaterial(spec) {
  const grade = spec.paper?.grade;
  if (grade === "OGR") return `Grease-resistant paper, ${spec.gsm} GSM`;
  if (grade === "MG") return `MG kraft paper, ${spec.gsm} GSM`;
  return `Recycled ${spec.paper?.colour === "white" ? "White" : "Brown"} Kraft, ${spec.gsm} GSM`;
}

const CUP_ITEM = { SW: "Single wall paper cup", DW: "Double wall paper cup", RIPPLE: "Ripple paper cup", TUB: "Paper tub Ø115" };

// Board grades with a vendor's name in them are shown by their generic grade.
const boardName = (label = "") => (/allyking|hi-?bulk/i.test(label) ? "FBB" : label || "Board");

const FINISH = { gloss: "gloss lamination", matt: "matt lamination", pvc: "PVC lamination" };

function oneTime(result) {
  return (result.oneTime ?? []).map((o) => ({
    label: o.key === "setup" ? "Setup charge (one-time, extra)" : o.key === "plates" ? `${o.label.replace(/^Flexo |^Offset /, "Printing ")} (one-time, extra)` : `${o.label} (one-time, extra)`,
    value: o.value,
    note: o.value === null ? "at actuals" : o.key === "setup" ? "per size" : "per design",
  }));
}

/**
 * @returns the customer-facing description of one priced line, or null when it has no price.
 */
export function customerLine(spec, result, ref = "") {
  if (!result?.lines) return null;
  const exp = result.export;
  const basis = exp ? "FOB" : "EXW";
  const rate = exp && spec.family === "bag" ? exp.fob : result.sell;
  const rate2 = Math.round((rate + Number.EPSILON) * 100) / 100;
  const qty = result.qty ?? spec.qty ?? null;
  const casePack = result.packing?.casePack ?? null;
  const c = result.packing?.carton;
  const base = {
    ref: text(ref), basis, qty, rate: rate2, amount: qty ? Math.round(rate2 * qty * 100) / 100 : null,
    casePack, cartons: qty && casePack ? Math.ceil(qty / casePack) : null,
    carton: c ? `${c.w} × ${c.l} × ${c.h} mm` : result.packing?.baled ? "Bales, no carton" : null,
    oneTime: oneTime(result),
    // An export line also carries its price per case, in rupees and in dollars.
    perCase: exp && casePack ? Math.round(rate2 * casePack * 100) / 100 : null,
    usdPerCase: exp && casePack && exp.fx ? Math.round(((rate2 * casePack) / exp.fx) * 100) / 100 : null,
    fx: exp?.fx ?? null,
  };

  if (spec.family === "bag") {
    const { W, G, H } = result.size;
    const slab = spec.print?.slab ?? "none";
    const made = result.route === "handmade" ? "Hand-made" : "Machine-made";
    return {
      ...base,
      item: BAG_ITEM[spec.type],
      detail: `${made} · ${BAG_BUILD[spec.type]}`,
      size: `${W} × ${G} × ${H} mm (W × G × H)`,
      material: bagMaterial(spec),
      printing: slab === "none" ? "Plain" : BAG_PRINT[slab](Math.max(1, spec.print?.colours ?? 1)),
    };
  }

  if (spec.family === "cup") {
    const tub = spec.wall === "TUB";
    const mode = spec.print?.mode ?? "none";
    return {
      ...base,
      item: `${CUP_ITEM[String(spec.wall).toUpperCase()]}${tub ? "" : ","} ${String(spec.size).replace("_", " ")}`.replace(" ,", ","),
      detail: tub ? "PE coated inside and out" : "PE coated inside",
      size: String(spec.size).replace("_", " "),
      material: `Paper board, ${spec.gsm ?? 280} GSM${String(spec.wall).toUpperCase() === "DW" ? ` inner + ${spec.outerGsm ?? spec.gsm ?? 280} GSM outer` : ""}, PE coated`,
      printing: mode === "none" ? "Plain" : plural(Math.max(1, spec.print?.colours ?? 1), "colour"),
    };
  }

  if (spec.family === "pp") {
    const colours = spec.print?.colours ?? 0;
    return {
      ...base,
      item: text(spec.name) || result.item.label,
      detail: result.item.kind === "lid" ? "Injection moulded lid" : "Injection moulded, food grade",
      size: "",
      material: `Polypropylene (PP), ${result.item.weightG} g`,
      printing: colours > 0 ? plural(colours, "colour") : "Plain",
    };
  }

  if (spec.family === "wrap") {
    const mode = spec.print?.mode ?? "none";
    const grade = spec.paper?.grade;
    const paper = grade === "OGR" ? "Grease-resistant paper" : grade === "MG" ? "MG paper" : grade === "Bleach Kraft White" ? "Bleached white paper" : "Food-grade paper";
    const { W, L } = result.size;
    return {
      ...base,
      item: text(spec.name) || "Food wrap paper",
      detail: "Flat cut sheets, packed 1,000 to a poly",
      size: `${W} × ${L} mm`,
      material: `${paper}, ${spec.gsm} GSM`,
      printing: mode === "none" ? "Plain" : plural(Math.max(1, spec.print?.colours ?? 1), "colour"),
    };
  }

  const finishes = [spec.finish?.outside && FINISH[spec.finish.outside] && `${FINISH[spec.finish.outside]} outside`, spec.finish?.inside && FINISH[spec.finish.inside] && `${FINISH[spec.finish.inside]} inside`].filter(Boolean);
  const mode = spec.print?.mode ?? "none";
  const colours = mode === "ink_flat" ? 4 : Math.max(1, spec.print?.colours ?? 1);
  return {
    ...base,
    item: text(spec.name) || "Box",
    detail: finishes.join(", "),
    size: text(spec.size),
    material: `${boardName(spec.board?.label)}, ${spec.board?.gsm} GSM${spec.board?.pe ? ", PE coated" : ""}`,
    printing: mode === "none" ? "Plain" : `${plural(colours, "colour")}${spec.print?.sides === 2 ? ", both sides" : ""}`,
  };
}

export const PRICE_BASIS = {
  EXW: "Ex-Factory, Mumbai, India · GST extra",
  FOB: "FOB Nhava Sheva, India",
};

/** The standing terms on every Aeros quote (bag and quote skills). */
export function quoteTerms(basis) {
  return [
    basis === "FOB" ? "Prices are FOB Nhava Sheva, in INR unless stated."
      : basis === "MIXED" ? "Lines marked FOB are FOB Nhava Sheva. All other prices are ex-factory, Mumbai, India, with GST extra at the applicable rate. Prices are in INR unless stated."
      : "Prices are ex-factory, Mumbai, India, in INR. GST is extra at the applicable rate.",
    "Rates are for full container loads. Part loads and LCL shipments are priced higher.",
    "Plates, dies and setup are one-time charges, billed separately, and are not in the per-piece rate.",
    "This quotation is valid for 30 days. Rates will be revised if paper or board moves by more than 5%.",
    "Tolerances: size ±3 mm, GSM ±5%, quantity ±5%.",
    "Quantities are supplied in full cartons. Carton sizes and weights are calculated and will be confirmed on first production.",
    "Artwork is needed as vector files with Pantone references, and is approved in writing before production.",
    "A lead-time schedule for each item will be shared separately.",
    "Claims, if any, are to be raised within 7 days of receipt. This quotation is not a contract until a purchase order is accepted.",
  ];
}

export const CONTACT_LINE = "Aeros · +91 79770 77571 · www.aeros-x.com · Mumbai, Maharashtra, India";
export { int as formatInt };
