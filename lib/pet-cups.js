// Public PET cup & lid rate sheet data. Reads `master_products` (category =
// "PET Cups", plus the PET sub-categories of "Lids") + the plain and
// custom-branded pricing rows from `master_product_pricing`, joins them in JS,
// and shapes a render-ready list grouped by item type (PET Cup, Dome / Flat /
// Sipper PET Lid).
//
// Each base item carries TWO quantity ladders so the page can toggle between
// them:
//   • plain    — unprinted item. Cups: single MOQ slab. Lids: single MOQ slab.
//   • printed  — custom-branded print, taken from the same SKU's
//                `custom_branded` offering (cups break 1k…100k). Lids are
//                supplied clear/plain and have no printed offering — they fall
//                through to "on request" under the customised toggle.
// Rates are EXW India, INR only. PET is crystal-clear thermoformed plastic —
// no board GSM, no kraft finish, no PE/PLA lining.

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only — matches the paper sheets.
export const USD_PER_INR_DIVISOR = 90;

// Group order + friendly section copy. Keyed by the raw `sub_category`.
const GROUP_ORDER = ["PET Cup", "Dome PET Lid", "Flat PET Lid", "Sipper PET Lid"];

const GROUP_LABEL = {
  "PET Cup": "PET Cups",
  "Dome PET Lid": "Dome Lids",
  "Flat PET Lid": "Flat Lids",
  "Sipper PET Lid": "Sipper Lids",
};

const GROUP_BLURB = {
  "PET Cup":
    "Crystal-clear, rigid thermoformed PET cold cups with glass-like clarity — juices, iced coffee, smoothies, cold brew and soft drinks. Custom-brand them or buy plain.",
  "Dome PET Lid":
    "Raised dome lids that clear whipped toppings, garnishes and straws. Clear PET, supplied plain.",
  "Flat PET Lid":
    "Flat lids in straw-cut and solid options for cups and square containers. Clear PET, supplied plain.",
  "Sipper PET Lid":
    "Flat sipper lids with a raised drink spout — sip straight from the lid, no straw needed. Clear PET, supplied plain.",
};

const SHORT_CODE = {
  "PET Cup": "Cups",
  "Dome PET Lid": "Dome",
  "Flat PET Lid": "Flat",
  "Sipper PET Lid": "Sipper",
};

const PET_LID_GROUPS = new Set(["Dome PET Lid", "Flat PET Lid", "Sipper PET Lid"]);

// PET cups come in a range of top diameters — Ø92/Ø98 (India, Oracle) and the
// Jingyu (China) catalogue's Ø74/78/89/93/95/98/107/117 — so only round lids of
// the matching rim diameters belong here. Square lids and the legacy off-size
// rounds (62/75/80/85/87/90/148mm) are other cup lines, and 72/73mm lids are the
// ICT range, not PET. We filter lids to these rim diameters before listing.
const PET_LID_DIAMETERS = new Set([78, 89, 92, 93, 95, 98, 107, 117]);

function isPetCompatibleLid(size) {
  if (!size) return false;
  // Square lids use "x"/"×" dimensions and never seat on a round PET cup.
  if (/[x×]/i.test(String(size))) return false;
  const d = diameterOf(size);
  return d != null && PET_LID_DIAMETERS.has(d);
}

export async function fetchPetCupsAndLids() {
  // Two product reads: the PET cup range, and the PET lids that live under the
  // shared "Lids" category. Merged below.
  const [cups, lids] = await Promise.all([
    dbSelect("master_products", {
      select: "id,sku,product_name,category,sub_category,size_volume,material,colour,units_per_case,country_of_origin,item_weight_g,carton_dimensions",
      filter: { category: "eq.PET Cups" },
      order: "sku.asc",
    }),
    dbSelect("master_products", {
      select: "id,sku,product_name,category,sub_category,size_volume,material,colour,units_per_case,country_of_origin,item_weight_g,carton_dimensions",
      filter: { category: "eq.Lids", sub_category: "like.*PET*" },
      order: "sku.asc",
    }),
  ]);

  const petLids = lids.filter((l) => isPetCompatibleLid(l.size_volume));
  const products = [...cups, ...petLids];
  if (products.length === 0) return { sections: [], total: 0, plainPriced: 0, printedPriced: 0 };

  const ids = products.map((p) => p.id);
  const pricing = await dbSelect("master_product_pricing", {
    select: "product_id,min_qty,price_inr,india_landed_inr,offering_type",
    filter: {
      product_id: `in.(${ids.join(",")})`,
      offering_type: "in.(plain,custom_branded)",
    },
  });

  // Collect priced slabs per product, split by offering type.
  const plainByProduct = new Map();
  const printedByProduct = new Map();
  for (const p of pricing) {
    if (p.price_inr == null) continue; // null-priced rows = on request
    const bucket = p.offering_type === "plain" ? plainByProduct : printedByProduct;
    const list = bucket.get(p.product_id) || [];
    list.push({
      minQty: p.min_qty != null ? Number(p.min_qty) : 0,
      // priceInr is the EXW India (FCL / export) rate; ddpInr is the India
      // delivered duty-paid rate (incl. freight + margin + GST), null where not
      // yet costed → "on request" under the DDP basis.
      priceInr: Number(p.price_inr),
      ddpInr: p.india_landed_inr != null ? Number(p.india_landed_inr) : null,
    });
    bucket.set(p.product_id, list);
  }

  const groups = new Map();
  let plainPriced = 0;
  let printedPriced = 0;

  for (const item of products) {
    const isLid = item.category === "Lids";
    const plain = shapeOffering(plainByProduct.get(item.id) || []);
    const printed = shapeOffering(printedByProduct.get(item.id) || []);
    if (plain.entry) plainPriced += 1;
    if (printed.entry) printedPriced += 1;

    const row = {
      sku: item.sku,
      name: cleanName(item.product_name),
      isLid,
      volume: isLid ? null : volumeOf(item.size_volume),
      oz: isLid ? null : ozOf(item.size_volume),
      size: item.size_volume,
      casePack: item.units_per_case,
      // Per-piece weight (g) and shipping carton dimensions (stored as mm,
      // "L × W × H") — shown in the rate sheet for logistics.
      weightG: item.item_weight_g != null ? Number(item.item_weight_g) : null,
      carton: item.carton_dimensions || null,
      // Country of manufacture (e.g. India, China) — drives the origin filter.
      origin: item.country_of_origin || null,
      // Round diameter (mm) for the cross-cutting size filter: lids carry their
      // Ø; cups carry their top diameter (TD). Lets a buyer line a lid up to a
      // cup by the rim they share.
      dia: isLid ? diameterOf(item.size_volume) : cupTopDiameter(item.size_volume),
      sortVal: isLid ? diameterOf(item.size_volume) : volumeNumber(volumeOf(item.size_volume)),
      plain,
      printed,
    };
    const key = item.sub_category || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const ordered = [...GROUP_ORDER, ...[...groups.keys()].filter((k) => !GROUP_ORDER.includes(k))];
  const sections = ordered
    .filter((k) => groups.has(k))
    .map((k) => ({
      key: k,
      label: GROUP_LABEL[k] || k,
      code: SHORT_CODE[k] || k,
      blurb: GROUP_BLURB[k] || null,
      isLid: PET_LID_GROUPS.has(k),
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

// "300ml / 10oz | 80 x 45 x 112 mm (TD x BD x H)" → "300ml / 10oz"
// "16oz / 425ml (U-Shape)"                        → "16oz / 425ml (U-Shape)"
function volumeOf(size) {
  if (!size) return null;
  const head = size.split("|")[0].trim();
  return head || null;
}

// Pull the oz capacity out of a cup size/volume label for filtering.
function ozOf(size) {
  if (!size) return null;
  const m = String(size).match(/(\d+)\s*oz/i);
  return m ? Number(m[1]) : null;
}

// First diameter/dimension number for lid sorting: "Ø 90 mm" → 90,
// "Ø 73/75 mm" → 73, "125 x 125 mm" → 125.
function diameterOf(size) {
  if (!size) return null;
  const m = String(size).match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Top diameter (TD) of a cup — the first dimension after "|", which the size
// string orders as "TD x BD x H": "… | 98 x 60 x 120 mm (TD x BD x H)" → 98.
// U-shape sizes with no dimension block (e.g. "16oz / 425ml (U-Shape)") → null.
function cupTopDiameter(size) {
  if (!size || !String(size).includes("|")) return null;
  const tail = String(size).split("|").slice(1).join("|");
  const m = tail.match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Reduce a raw product name to just its distinguishing descriptor. Size, type
// and material already have their own columns/sections, so size tokens
// ("90mm", "125×125", "10oz", "300ml"), the type words (Dome/Flat/Sipper),
// "PET", "Cup", "Lid", and the "- TF" suffix are all stripped. What survives is
// the genuinely useful bit — "U-Shape", "(80mm TD)", "Square", "Straw Cut",
// "Twin". Items with no extra descriptor return "" (blank cell).
function cleanName(name) {
  if (!name) return "";
  let s = name
    .replace(/\b\d+(?:\.\d+)?\s?oz\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s?ml\b/gi, "")
    .replace(/\b\d+(?:\/\d+)?\s?mm\b/gi, "")
    .replace(/\b\d+\s?[x×]\s?\d+\b/gi, "")
    .replace(/-\s*TF\b/gi, "")
    .replace(/\bDome\b/gi, "")
    .replace(/\bFlat\b/gi, "")
    .replace(/\bSipper\b/gi, "")
    .replace(/\bPET\b/gi, "")
    .replace(/\bCup\b/gi, "")
    .replace(/\bLid\b/gi, "");
  s = s
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s*\)/g, "")
    .replace(/^[\s,;—-]+|[\s,;—-]+$/g, "")
    .trim();
  // If the whole descriptor is one parenthetical, drop the now-pointless wrap.
  const sole = s.match(/^\(([^()]*)\)$/);
  return sole ? sole[1].trim() : s;
}

// Sort within a group: by capacity / diameter (ascending), then SKU.
function rowSort(a, b) {
  if (a.sortVal != null && b.sortVal != null && a.sortVal !== b.sortVal) {
    return a.sortVal - b.sortVal;
  }
  return a.sku.localeCompare(b.sku, undefined, { numeric: true });
}

// Pull a comparable capacity (in ml) out of a cup volume label, normalising oz.
function volumeNumber(vol) {
  if (!vol) return null;
  const ml = vol.match(/(\d+)\s?ml/i);
  if (ml) return Number(ml[1]);
  const oz = vol.match(/(\d+)\s?oz/i);
  if (oz) return Number(oz[1]) * 30;
  return null;
}
