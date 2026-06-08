// Public paper-cup rate sheet data. Reads `master_products` (category =
// "Paper Cups") + the plain and printed pricing rows from
// `master_product_pricing`, joins them in JS, and shapes a render-ready list
// grouped by cup wall type (Single Wall, Double Wall, Ripple).
//
// Each base cup carries TWO quantity ladders so the page can toggle between
// them:
//   • plain   — unprinted cup, plain offering, breaks 25k…500k.
//   • printed — custom print up to 4 colours, taken from the paired "-CUST"
//               SKU's generic_printed offering, breaks from 5k…500k.
// Bulk oz cups break by volume; the unit rate drops as quantity rises.
// Rates are EXW India, INR only.

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only — matches the paper-bag sheet.
export const USD_PER_INR_DIVISOR = 90;

// Single-side food-contact coating weight (GSM) added to the board to display
// the laminated "wider" GSM. Keyed by lining (see liningOf). Applied to the
// inner/food-contact face only — the outer insulating wall stays bare board.
const COATING_GSM = { PE: 18, PLA: 30, Aqueous: 8 };

// India DDP build-up on top of the FCL/EXW price (= cost × 1.10): +15% margin,
// + ₹10/kg freight per piece (needs item weight), then per-product GST. Strict:
// without a per-piece weight there's no freight basis, so DDP is null ("On
// request"). GST defaults to 18% (standard for cups & bags).
const DDP_MARGIN_MULT = 1.15;
const FREIGHT_INR_PER_KG = 10;
const DEFAULT_GST_PCT = 18;
function ddpOf(fclInr, weightG, gstPct) {
  if (fclInr == null || weightG == null) return null;
  const freight = (FREIGHT_INR_PER_KG * weightG) / 1000;
  const gst = gstPct != null ? Number(gstPct) : DEFAULT_GST_PCT;
  return Math.round((fclInr * DDP_MARGIN_MULT + freight) * (1 + gst / 100) * 100) / 100;
}

// Group order + friendly section copy. Keyed by the raw `sub_category`.
const GROUP_ORDER = [
  "Single Wall Paper Cup",
  "Double Wall Paper Cup",
  "Ripple Paper Cup",
];

const GROUP_BLURB = {
  "Single Wall Paper Cup":
    "One coated paper-board wall. The economical workhorse — cold drinks, water, and short-hold hot beverages.",
  "Double Wall Paper Cup":
    "An insulating air-gap second wall — comfortable to hold hot with no sleeve. The premium café cup.",
  "Ripple Paper Cup":
    "A fluted corrugated outer wall for maximum insulation and grip, in natural brown kraft.",
};

const SHORT_CODE = {
  "Single Wall Paper Cup": "SW",
  "Double Wall Paper Cup": "DW",
  "Ripple Paper Cup": "Ripple",
};

export async function fetchPaperCups() {
  const [products, pricing] = await Promise.all([
    dbSelect("master_products", {
      select:
        "id,sku,product_name,sub_category,size_volume,material,gsm,inner_wall_gsm,outer_wall_gsm,colour,units_per_case,carton_dimensions,item_weight_g,gst_percent",
      filter: { category: "eq.Paper Cups" },
      order: "sku.asc",
    }),
    dbSelect("master_product_pricing", {
      select: "product_id,min_qty,price_inr,offering_type",
      filter: { offering_type: "in.(plain,generic_printed)" },
    }),
  ]);

  // Index products by id + sku so we can pair a base cup with its "-CUST" twin.
  const idBySku = new Map();
  const idSet = new Set();
  for (const p of products) {
    idBySku.set(p.sku, p.id);
    idSet.add(p.id);
  }

  // Collect priced slabs per product, split by offering type.
  const plainByProduct = new Map();
  const printedByProduct = new Map();
  for (const p of pricing) {
    if (p.price_inr == null || !idSet.has(p.product_id)) continue;
    const bucket = p.offering_type === "plain" ? plainByProduct : printedByProduct;
    const list = bucket.get(p.product_id) || [];
    list.push({ minQty: p.min_qty != null ? Number(p.min_qty) : 0, priceInr: Number(p.price_inr) });
    bucket.set(p.product_id, list);
  }

  const groups = new Map();
  let plainPriced = 0;
  let printedPriced = 0;

  for (const c of products) {
    if (/-CUST$/i.test(c.sku)) continue; // -CUST twins fold into their base below

    const plainSlabs = plainByProduct.get(c.id) || [];
    // Printed pricing lives on the paired "-CUST" SKU (and, defensively, on the
    // base row itself if it ever carries a generic_printed offering).
    const twinId = idBySku.get(`${c.sku}-CUST`);
    const printedSlabs = [
      ...(printedByProduct.get(c.id) || []),
      ...(twinId ? printedByProduct.get(twinId) || [] : []),
    ];

    const plain = shapeOffering(plainSlabs);
    const printed = shapeOffering(printedSlabs);
    if (plain.entry) plainPriced += 1;
    if (printed.entry) printedPriced += 1;

    // Layer the India DDP price onto every slab (entry/best share these object
    // refs, so they pick it up too). Null where there's no weight to freight.
    const weightG = c.item_weight_g != null ? Number(c.item_weight_g) : null;
    const gstPct = c.gst_percent;
    for (const s of [...plain.slabs, ...printed.slabs]) {
      s.ddpInr = ddpOf(s.priceInr, weightG, gstPct);
    }

    // Show the laminated "wider" GSM: board weight + the food-contact coating.
    // The coating sits on the inner/food-contact face only, so single-wall cups
    // add it to their one board and double-wall/ripple add it to the inner wall
    // — the outer (insulating) wall stays bare board.
    const lining = liningOf(c.sku, c.material);
    const coat = COATING_GSM[lining] || 0;
    const addCoat = (v) => (v != null ? Number(v) + coat : null);

    const row = {
      sku: c.sku,
      name: cleanName(c.product_name),
      volume: volumeOf(c.size_volume),
      oz: ozOf(c.size_volume),
      size: c.size_volume,
      material: c.material,
      gsm: addCoat(c.gsm),
      innerGsm: addCoat(c.inner_wall_gsm),
      outerGsm: c.outer_wall_gsm != null ? Number(c.outer_wall_gsm) : null,
      colour: c.colour,
      casePack: c.units_per_case,
      cbm: cbmOf(c.carton_dimensions), // m³ per shipping carton
      cartonDims: c.carton_dimensions || null,
      lining,
      finish: finishOf(c.colour),
      // Individually-wrapped cups, flagged in the name or size/spec text.
      wrapped: /wrap/i.test(c.product_name || "") || /wrap/i.test(c.size_volume || ""),
      plain,
      printed,
    };
    const key = c.sub_category || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const ordered = [...GROUP_ORDER, ...[...groups.keys()].filter((k) => !GROUP_ORDER.includes(k))];
  const sections = ordered
    .filter((k) => groups.has(k))
    .map((k) => ({
      key: k,
      label: k,
      code: SHORT_CODE[k] || k,
      blurb: GROUP_BLURB[k] || null,
      rows: groups.get(k).sort(rowSort),
    }));

  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  return { sections, total, plainPriced, printedPriced };
}

// Sort slabs ascending by qty and surface the entry (lowest qty / highest
// price) and best (highest qty / lowest price) breaks.
function shapeOffering(slabs) {
  const sorted = [...slabs].sort((a, b) => a.minQty - b.minQty);
  return {
    slabs: sorted,
    entry: sorted[0] || null,
    best: sorted[sorted.length - 1] || null,
  };
}

// Carton volume in m³ from the "L × W × H" (mm) carton_dimensions text. Handles
// both "395 × 362 × 451" and "640 x 400 x 570 mm". null if unparseable.
function cbmOf(cartonDims) {
  if (!cartonDims) return null;
  const nums = String(cartonDims).match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  const [l, w, h] = nums.slice(0, 3).map(Number);
  if (!l || !w || !h) return null;
  return (l * w * h) / 1e9; // mm³ → m³
}

// "10oz | 90 x 60 x 96 mm (TD x BD x H)" → "10oz"
// "250 ml / 8 oz | 80 x 56 x 95 mm ..."   → "250 ml / 8 oz"
function volumeOf(size) {
  if (!size) return null;
  const head = size.split("|")[0].trim();
  return head || null;
}

// Pull the oz capacity out of a size/volume label for filtering — cups are
// universally referenced by oz. "250 ml / 8 oz | …" → 8, "10oz / 360ml" → 10.
function ozOf(size) {
  if (!size) return null;
  const m = String(size).match(/(\d+)\s*oz/i);
  return m ? Number(m[1]) : null;
}

// Reduce a raw product name to just its meaningful shape/style descriptor.
// Volume, wall type, lining (PE/Aqueous/PLA) and finish (White/Brown kraft)
// already have their own columns, so anything that merely repeats them is
// stripped — including when it's buried inside a "(…)" suffix. What survives
// is the genuinely distinguishing bit (Squat, Tall, Deluxe, Wide, Wrapped, SB,
// a "90mm TD" spec, …). Plain cups with no descriptor return "" (blank cell).
function cleanName(name) {
  if (!name) return "";
  // Tokens that duplicate other columns and should never appear in the name.
  const DROP =
    /^(aqueous|pla|pe|brown\s*kraft|kraft|white|standard|custom(\s*print)?|single\s*wall|double\s*wall|ripple|normal|printed|paper\s*cup)$/i;
  let s = name
    .replace(/\b\d+\s?oz\b/gi, "")
    .replace(/\b\d+\s?ml\b/gi, "")
    .replace(/\b(Single|Double)\s+Wall\b/gi, "")
    .replace(/\bRipple\b/gi, "")
    .replace(/\bNormal\b/gi, "")
    .replace(/\bPrinted\b/gi, "")
    .replace(/\bPaper\s+Cup\b/gi, "");
  // Re-process each "(…)" group: keep only comma-parts that aren't redundant,
  // and drop the parentheses entirely if nothing meaningful is left.
  s = s.replace(/\(([^)]*)\)/g, (_, inner) => {
    const kept = inner
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && !DROP.test(t));
    return kept.length ? `(${kept.join(", ")})` : "";
  });
  // Strip redundant coating/colour tokens sitting bare in the name.
  s = s
    .replace(/\b(Aqueous|PLA|PE|Brown\s+Kraft|Kraft|White|Custom\s*Print)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/^[\s,;—-]+|[\s,;—-]+$/g, "")
    .trim();
  // If the whole descriptor is one parenthetical, drop the now-pointless wrap.
  const sole = s.match(/^\(([^()]*)\)$/);
  return sole ? sole[1].trim() : s;
}

// Lining is encoded in the SKU suffix (-AQ aqueous, -PLA compostable) with PE
// the default. "Aqueous" and "PLA" are recyclable/compostable coatings.
function liningOf(sku, material) {
  if (/-PLA\b/i.test(sku)) return "PLA";
  if (/-AQ\b/i.test(sku)) return "Aqueous";
  if (/\bPLA\b/i.test(material || "")) return "PLA";
  return "PE";
}

function finishOf(colour) {
  if (!colour) return "White";
  if (/brown/i.test(colour)) return "Brown kraft";
  if (/custom/i.test(colour)) return "Custom";
  return "White";
}

// Sort within a wall group: by volume (ascending), then SKU.
function rowSort(a, b) {
  const va = volumeNumber(a.volume);
  const vb = volumeNumber(b.volume);
  if (va != null && vb != null && va !== vb) return va - vb;
  return a.sku.localeCompare(b.sku, undefined, { numeric: true });
}

// Pull a comparable capacity (in ml) out of a volume label, normalising oz.
function volumeNumber(vol) {
  if (!vol) return null;
  const ml = vol.match(/(\d+)\s?ml/i);
  if (ml) return Number(ml[1]);
  const oz = vol.match(/(\d+)\s?oz/i);
  if (oz) return Number(oz[1]) * 30; // ~30ml/oz, good enough for ordering
  return null;
}
