// Public bagasse-tableware rate sheet data. Reads `master_products`
// (category = "Bagasse Tableware") + the canonical derived view
// `v_product_pricing`, joins them in JS, and shapes a render-ready list grouped
// by product form (plates, bowls, clamshells, cups, lids, cutlery).
//
// Pricing follows the Aeros rulebook: the only stored cost is `purchase_inr`;
// every downstream rate is DERIVED in `v_product_pricing` and never hand-stored.
// We read the two bases straight off that view:
//   • priceInr — `fcl_self_import_inr` = EXW Aeros (purchase × 1.10), the bare
//                FCL / self-import rate a container buyer pays.
//   • ddpInr   — `app_sell_inr` = DDP India delivered = (base + freight) × 1.15
//                × (1 + GST%). Null where not yet costed → "on request".
// Bagasse is a plain, single-MOQ line — no quantity ladder — so each row carries
// one slab. Rates are INR only; USD is an indicative display conversion.

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only — matches the other sheets.
export const USD_PER_INR_DIVISOR = 95;

// Group order + friendly section copy. Keyed by the raw `sub_category`.
const GROUP_ORDER = [
  "Round Plates",
  "Round Plates with Compartments",
  "Meal & Lunch Plates",
  "Round Bowls",
  "Clamshells",
  "Delivery Containers - Round",
  "Delivery Containers - Rectangular",
  "Soup Bowls",
  "Sauce Cups",
  "Drink Cups",
  "Drink Lids",
  "Container Lids",
  "Beverage Lids",
  "Container + Lid Sets",
  "Cutlery",
];

const GROUP_LABEL = {
  "Round Plates": "Round Plates",
  "Round Plates with Compartments": "Round Plates · Compartments",
  "Meal & Lunch Plates": "Meal & Lunch Plates",
  "Round Bowls": "Round Bowls",
  Clamshells: "Clamshell Takeaway Boxes",
  "Delivery Containers - Round": "Delivery Containers · Round",
  "Delivery Containers - Rectangular": "Delivery Containers · Rectangular",
  "Soup Bowls": "Soup Bowls",
  "Sauce Cups": "Sauce Cups",
  "Drink Cups": "Drink Cups",
  "Drink Lids": "Drink Lids",
  "Container Lids": "Container Lids",
  "Beverage Lids": "Beverage Lids",
  "Container + Lid Sets": "Container + Lid Sets",
  Cutlery: "Cutlery",
};

// Short chip codes for the type filter.
const GROUP_CODE = {
  "Round Plates": "Plates",
  "Round Plates with Compartments": "CP Plates",
  "Meal & Lunch Plates": "Meal Trays",
  "Round Bowls": "Bowls",
  Clamshells: "Clamshells",
  "Delivery Containers - Round": "Round Tubs",
  "Delivery Containers - Rectangular": "Rect Tubs",
  "Soup Bowls": "Soup",
  "Sauce Cups": "Sauce",
  "Drink Cups": "Cups",
  "Drink Lids": "Lids",
  "Container Lids": "Cont. Lids",
  "Beverage Lids": "Bev Lids",
  "Container + Lid Sets": "Sets",
  Cutlery: "Cutlery",
};

const GROUP_BLURB = {
  "Round Plates":
    "Sturdy round dinner plates moulded from sugarcane bagasse — grease- and water-resistant, microwave- and oven-safe to 120 °C. A clean replacement for foam and plastic plates.",
  "Round Plates with Compartments":
    "Sectioned round plates that keep mains, sides and sauces apart — ideal for thalis, canteens and event catering. Same bagasse build: rigid, leak-resistant, home-compostable.",
  "Meal & Lunch Plates":
    "Square and rectangular compartment trays for full meals and lunch service — 2 to 6 sections. Deep wells hold gravies without bleed-through.",
  "Round Bowls":
    "Moulded bagasse bowls for soups, curries, salads and desserts — hot- and cold-safe, sturdy walls, no sogginess.",
  Clamshells:
    "Hinged takeaway boxes in round and rectangular formats, plain or compartmented — snap-shut, leak-resistant and stackable for delivery and QSR.",
  "Drink Cups":
    "Plastic-free moulded cups for hot and cold drinks. Pair with the matching bagasse lids.",
  "Drink Lids":
    "Moulded bagasse lids that fit the matching cups — a fully fibre-based, plastic-free cup-and-lid set.",
  Cutlery:
    "Compostable bagasse cutlery — spoons, forks, knives and an ice-cream spoon. Heat-tolerant and sturdy, supplied bulk or individually wrapped.",
  "Delivery Containers - Round":
    "Anti-leak round delivery containers (500–1000 ml) — deep, leak-resistant moulded-fibre tubs for hot meals and gravies. Pair with the matching round lids.",
  "Delivery Containers - Rectangular":
    "Anti-leak rectangular delivery containers (500–1000 ml) — leak-resistant moulded-fibre boxes for meals and curries. Pair with the matching rectangular lids.",
  "Soup Bowls":
    "Hexagon deep soup bowl (500 ml) for soups, curries and hot liquids; matching lid available.",
  "Sauce Cups":
    "Small 2 oz (60 ml) moulded-fibre sauce / portion cups with lids — for dips, chutneys and dressings.",
  "Container Lids":
    "Moulded-fibre lids for the delivery containers, sauce cup and soup bowl. Sold to match each base size.",
  "Beverage Lids":
    "Plastic-free moulded-fibre lids for hot & cold drink cups — re-closable flip and flat straw-cut, Ø80 / Ø90 mm.",
  "Container + Lid Sets":
    "Container + matching lid supplied together as a set — the convenient combo for delivery and takeaway.",
};

export async function fetchBagasse() {
  const products = await dbSelect("master_products", {
    select:
      "id,sku,product_name,category,sub_category,size_volume,material,colour,units_per_case,country_of_origin",
    filter: { category: "eq.Bagasse Tableware" },
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

    const row = {
      sku: item.sku,
      name: cleanName(item.product_name),
      size: item.size_volume || null,
      compartments: compartmentsOf(item.product_name),
      material: item.material || null,
      origin: item.country_of_origin || null,
      casePack: item.units_per_case,
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
// price) and best (highest qty / lowest price) breaks. Bagasse carries a single
// slab today, but the shape matches the other sheets for a shared browser.
function shapeOffering(slabs) {
  const sorted = [...slabs].sort((a, b) => a.minQty - b.minQty);
  return {
    slabs: sorted,
    entry: sorted[0] || null,
    best: sorted[sorted.length - 1] || null,
  };
}

// Compartment count from a name like "… · 3-Compartment", else null.
function compartmentsOf(name) {
  const m = String(name || "").match(/(\d+)\s*-?\s*compartment/i);
  return m ? Number(m[1]) : null;
}

// Reduce a raw product name to its distinguishing descriptor. "Bagasse" is the
// whole sheet, so drop it; the form section + size column carry the rest.
//   "6\" Bagasse Round Plate"                → "6\" Round Plate"
//   "Bagasse Spoon"                          → "Spoon"
//   "9x6x3 Bagasse Clamshell (Rectangular)"  → "9x6x3 Clamshell (Rectangular)"
function cleanName(name) {
  if (!name) return "";
  return String(name)
    .replace(/\bBagasse\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;·—-]+|[\s,;·—-]+$/g, "")
    .trim();
}

// Sort within a group by SKU, numeric-aware (PLT-001 < PLT-010). SKUs are
// assigned in ascending size order, so this also sorts by size.
function rowSort(a, b) {
  return a.sku.localeCompare(b.sku, undefined, { numeric: true });
}
