// Public PP cup & IM lid rate sheet data. Reads `master_products` (category =
// "PP Cups", plus the PP sub-categories of "Lids") + the plain and
// custom-branded pricing rows from `master_product_pricing`, joins them in JS,
// and shapes a render-ready list grouped by item type (Flat-Bottom / U-Shape PP
// Cup, Cup + Lid Set, Dome / Flat / Sipper PP Lid).
//
// Each base item carries TWO quantity ladders so the page can toggle between
// them:
//   • plain    — unprinted item. Cups: single MOQ slab. Lids: a 5-break IM
//                ladder (5k / 25k / 50k / 100k / 250k).
//   • printed  — custom-branded print, taken from the same SKU's
//                `custom_branded` offering (cups break from 5k). PP lids are
//                supplied plain and have no printed offering — they fall
//                through to "on request" under the customised toggle.
// Each slab carries two pricing bases: EXW at origin (FCL export) and India
// DDP (delivered, from india_landed_inr). Lids are IM only (TF excluded) and
// cup-sized only (Ø<100mm — bigger flat lids belong to tubs/bowls). PP
// (polypropylene, resin code 5) is a tough, flexible, translucent/frosted
// plastic — no board GSM, no kraft finish.

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only — matches the paper sheets.
export const USD_PER_INR_DIVISOR = 90;

// Group order + friendly section copy. Keyed by the raw `sub_category`.
const GROUP_ORDER = [
  "Flat Bottom PP Cup",
  "U-Shape PP Cup",
  "Cup + Lid Set",
  "Dome PP Lid",
  "Flat PP Lid",
  "Sipper PP Lid",
];

const GROUP_LABEL = {
  "Flat Bottom PP Cup": "Flat-Bottom Cups",
  "U-Shape PP Cup": "U-Shape Cups",
  "Cup + Lid Set": "Cup + Lid Sets",
  "Dome PP Lid": "Dome Lids",
  "Flat PP Lid": "Flat Lids",
  "Sipper PP Lid": "Sipper Lids",
};

const GROUP_BLURB = {
  "Flat Bottom PP Cup":
    "Rigid flat-bottomed polypropylene cold cups — translucent or frosted. Tough, flexible and reusable, with a clean stable base. Plain or custom-branded.",
  "U-Shape PP Cup":
    "Tapered U-profile PP cups that nest tightly for efficient shipping. Translucent or frosted; plain or custom-branded.",
  "Cup + Lid Set":
    "Matched cup-and-lid combinations supplied together, single-poly bagged. Priced and ordered as one set.",
  "Dome PP Lid":
    "Injection-molded dome lids with headroom for straws and toppings. Tough PP, supplied plain.",
  "Flat PP Lid":
    "Injection-molded flat PP lids sized to the cup's top diameter. Supplied plain.",
  "Sipper PP Lid":
    "Injection-molded sipper lids with a sip spout and locking tabs — drink straight from the lid. Supplied plain.",
};

const SHORT_CODE = {
  "Flat Bottom PP Cup": "Flat-Bottom",
  "U-Shape PP Cup": "U-Shape",
  "Cup + Lid Set": "Sets",
  "Dome PP Lid": "Dome",
  "Flat PP Lid": "Flat Lid",
  "Sipper PP Lid": "Sipper",
};

// Word used in the per-section count ("9 cups", "8 sizes", "1 set").
const COUNT_WORD = {
  "Flat Bottom PP Cup": "cups",
  "U-Shape PP Cup": "cups",
  "Cup + Lid Set": "sets",
  "Dome PP Lid": "sizes",
  "Flat PP Lid": "sizes",
  "Sipper PP Lid": "sizes",
};

const PP_LID_GROUPS = new Set(["Dome PP Lid", "Flat PP Lid", "Sipper PP Lid"]);

export async function fetchPpCupsAndLids() {
  // Two product reads: the PP cup range (incl. cup + lid sets), and the PP lids
  // that live under the shared "Lids" category. PET lids are excluded.
  const [cups, lids] = await Promise.all([
    dbSelect("master_products", {
      select:
        "id,sku,product_name,category,sub_category,size_volume,material,colour,units_per_case,country_of_origin,item_weight_g,carton_dimensions",
      filter: { category: "eq.PP Cups" },
      order: "sku.asc",
    }),
    dbSelect("master_products", {
      select:
        "id,sku,product_name,category,sub_category,size_volume,material,colour,units_per_case,country_of_origin,item_weight_g,carton_dimensions",
      filter: { category: "eq.Lids", sub_category: "like.*PP*" },
      order: "sku.asc",
    }),
  ]);

  // This page lists injection-molded (IM) lids only — drop thermoformed (TF)
  // lids entirely (it's the "PP Cups & IM Lids" sheet). Also drop tub / bowl
  // lids: PP cold cups are Ø90mm (cup lids run Ø80–90), so anything Ø100mm+
  // (e.g. the Ø115/125/150/180 flat lids) belongs to containers, not cups.
  const imLids = lids.filter(
    (l) => formingOf(l.product_name) !== "Thermoformed" && isCupLid(l.size_volume),
  );
  const products = [...cups, ...imLids];
  if (products.length === 0)
    return { sections: [], total: 0, plainPriced: 0, printedPriced: 0 };

  const ids = products.map((p) => p.id);
  const pricing = await dbSelect("master_product_pricing", {
    select: "product_id,min_qty,price_inr,india_landed_inr,offering_type",
    filter: {
      product_id: `in.(${ids.join(",")})`,
      offering_type: "in.(plain,custom_branded)",
    },
  });

  // Collect priced slabs per product, split by offering type. Each slab carries
  // both pricing bases: priceInr is the EXW India (export / FCL) rate that's
  // already live on the sheet; ddpInr is the India delivered (DDP) rate from
  // india_landed_inr (null where not yet costed → shown "on request" under the
  // DDP basis).
  const plainByProduct = new Map();
  const printedByProduct = new Map();
  for (const p of pricing) {
    if (p.price_inr == null) continue; // null-priced rows = on request
    const bucket = p.offering_type === "plain" ? plainByProduct : printedByProduct;
    const list = bucket.get(p.product_id) || [];
    list.push({
      minQty: p.min_qty != null ? Number(p.min_qty) : 0,
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
    const isSet = item.sub_category === "Cup + Lid Set";
    const plain = shapeOffering(plainByProduct.get(item.id) || []);
    const printed = shapeOffering(printedByProduct.get(item.id) || []);
    if (plain.entry) plainPriced += 1;
    if (printed.entry) printedPriced += 1;

    const row = {
      sku: item.sku,
      name: cleanName(item.product_name),
      forming: formingOf(item.product_name),
      origin: item.country_of_origin || null,
      isLid,
      volume: isLid ? null : volumeOf(item.size_volume),
      oz: isLid ? null : ozOf(item.size_volume),
      // Sets pack a cup + a lid, so the "TD×BD×H" dim string doesn't apply.
      size: isSet ? null : normalizeSize(item.size_volume),
      casePack: item.units_per_case,
      // Per-piece weight (g) and shipping carton dimensions (stored as mm,
      // "L × W × H") — shown in the rate sheet for logistics.
      weightG: item.item_weight_g != null ? Number(item.item_weight_g) : null,
      carton: item.carton_dimensions || null,
      sortVal: isLid
        ? diameterOf(item.size_volume)
        : volumeNumber(volumeOf(item.size_volume)),
      plain,
      printed,
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
      isLid: PP_LID_GROUPS.has(k),
      countWord: COUNT_WORD[k] || "items",
      rows: groups.get(k).sort(rowSort),
    }));

  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  return { sections, total, plainPriced, printedPriced };
}

// Sort slabs ascending by qty and surface the entry (lowest qty / highest
// price) and best (highest qty / lowest price) breaks.
function shapeOffering(slabs) {
  let sorted = [...slabs].sort((a, b) => a.minQty - b.minQty);
  // Collapse flat ladders: if every slab carries the same price on both bases
  // (e.g. the Cup + Lid Set is ₹4.09 from 1K through 1L), the qty breaks are
  // noise — keep just the MOQ slab so the sheet shows one price, not a
  // "₹4.09–₹4.09" range with a pointless expandable ladder.
  if (
    sorted.length > 1 &&
    sorted.every((s) => s.priceInr === sorted[0].priceInr && s.ddpInr === sorted[0].ddpInr)
  ) {
    sorted = [sorted[0]];
  }
  return {
    slabs: sorted,
    entry: sorted[0] || null,
    best: sorted[sorted.length - 1] || null,
  };
}

// Forming method, surfaced as a small badge so the IM and thermoformed (TF)
// variants of the same size/shape are distinguishable on the sheet.
function formingOf(name) {
  if (!name) return null;
  if (/injection|\(im\)|\bim\b/i.test(name)) return "Injection-molded";
  if (/-\s*tf\b|thermoform/i.test(name)) return "Thermoformed";
  return null;
}

// "12oz / 350ml | 90 x 57 x 100 mm (TD x BD x H)"        → "12oz / 350ml"
// "12oz / 350ml Frosted Cup + O85 String Lid (one poly)" → "12oz / 350ml"
function volumeOf(size) {
  if (!size) return null;
  const head = size.split("|")[0].trim();
  const m =
    head.match(/\d+\s?oz\s*\/\s*\d+\s?ml/i) ||
    head.match(/\d+\s?oz/i) ||
    head.match(/\d+\s?ml/i);
  return m ? m[0].replace(/\s+/g, " ") : head || null;
}

// Pull the oz capacity out of a cup size/volume label for filtering.
function ozOf(size) {
  if (!size) return null;
  const m = String(size).match(/(\d+)\s*oz/i);
  return m ? Number(m[1]) : null;
}

// First diameter/dimension number for lid sorting: "Ø 90 mm" → 90,
// "170 x 120 mm" → 170, "O 85 mm" → 85.
function diameterOf(size) {
  if (!size) return null;
  const m = String(size).match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// A lid fits the PP cold cups (Ø90mm; cup lids run Ø80–90) only if it's under
// ~100mm. Ø100mm+ flat lids (115/125/150/180) are tub / bowl lids, not cup lids.
function isCupLid(size) {
  const d = diameterOf(size);
  return d != null && d < 100;
}

// Normalise a stray "O 85 mm" diameter typo back to "Ø 85 mm" so the size
// renderer treats it as a round lid.
function normalizeSize(size) {
  if (!size) return size;
  return String(size).replace(/\bO\s*(\d+(?:\.\d+)?\s*mm)/g, "Ø $1");
}

// Reduce a raw product name to just its distinguishing descriptor. Size, type,
// material and forming method already have their own columns/sections, so size
// tokens, the type words (Flat Bottom / U-Shape / Dome / Flat / Sipper), "PP",
// "Cup", "Lid", the "- TF" suffix and the "(IM)"/"Injection Molded" tag are all
// stripped. What survives is the useful bit — "Frosted", a lid mechanism
// ("String Lock", "Lock Back Tab Oval"), a colour ("Black"). Supplier names
// are dropped. Items with no extra descriptor return "" (blank cell).
function cleanName(name) {
  if (!name) return "";
  let s = name
    .replace(/\b\d+(?:\.\d+)?\s?oz\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s?ml\b/gi, "")
    .replace(/\b\d+(?:\/\d+)?\s?mm\b/gi, "")
    .replace(/[ØO]\s?\d+\b/gi, "")
    .replace(/\b\d+\s?[x×]\s?\d+\b/gi, "")
    // Strip supplier / vendor names wherever they appear — these must NEVER
    // be visible on the public sheet. Match anywhere, not just "(Name)".
    .replace(/\b(?:Lorven|Hanyong|Shuyang|Olive\s*Ecopak|Oracel)\b/gi, "")
    .replace(/\(one poly\)/gi, "")
    .replace(/-\s*TF\b/gi, "")
    .replace(/\bInjection[\s-]?Molded\b/gi, "")
    .replace(/\(IM\)/gi, "")
    .replace(/\bFlat Bottom\b/gi, "")
    .replace(/\bU-?Shape\b/gi, "")
    .replace(/\bDome\b/gi, "")
    .replace(/\bSipper\b/gi, "")
    .replace(/\bFlat\b/gi, "")
    .replace(/\bPP\b/gi, "")
    .replace(/\bPET\b/gi, "")
    .replace(/\bCup\b/gi, "")
    .replace(/\bLid\b/gi, "");
  s = s
    .replace(/\s*\/\s*/g, " ") // drop stray slashes left by "12oz / 350ml"
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    // Remove parentheticals left holding only punctuation after stripping —
    // e.g. "(O85, Lorven)" → "(, )" → "" (no orphaned commas / vendor remnants).
    .replace(/\([\s,;/+&-]*\)/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*\+\s*$/g, "")
    .replace(/^[\s,;—+-]+|[\s,;—+-]+$/g, "")
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
