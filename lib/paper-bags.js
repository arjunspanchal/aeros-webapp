// Public paper-bag rate sheet data. Reads `master_products` (category =
// "Paper Bags") + the plain-offering rows from `master_product_pricing`,
// joins them in JS, and shapes a render-ready list grouped by bag type.
//
// Rates in the DB are EXW India, per piece, INR only (USD column is empty,
// so the page converts at an indicative rate). Bags with no plain-pricing
// row surface as "On request".

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only. Matches the calculator's
// USD_RATE constant; the page labels the USD column as indicative.
export const USD_PER_INR_DIVISOR = 90;

// Group order + friendly section copy. Keyed by the raw `sub_category`.
const GROUP_ORDER = [
  "SOS (Self-Opening Sack)",
  "PTH (Paper Twisted Handle)",
  "FHB (Flat Handle Bag)",
  "LIQ (Liquor/Bottle Bag)",
];

const GROUP_BLURB = {
  "SOS (Self-Opening Sack)":
    "Flat-bottom grocery & takeaway sacks. No handle. Sizes by US pound rating.",
  "PTH (Paper Twisted Handle)":
    "Twisted paper-handle carry bags — retail, boutique and takeaway.",
  "FHB (Flat Handle Bag)":
    "Flat paper-patti handle bags.",
  "LIQ (Liquor/Bottle Bag)":
    "Tall narrow bottle/liquor bags.",
};

export async function fetchPaperBags() {
  const [bags, pricing] = await Promise.all([
    dbSelect("master_products", {
      select:
        "id,sku,product_name,sub_category,size_volume,material,gsm,colour,units_per_case",
      filter: { category: "eq.Paper Bags" },
      order: "sku.asc",
    }),
    dbSelect("master_product_pricing", {
      select: "product_id,min_qty,price_inr,incoterm",
      filter: { offering_type: "eq.plain" },
    }),
  ]);

  // One plain price per bag (these are single-break EXW rows). Index by
  // product_id; keep the lowest min_qty row if more than one ever appears.
  const priceByProduct = new Map();
  for (const p of pricing) {
    const prev = priceByProduct.get(p.product_id);
    if (!prev || (p.min_qty ?? 0) < (prev.min_qty ?? 0)) {
      priceByProduct.set(p.product_id, p);
    }
  }

  const groups = new Map();
  for (const b of bags) {
    const price = priceByProduct.get(b.id) || null;
    const inr = price?.price_inr != null ? Number(price.price_inr) : null;
    const row = {
      sku: b.sku,
      name: cleanName(b.product_name, b.sku),
      size: b.size_volume,
      material: b.material,
      gsm: b.gsm != null ? Number(b.gsm) : null,
      colour: b.colour,
      casePack: b.units_per_case,
      minQty: price?.min_qty ?? null,
      incoterm: price?.incoterm ?? null,
      priceInr: inr,
      priceUsd: inr != null ? inr / USD_PER_INR_DIVISOR : null,
    };
    const key = b.sub_category || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const ordered = [...GROUP_ORDER, ...[...groups.keys()].filter((k) => !GROUP_ORDER.includes(k))];
  const sections = ordered
    .filter((k) => groups.has(k))
    .map((k) => ({
      key: k,
      label: k,
      blurb: GROUP_BLURB[k] || null,
      rows: groups.get(k).sort(skuSort),
    }));

  const total = bags.length;
  const priced = bags.filter((b) => priceByProduct.has(b.id)).length;
  return { sections, total, priced };
}

// Strip the redundant dimension/gsm tail the SKU name carries — the table
// shows size + GSM in their own columns. Keep the human prefix (e.g.
// "#6 LB SOS", "BISTRO TH Bag").
function cleanName(name, sku) {
  if (!name) return sku;
  // Drop a trailing "<WxGxH> <gsm>gsm" pattern and any "(W x G x H)" noise.
  return name
    .replace(/\b\d{2,4}x\d{2,4}x\d{2,4}\b/gi, "")
    .replace(/\b\d{2,3}\s?gsm\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function skuSort(a, b) {
  return a.sku.localeCompare(b.sku, undefined, { numeric: true });
}
