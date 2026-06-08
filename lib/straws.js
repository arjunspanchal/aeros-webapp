// Public straw rate sheet data. Reads `master_products` (category = "Straws")
// + the canonical derived view `v_product_pricing`, joins them in JS, and shapes
// a render-ready list grouped by material (Paper / Rice).
//
// Pricing follows the Aeros rulebook (Rev. Jun 2026): the only stored cost is
// `purchase_inr`; every downstream rate is DERIVED in `v_product_pricing` and is
// never hand-stored. We read the two bases straight off that view:
//   • priceInr — `fcl_self_import_inr` = EXW Aeros (purchase × 1.10), the bare
//                FCL / self-import rate a container buyer pays.
//   • ddpInr   — `app_sell_inr` = DDP India delivered = (base + freight) × 1.15
//                × (1 + GST%). Null where not yet costed → "on request".
// A SKU with no `purchase_inr` produces no priced slab and falls through to
// "on request" under both bases (e.g. rice straws until their costs are added).
// Rates are INR only; USD is an indicative display conversion.

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only — matches the other sheets.
export const USD_PER_INR_DIVISOR = 90;

// Group order + friendly section copy. Keyed by the raw `sub_category`.
const GROUP_ORDER = ["Paper", "Rice"];

const GROUP_LABEL = {
  Paper: "Paper Straws",
  Rice: "Rice Straws",
};

const GROUP_CODE = {
  Paper: "Paper",
  Rice: "Rice",
};

const GROUP_BLURB = {
  Paper:
    "Food-grade white paper straws, spiral-wound from FDA-grade paper — sturdy, soda-resistant and home-compostable. Bulk-bagged or individually paper-wrapped. A clean plastic-straw replacement for cold drinks.",
  Rice:
    "Plant-based rice straws extruded from rice flour and tapioca starch — firmer than paper, no sogginess, and edible / fully compostable. Bulk-bagged or individually wrapped.",
};

export async function fetchStraws() {
  const products = await dbSelect("master_products", {
    select:
      "id,sku,product_name,category,sub_category,size_volume,material,colour,units_per_case,country_of_origin",
    filter: { category: "eq.Straws" },
    order: "sku.asc",
  });
  if (products.length === 0) return { sections: [], total: 0, plainPriced: 0 };

  const ids = products.map((p) => p.id);
  const pricing = await dbSelect("v_product_pricing", {
    select: "product_id,min_qty,fcl_self_import_inr,app_sell_inr,offering_type",
    filter: {
      product_id: `in.(${ids.join(",")})`,
      offering_type: "eq.plain",
    },
  });

  // Collect derived slabs per product. priceInr is the EXW Aeros / FCL rate
  // (purchase × 1.10); ddpInr is the DDP India delivered rate (null where the
  // SKU has no purchase cost yet → "on request").
  const plainByProduct = new Map();
  for (const p of pricing) {
    if (p.fcl_self_import_inr == null) continue; // no purchase cost → on request
    const list = plainByProduct.get(p.product_id) || [];
    list.push({
      minQty: p.min_qty != null ? Number(p.min_qty) : 0,
      priceInr: Number(p.fcl_self_import_inr),
      ddpInr: p.app_sell_inr != null ? Number(p.app_sell_inr) : null,
    });
    plainByProduct.set(p.product_id, list);
  }

  const groups = new Map();
  let plainPriced = 0;

  for (const item of products) {
    const plain = shapeOffering(plainByProduct.get(item.id) || []);
    if (plain.entry) plainPriced += 1;

    const bore = boreOf(item.size_volume);
    const row = {
      sku: item.sku,
      name: cleanName(item.product_name),
      wrapped: isWrapped(item.product_name),
      bore, // bore diameter in mm, e.g. 6, 6.5, 8, 10, 12, 13
      length: lengthOf(item.size_volume), // display string, e.g. "8\"", "20 cm"
      size: item.size_volume,
      material: item.material || null,
      origin: item.country_of_origin || null,
      casePack: item.units_per_case,
      sortVal: bore,
      lengthVal: lengthMm(item.size_volume),
      plain,
    };
    const key = item.sub_category || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const ordered = [
    ...GROUP_ORDER,
    ...[...groups.keys()].filter((k) => !GROUP_ORDER.includes(k)),
  ];
  const sections = ordered
    .filter((k) => groups.has(k))
    .map((k) => ({
      key: k,
      label: GROUP_LABEL[k] || k,
      code: GROUP_CODE[k] || k,
      blurb: GROUP_BLURB[k] || null,
      rows: groups.get(k).sort(rowSort),
    }));

  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  return { sections, total, plainPriced };
}

// Sort slabs ascending by qty and surface the entry (lowest qty / highest
// price) and best (highest qty / lowest price) breaks. Straws carry a single
// slab today, but the shape matches the other sheets for a shared browser.
function shapeOffering(slabs) {
  const sorted = [...slabs].sort((a, b) => a.minQty - b.minQty);
  return {
    slabs: sorted,
    entry: sorted[0] || null,
    best: sorted[sorted.length - 1] || null,
  };
}

// True when the product is the individually-wrapped variant.
function isWrapped(name) {
  return /individually\s*wrapped|\bwrapped\b/i.test(name || "");
}

// Bore diameter in mm from a size string: "6mm × 8\"" → 6, "6.5mm × 20cm" → 6.5.
function boreOf(size) {
  if (!size) return null;
  const m = String(size).match(/(\d+(?:\.\d+)?)\s*mm/i);
  return m ? Number(m[1]) : null;
}

// Length portion (everything after the "×"), tidied for display:
//   "6mm × 8\""    → "8\""
//   "6.5mm × 20cm" → "20 cm"
function lengthOf(size) {
  if (!size) return null;
  const parts = String(size).split(/[×x]/);
  if (parts.length < 2) return null;
  let tail = parts[1].trim();
  // "20cm" → "20 cm"; leave inch marks ("8\"") as-is.
  tail = tail.replace(/(\d)\s*(cm|mm|m)\b/i, "$1 $2");
  return tail || null;
}

// Length normalised to mm for sorting: 8" → 203, 20cm → 200.
function lengthMm(size) {
  if (!size) return null;
  const parts = String(size).split(/[×x]/);
  if (parts.length < 2) return null;
  const tail = parts[1].trim();
  const cm = tail.match(/(\d+(?:\.\d+)?)\s*cm/i);
  if (cm) return Number(cm[1]) * 10;
  const inch = tail.match(/(\d+(?:\.\d+)?)\s*"/);
  if (inch) return Number(inch[1]) * 25.4;
  const mm = tail.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (mm) return Number(mm[1]);
  return null;
}

// Reduce a raw product name to just its distinguishing descriptor. Bore, length,
// material and the "Straw" word already have their own columns/sections, so they
// are stripped. The wrapped variant keeps a tidy "Individually wrapped" label;
// everything else returns "" (blank cell).
function cleanName(name) {
  if (!name) return "";
  if (isWrapped(name)) return "Individually wrapped";
  let s = name
    .replace(/\b\d+(?:\.\d+)?\s*mm\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*"/g, "")
    .replace(/[×x]/g, "")
    .replace(/\bPaper\b/gi, "")
    .replace(/\bRice\b/gi, "")
    .replace(/\bStraw\b/gi, "");
  s = s
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/^[\s,;—-]+|[\s,;—-]+$/g, "")
    .trim();
  const sole = s.match(/^\(([^()]*)\)$/);
  return sole ? sole[1].trim() : s;
}

// Sort within a group: by bore (ascending), then length, then SKU.
function rowSort(a, b) {
  if (a.sortVal != null && b.sortVal != null && a.sortVal !== b.sortVal) {
    return a.sortVal - b.sortVal;
  }
  if (a.lengthVal != null && b.lengthVal != null && a.lengthVal !== b.lengthVal) {
    return a.lengthVal - b.lengthVal;
  }
  return a.sku.localeCompare(b.sku, undefined, { numeric: true });
}
