// Public paper-cup rate sheet data. Reads `master_products` (category =
// "Paper Cups") + the plain and printed pricing rows from
// `master_product_pricing`, joins them in JS, and shapes a render-ready list
// grouped by cup wall type (Single Wall, Double Wall, Ripple).
//
// Each base cup carries TWO quantity ladders so the page can toggle between
// them:
//   • plain   — unprinted cup, plain offering, breaks 25k…500k.
//   • printed — single-colour custom print, taken from the paired "-CUST"
//               SKU's generic_printed offering, breaks from 5k…500k.
// Bulk oz cups break by volume; the unit rate drops as quantity rises.
// Rates are EXW India, INR only.

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only — matches the paper-bag sheet.
export const USD_PER_INR_DIVISOR = 90;

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
        "id,sku,product_name,sub_category,size_volume,material,gsm,inner_wall_gsm,outer_wall_gsm,colour,units_per_case",
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

    const row = {
      sku: c.sku,
      name: cleanName(c.product_name),
      volume: volumeOf(c.size_volume),
      size: c.size_volume,
      material: c.material,
      gsm: c.gsm != null ? Number(c.gsm) : null,
      innerGsm: c.inner_wall_gsm != null ? Number(c.inner_wall_gsm) : null,
      outerGsm: c.outer_wall_gsm != null ? Number(c.outer_wall_gsm) : null,
      colour: c.colour,
      casePack: c.units_per_case,
      lining: liningOf(c.sku, c.material),
      finish: finishOf(c.colour),
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

// "10oz | 90 x 60 x 96 mm (TD x BD x H)" → "10oz"
// "250 ml / 8 oz | 80 x 56 x 95 mm ..."   → "250 ml / 8 oz"
function volumeOf(size) {
  if (!size) return null;
  const head = size.split("|")[0].trim();
  return head || null;
}

// Strip the redundant volume prefix and the "Paper Cup" boilerplate from the
// product name — the table shows volume and wall type in their own columns.
// Keeps the meaningful descriptor (Brown Kraft, Aqueous, Squat, Tall, …).
function cleanName(name) {
  if (!name) return "";
  let s = name
    .replace(/\b\d+\s?oz\b/gi, "")
    .replace(/\b\d+\s?ml\b/gi, "")
    .replace(/\b(Single|Double)\s+Wall\b/gi, "")
    .replace(/\bRipple\b/gi, "")
    .replace(/\bNormal\b/gi, "")
    .replace(/\bPaper Cup\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s—-]+|[\s—-]+$/g, "")
    .trim();
  return s || "Standard";
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
