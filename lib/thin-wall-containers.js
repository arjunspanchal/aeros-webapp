// Public PP Thin-Wall Containers rate sheet data. Reads `master_products`
// (category = "Thin Wall Containers") — the injection-moulded polypropylene
// container range benchmarked on the Glen line: round & rectangular
// containers, compartment meal trays & thalis, bowls, buckets, lockable
// tamper-evident tubs, sauce cups, sweet boxes and standalone dome lids.
//
// Every item ships as a SET (container base + matching clear lid) and is
// stocked in two base colours — Clear and Black — as separate SKUs suffixed
// `-C` / `-B` at the SAME price. This loader MERGES each colour twin into one
// spec row that carries a colour-availability list, so the sheet lists one row
// per size with a Clear / Black filter (mirrors the Clear/Frosted split on the
// PP cup sheet).
//
// Injection-moulded PP takes no print (like the PP/PET lids) — the range is
// PLAIN only, single MOQ price per item (no quantity ladder, no custom-branded
// twin). Rates come straight from `master_product_pricing.price_inr` (EXW
// India, per piece), matching the take-out container sheet.

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only — matches the other sheets.
export const USD_PER_INR_DIVISOR = 95;

// ── Groups ───────────────────────────────────────────────────────────────────
const GROUP_ORDER = [
  "Round",
  "Rectangular - Light Duty",
  "Rectangular - Medium Duty",
  "Compartment",
  "Compartment Thali",
  "Bowl",
  "Bucket",
  "Lockable",
  "Sauce Cup",
  "Sweet Box",
  "Dome Lid",
];

const GROUP_LABEL = {
  Round: "Round Containers",
  "Rectangular - Light Duty": "Rectangular — Light Duty",
  "Rectangular - Medium Duty": "Rectangular — Medium Duty",
  Compartment: "Compartment Meal Trays",
  "Compartment Thali": "Compartment Thalis",
  Bowl: "Bowls",
  Bucket: "Buckets",
  Lockable: "Lockable (Tamper-Evident)",
  "Sauce Cup": "Sauce Cups",
  "Sweet Box": "Sweet Boxes",
  "Dome Lid": "Dome Lids",
};

const SHORT_CODE = {
  Round: "Round",
  "Rectangular - Light Duty": "Rect. Light",
  "Rectangular - Medium Duty": "Rect. Medium",
  Compartment: "Compartment",
  "Compartment Thali": "Thali",
  Bowl: "Bowls",
  Bucket: "Buckets",
  Lockable: "Lockable",
  "Sauce Cup": "Sauce",
  "Sweet Box": "Sweet Box",
  "Dome Lid": "Dome Lid",
};

const GROUP_BLURB = {
  Round:
    "Round PP containers with snap-fit clear lids — soups, curries, gravies, dips and deli. Freezer-to-microwave, leak-resistant.",
  "Rectangular - Light Duty":
    "Lighter-gauge rectangular containers for dry meals, salads and takeaway portions — economical, stackable, clear-lidded.",
  "Rectangular - Medium Duty":
    "Heavier-gauge rectangular containers for saucy mains, curries and reheatable meals — sturdier wall, secure clear lid.",
  Compartment:
    "Multi-compartment trays that keep mains and sides separate — bento, thali and combo meals. Clear lid included.",
  "Compartment Thali":
    "Round sectioned thali trays (3–5 compartments) for full plated meals — dine-in feel, delivery-ready.",
  Bowl:
    "Deep round bowls with clear domed/flat lids — biryani, poke, salad and rice bowls.",
  Bucket:
    "Tall bucket-style tubs for bulk gravies, batters, dairy and family packs — high volume, secure lid.",
  Lockable:
    "Tamper-evident lockable containers — the lid clips shut with a break-tab seal for delivery integrity.",
  "Sauce Cup":
    "Small portion / sauce cups with clear lids — chutneys, dips, dressings and condiments.",
  "Sweet Box":
    "Presentation sweet boxes for mithai, desserts and gifting — clear lid shows the contents.",
  "Dome Lid":
    "Standalone clear dome lids for extra headroom over the container range — sold separately.",
};

// Base colour → friendly label. Lid is always clear across the range.
const COLOUR_LABEL = { C: "Clear", B: "Black" };
const COLOUR_ORDER = ["Clear", "Black"];

export async function fetchThinWallContainers() {
  const products = await dbSelect("master_products", {
    select:
      "id,sku,product_name,category,sub_category,size_volume,material,colour,units_per_case,country_of_origin,item_weight_g",
    filter: { category: "eq.Thin Wall Containers", sold_loose: "is.true" },
    order: "sku.asc",
  });
  if (products.length === 0)
    return { sections: [], total: 0, priced: 0, colourCount: 0 };

  const ids = products.map((p) => p.id);
  // Plain, single-MOQ pricing (EXW India per piece). No custom-branded twin —
  // injection-moulded PP is plain only.
  const pricing = await dbSelect("master_product_pricing", {
    select: "product_id,min_qty,price_inr,offering_type",
    filter: { product_id: `in.(${ids.join(",")})`, offering_type: "eq.plain" },
  });
  const slabByProduct = new Map();
  for (const p of pricing) {
    if (p.price_inr == null) continue; // null-priced = on request
    const list = slabByProduct.get(p.product_id) || [];
    list.push({ minQty: p.min_qty != null ? Number(p.min_qty) : 0, priceInr: Number(p.price_inr) });
    slabByProduct.set(p.product_id, list);
  }

  // Merge the Clear (-C) / Black (-B) colour twins into one spec row keyed on
  // the base SKU. Prefer the Clear twin as the canonical record for name/size;
  // collect the colours actually available (and priced).
  const byBase = new Map(); // baseSku -> { canonical, colours:Set, price, casePack, minQty }
  for (const item of products) {
    const m = item.sku.match(/^(.*?)-([BC])$/);
    const baseSku = m ? m[1] : item.sku;
    const colour = m ? COLOUR_LABEL[m[2]] : null;
    const slabs = slabByProduct.get(item.id) || [];
    const entry = slabs.sort((a, b) => a.minQty - b.minQty)[0] || null;

    const rec = byBase.get(baseSku) || {
      baseSku,
      canonical: item,
      isClear: m?.[2] === "C",
      colours: new Map(), // colour -> { sku, priceInr, minQty }
    };
    // Prefer the clear twin as the display canonical (frosted-vs-clear parallel).
    if (m?.[2] === "C" || (!rec.isClear && !m)) {
      rec.canonical = item;
      rec.isClear = true;
    }
    if (colour && entry) rec.colours.set(colour, { sku: item.sku, priceInr: entry.priceInr, minQty: entry.minQty });
    else if (!colour && entry) rec.colours.set("—", { sku: item.sku, priceInr: entry.priceInr, minQty: entry.minQty });
    byBase.set(baseSku, rec);
  }

  const groups = new Map();
  let priced = 0;
  for (const rec of byBase.values()) {
    const item = rec.canonical;
    const colours = COLOUR_ORDER.filter((c) => rec.colours.has(c));
    // Any priced twin drives the row price (they're identical across colours).
    const anyPriced = [...rec.colours.values()][0] || null;
    if (anyPriced) priced += 1;

    const row = {
      sku: rec.baseSku,
      name: cleanName(item.product_name),
      volume: capacityOf(item.size_volume),
      size: dimsOf(item.size_volume),
      colours, // e.g. ["Clear","Black"]
      casePack: item.units_per_case,
      weightG: item.item_weight_g != null ? Number(item.item_weight_g) : null,
      origin: item.country_of_origin || null,
      sortVal: volumeNumber(capacityOf(item.size_volume)),
      // Single-slab offering, shaped like the other sheets for the shared table.
      plain: {
        slabs: anyPriced ? [{ minQty: anyPriced.minQty, priceInr: anyPriced.priceInr }] : [],
        entry: anyPriced ? { minQty: anyPriced.minQty, priceInr: anyPriced.priceInr } : null,
        best: anyPriced ? { minQty: anyPriced.minQty, priceInr: anyPriced.priceInr } : null,
      },
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
      code: SHORT_CODE[k] || k,
      blurb: GROUP_BLURB[k] || null,
      isLid: k === "Dome Lid",
      rows: groups.get(k).sort(rowSort),
    }));

  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const colourCount = COLOUR_ORDER.length;
  return { sections, total, priced, colourCount };
}

// Capacity / lead descriptor — the part before the "|": "650ml", "500ml / 2
// comp", "3 CP". Normalise "500 ml" → "500ml" for consistency.
function capacityOf(size) {
  if (!size) return null;
  const head = size.split("|")[0].trim().replace(/(\d)\s+ml\b/gi, "$1ml");
  return head || null;
}

// Dimensions tail after the "|", unless it's the "dims pending" placeholder.
function dimsOf(size) {
  if (!size || !size.includes("|")) return null;
  const tail = size.split("|").slice(1).join("|").trim();
  if (!tail || /dims?\s+pending/i.test(tail)) return null;
  return tail;
}

// Reduce a raw product name to its distinguishing descriptor. Capacity, shape,
// compartment count, "Container", "Set", colour and internal refs all have
// their own columns (or don't belong on a public sheet), so they're stripped.
// What survives is the useful bit — "Light", "Flat", "Domed Lid", "Insert",
// "Meal". Items with no extra descriptor return "".
function cleanName(name) {
  if (!name) return "";
  let s = name
    .replace(/\([^)]*\)/g, "") // drop "(Set, Black)", "(R32)", "(Clear)" etc.
    .replace(/\b\d+(?:\.\d+)?\s?ml\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s?oz\b/gi, "")
    .replace(/\b\d+(?:\/\d+)?\s?mm\b/gi, "")
    // "2-Compartment" / "3 Compartment" — count is already in the capacity cell.
    .replace(/\b\d+\s*-?\s*Compartment\b/gi, "")
    .replace(/\bContainers?\b/gi, "")
    .replace(/\bRound\b/gi, "")
    .replace(/\bRectangular\b/gi, "")
    .replace(/\bCompartment\b/gi, "")
    .replace(/\bThali\b/gi, "")
    .replace(/\bBowls?\b/gi, "")
    .replace(/\bBuckets?\b/gi, "")
    .replace(/\bLockable\b/gi, "")
    .replace(/\bSauce\b/gi, "")
    .replace(/\bSweet\b/gi, "")
    .replace(/\bBox\b/gi, "")
    .replace(/\bPP\b/gi, "")
    .replace(/\bSet\b/gi, "")
    .replace(/\bClear\b/gi, "")
    .replace(/\bBlack\b/gi, "")
    .replace(/\b\d+\b/g, ""); // strip any stray leftover numbers
  s = s
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;—/+-]+|[\s,;—/+-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return s;
}

// Sort within a group: by capacity (ascending), then SKU.
function rowSort(a, b) {
  if (a.sortVal != null && b.sortVal != null && a.sortVal !== b.sortVal) return a.sortVal - b.sortVal;
  return a.sku.localeCompare(b.sku, undefined, { numeric: true });
}

// Comparable capacity (ml) from a label, normalising oz. "3 CP" → null (sorts last).
function volumeNumber(vol) {
  if (!vol) return null;
  const ml = vol.match(/(\d+)\s?ml/i);
  if (ml) return Number(ml[1]);
  const oz = vol.match(/(\d+)\s?oz/i);
  if (oz) return Number(oz[1]) * 30;
  return null;
}
