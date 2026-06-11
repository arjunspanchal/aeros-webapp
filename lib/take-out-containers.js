// Public Take Out Containers rate sheet data. Reads `master_products`
// (category = "Take Out Containers") limited to the round/box-style food
// vessels customers think of as one range — Tubs, Ice Cream Tubs and the
// three Salad Bowl shapes (Round / Rectangular / Square). Food Boxes and
// Doner Boxes are intentionally excluded — they're a different selling unit.
//
// It ALSO pulls the lids (category = "Lids", flat + dome) that actually fit
// those containers — matched by top diameter for round vessels and footprint
// for the square/rectangular bowls. Sipper lids are drink-cup lids, excluded.
//
// Plain and custom-printed items are SEPARATE SKUs (Aeros house rule), linked
// by parent_sku. Each plain SKU is merged with its printed twin into ONE row
// carrying both a plain and a printed ladder, so the sheet can toggle plain ⇄
// customised like the cup sheet. Rates are EXW India, INR only.

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only — matches the other sheets.
export const USD_PER_INR_DIVISOR = 95;

// ── Container groups ─────────────────────────────────────────────────────────
const GROUP_ORDER = [
  "Tubs",
  "Ice Cream Tubs",
  "Round Salad Bowls",
  "Rectangular Salad Bowls",
  "Square Salad Bowls",
];
const GROUP_SET = new Set(GROUP_ORDER);

const GROUP_LABEL = {
  Tubs: "Paper Tubs",
  "Ice Cream Tubs": "Ice Cream Tubs",
  "Round Salad Bowls": "Round Salad Bowls",
  "Rectangular Salad Bowls": "Rectangular Salad Bowls",
  "Square Salad Bowls": "Square Salad Bowls",
};
const SHORT_CODE = {
  Tubs: "Tubs",
  "Ice Cream Tubs": "Ice Cream",
  "Round Salad Bowls": "Round",
  "Rectangular Salad Bowls": "Rect.",
  "Square Salad Bowls": "Square",
};
const FIT_NAME = {
  Tubs: "Tubs",
  "Ice Cream Tubs": "Ice cream",
  "Round Salad Bowls": "Round bowls",
  "Rectangular Salad Bowls": "Rect. bowls",
  "Square Salad Bowls": "Square bowls",
};
const GROUP_BLURB = {
  Tubs:
    "Round paper food tubs with rolled rims — soups, curries, rice, deli and hot-fill. Ø98–125 mm across 250 ml–1.2 L, in white or kraft. Matching lids below.",
  "Ice Cream Tubs":
    "PE-lined round tubs and cups for ice cream, gelato and frozen desserts — 2.5 oz scoop cups up to 16 oz family tubs.",
  "Round Salad Bowls":
    "Wide, shallow round bowls (Ø148–180 mm) for salads, poke, grain and burrito bowls. Plain or custom-printed; white and kraft.",
  "Rectangular Salad Bowls":
    "Rectangular paper bowls (170 × 120 mm footprint) from 500 ml–1 L — meal salads and mains, white or kraft.",
  "Square Salad Bowls":
    "Square paper bowls (125–180 mm) from 300 ml–1.25 L — sides, salads and shareable portions, kraft.",
};

// ── Lid groups ───────────────────────────────────────────────────────────────
// Lids grouped by MATERIAL (Paper / PP / PET). Flat + dome listed (dome fits the
// ice-cream range); sipper lids are drink-cup lids and excluded. Each row shows
// its lid type (Flat/Dome) and forming (TF/IM).
const LID_MATERIAL_ORDER = ["Paper", "PP", "PET"];
const LID_SECTION_LABEL = { Paper: "Paper Lids", PP: "PP Lids", PET: "PET Lids" };
const LID_SECTION_CODE = { Paper: "Paper Lid", PP: "PP Lid", PET: "PET Lid" };
const LID_SECTION_BLURB = {
  Paper:
    "Flat paper lids — the natural close for paper tubs and bowls. White or kraft; one Ø148 double-layer lid is custom-printable.",
  PP:
    "Rigid PP lids — flat and dome, round and rectangular. Firm, leak-resistant seal; thermoformed (TF) or injection-moulded (IM).",
  PET:
    "Clear PET lids — flat and dome, round and square — so the contents show through. Some flat lids are straw-cut.",
};
const LID_INCLUDE_TYPES = new Set(["Flat", "Dome"]); // sipper excluded

function lidMaterial(subCat) {
  if (/PET/i.test(subCat || "")) return "PET";
  if (/PP/i.test(subCat || "")) return "PP";
  if (/Paper/i.test(subCat || "")) return "Paper";
  return null;
}
function lidType(subCat) {
  if (/^Dome/i.test(subCat || "")) return "Dome";
  if (/^Flat/i.test(subCat || "")) return "Flat";
  return null;
}
function lidForming(name) {
  if (/injection|moul?ded|\(im\)|\bim\b/i.test(name || "")) return "IM";
  if (/-\s*tf\b|\btf\b|thermoform/i.test(name || "")) return "TF";
  return null;
}
function isListableLid(p) {
  return LID_INCLUDE_TYPES.has(lidType(p.sub_category)) && !!lidMaterial(p.sub_category);
}
// All container diameters a lid can seat on — handles twin lids ("Ø 73/75 mm")
// by returning a key per diameter; square/rect lids fall back to footprint.
function lidFitKeys(item) {
  const round = (item.size_volume || "").match(/Ø\s*([\d/]+)\s*mm/i);
  if (round) {
    return round[1]
      .split("/")
      .map((n) => parseInt(n, 10))
      .filter(Number.isFinite)
      .map((n) => `d:${n}`);
  }
  const k = fitKey(item);
  return k ? [k] : [];
}

export async function fetchTakeOutContainers() {
  const [containerProducts, lidProducts] = await Promise.all([
    dbSelect("master_products", {
      select:
        "id,sku,parent_sku,product_type,product_name,category,sub_category,size_volume,material,colour,units_per_case,top_diameter_mm",
      filter: { category: "eq.Take Out Containers" },
      order: "sku.asc",
    }),
    dbSelect("master_products", {
      select:
        "id,sku,parent_sku,product_type,product_name,category,sub_category,size_volume,material,colour,units_per_case,top_diameter_mm",
      filter: { category: "eq.Lids" },
      order: "sku.asc",
    }),
  ]);

  const scopedContainers = containerProducts.filter((p) => GROUP_SET.has(p.sub_category));
  if (scopedContainers.length === 0)
    return { sections: [], total: 0, plainPriced: 0, printedPriced: 0, lidCount: 0 };

  // Custom-branded SKUs are the printed twins (linked by parent_sku). They are
  // merged into their plain parent as the "printed" ladder, not listed alone.
  const allScoped = [...scopedContainers, ...lidProducts.filter(isListableLid)];
  const customChildByParent = new Map(); // parent sku -> custom-branded child item
  for (const p of allScoped) {
    if (p.product_type === "custom_branded" && p.parent_sku) customChildByParent.set(p.parent_sku, p);
  }

  // Container fit-keys → friendly group names (for lid matching + "Fits" labels).
  const fitKeyToGroups = new Map();
  for (const c of scopedContainers) {
    if (c.product_type === "custom_branded") continue;
    const key = fitKey(c);
    if (!key) continue;
    if (!fitKeyToGroups.has(key)) fitKeyToGroups.set(key, new Set());
    fitKeyToGroups.get(key).add(FIT_NAME[c.sub_category] || c.sub_category);
  }

  // Base rows = PLAIN SKUs. Lids: plain flat/dome lids that fit a container.
  const containers = scopedContainers.filter((p) => p.product_type !== "custom_branded");
  const lids = lidProducts.filter(
    (l) =>
      isListableLid(l) &&
      l.product_type !== "custom_branded" &&
      // Straw-cut lids are for cold/paper cups, not tubs/bowls — never list them.
      !/straw\s*cut/i.test(l.product_name || "") &&
      lidFitKeys(l).some((k) => fitKeyToGroups.has(k)),
  );

  // Price every base SKU + every custom-branded child.
  const ids = [
    ...containers.map((p) => p.id),
    ...lids.map((p) => p.id),
    ...[...customChildByParent.values()].map((p) => p.id),
  ];
  const pricing = ids.length
    ? await dbSelect("master_product_pricing", {
        select: "product_id,min_qty,price_inr,offering_type",
        filter: { product_id: `in.(${ids.join(",")})`, offering_type: "in.(plain,custom_branded)" },
      })
    : [];

  const slabsByProduct = new Map(); // id -> { plain: [], custom: [] }
  for (const p of pricing) {
    if (p.price_inr == null) continue; // null-priced rows = on request
    const bucket = slabsByProduct.get(p.product_id) || { plain: [], custom: [] };
    const slab = { minQty: p.min_qty != null ? Number(p.min_qty) : 0, priceInr: Number(p.price_inr) };
    (p.offering_type === "plain" ? bucket.plain : bucket.custom).push(slab);
    slabsByProduct.set(p.product_id, bucket);
  }

  let plainPriced = 0;
  let printedPriced = 0;
  const shapeRow = (item, { isLid }) => {
    const own = slabsByProduct.get(item.id) || { plain: [], custom: [] };
    const plain = shapeOffering(own.plain);
    const child = customChildByParent.get(item.sku);
    const childSlabs = child ? slabsByProduct.get(child.id) || { custom: [] } : { custom: [] };
    const printed = shapeOffering(childSlabs.custom);
    if (plain.entry) plainPriced += 1;
    if (printed.entry) printedPriced += 1;

    // Lids: "Item" cell = Type · Forming · (extra descriptor); "Fits" = union of
    // container groups across all the lid's diameters (twins fit two).
    let name = cleanName(item.product_name);
    let fits = null;
    if (isLid) {
      const groups = new Set();
      for (const k of lidFitKeys(item)) for (const g of fitKeyToGroups.get(k) || []) groups.add(g);
      fits = groups.size ? [...groups].join(" · ") : null;
      name = [lidType(item.sub_category), lidForming(item.product_name), name]
        .filter(Boolean)
        .join(" · ");
    }
    return {
      sku: item.sku,
      name,
      volume: isLid ? null : volumeOf(item.size_volume),
      size: item.size_volume,
      material: shortMaterial(item.material),
      casePack: item.units_per_case,
      sortVal: isLid ? lidSortVal(item) : volumeNumber(volumeOf(item.size_volume)),
      // Round-rim top diameter (mm) — null for square/rectangular items. Drives
      // the cross-section Ø filter so a tub and its matching lid filter together.
      diameter: item.top_diameter_mm != null ? Number(item.top_diameter_mm) : null,
      isLid,
      fits,
      printable: !!printed.entry, // has a real customised rate
      plain,
      printed,
    };
  };

  // Container sections.
  const containerGroups = new Map();
  for (const item of containers) {
    const key = item.sub_category;
    if (!containerGroups.has(key)) containerGroups.set(key, []);
    containerGroups.get(key).push(shapeRow(item, { isLid: false }));
  }
  const containerSections = GROUP_ORDER.filter((k) => containerGroups.has(k)).map((k) => ({
    key: k,
    label: GROUP_LABEL[k] || k,
    code: SHORT_CODE[k] || k,
    blurb: GROUP_BLURB[k] || null,
    isLid: false,
    rows: containerGroups.get(k).sort(rowSort),
  }));

  // Lid sections — grouped by material; flat + dome together, type/forming per row.
  const lidGroups = new Map();
  for (const item of lids) {
    const mat = lidMaterial(item.sub_category);
    if (!lidGroups.has(mat)) lidGroups.set(mat, []);
    lidGroups.get(mat).push(shapeRow(item, { isLid: true }));
  }
  const lidSections = LID_MATERIAL_ORDER.filter((m) => lidGroups.has(m)).map((m) => ({
    key: `lids-${m}`,
    label: LID_SECTION_LABEL[m] || `${m} Lids`,
    code: LID_SECTION_CODE[m] || m,
    blurb: LID_SECTION_BLURB[m] || null,
    isLid: true,
    rows: lidGroups.get(m).sort(rowSort),
  }));

  const sections = [...containerSections, ...lidSections];
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const lidCount = lidSections.reduce((n, s) => n + s.rows.length, 0);
  return { sections, total, plainPriced, printedPriced, lidCount };
}

// Sort slabs ascending by qty; surface entry (lowest qty) and best (highest qty).
function shapeOffering(slabs) {
  const sorted = [...slabs].sort((a, b) => a.minQty - b.minQty);
  return { slabs: sorted, entry: sorted[0] || null, best: sorted[sorted.length - 1] || null };
}

// Size "fit key": round items key on top diameter ("d:98"); square/rectangular
// items key on their sorted footprint ("f:120x170").
function fitKey(item) {
  const d = item.top_diameter_mm != null ? Number(item.top_diameter_mm) : null;
  if (d != null && Number.isFinite(d)) return `d:${Math.round(d)}`;
  const tail =
    (item.size_volume || "").includes("|")
      ? item.size_volume.split("|").slice(1).join("|")
      : item.size_volume || "";
  const nums = (tail.match(/\d+(?:\.\d+)?/g) || []).slice(0, 2).map(Number);
  if (nums.length < 2) return null;
  const a = Math.round(Math.min(nums[0], nums[1]));
  const b = Math.round(Math.max(nums[0], nums[1]));
  return `f:${a}x${b}`;
}

// Lids sort by diameter, then footprint area, then SKU.
function lidSortVal(item) {
  const d = item.top_diameter_mm != null ? Number(item.top_diameter_mm) : null;
  if (d != null && Number.isFinite(d)) return d;
  const nums = ((item.size_volume || "").match(/\d+(?:\.\d+)?/g) || []).slice(0, 2).map(Number);
  return nums.length === 2 ? nums[0] * nums[1] : null;
}

// "12oz / 350ml | 98 x 78 x 73 mm (TD x BD x H)" → "12oz / 350ml"
function volumeOf(size) {
  if (!size) return null;
  // Normalise "500 ml" → "500ml" so capacity reads consistently across the sheet.
  const head = size.split("|")[0].trim().replace(/(\d)\s+ml\b/gi, "$1ml");
  return head || null;
}

// "White Paper" → "White", "Kraft Paper" → "Kraft", "PET" → "R-PET" (lid stock
// is recycled PET). PP and other materials pass through unchanged.
function shortMaterial(material) {
  if (!material) return null;
  if (/^PET$/i.test(material.trim())) return "R-PET";
  return material.replace(/\s*paper\s*$/i, "").trim() || material;
}

// Reduce a raw product name to its distinguishing descriptor. Size, shape,
// material, diameter and forming words all have their own columns/labels, so
// they're stripped. What survives — "B1/B2/B3", "Customized", "Straw Cut",
// "Double Layer". Items with no extra descriptor return "".
function cleanName(name) {
  if (!name) return "";
  let s = name
    .replace(/\([^)]*\)/g, "")
    .replace(/-\s*TF\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s?oz\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s?ml\b/gi, "")
    .replace(/\b\d+(?:\/\d+)?\s?mm\b/gi, "")
    .replace(/\b\d+\s?[x×]\s?\d+\b/gi, "")
    .replace(/\bPaper\b/gi, "")
    .replace(/\bContainers?\b/gi, "")
    .replace(/\bTubs?\b/gi, "")
    .replace(/\bBowls?\b/gi, "")
    .replace(/\bSalad\b/gi, "")
    .replace(/\bRound\b/gi, "")
    .replace(/\bSquare\b/gi, "")
    .replace(/\bRectangular\b/gi, "")
    .replace(/\bIce\b/gi, "")
    .replace(/\bCream\b/gi, "")
    .replace(/\bCup\b/gi, "")
    .replace(/\bLid\b/gi, "")
    .replace(/\bFlat\b/gi, "")
    .replace(/\bDome\b/gi, "")
    .replace(/\bSipper\b/gi, "")
    .replace(/\bPET\b/gi, "")
    .replace(/\bPP\b/gi, "")
    .replace(/\bInjection\b/gi, "")
    .replace(/\bMoul?ded\b/gi, "")
    .replace(/\bTwin\b/gi, "")
    .replace(/\bIM\b/g, "")
    .replace(/\bWhite\b/gi, "")
    .replace(/\bKraft\b/gi, "");
  s = s
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;—/-]+|[\s,;—/-]+$/g, "")
    .trim();
  return s;
}

// Sort within a group: by capacity / size (ascending), then SKU.
function rowSort(a, b) {
  if (a.sortVal != null && b.sortVal != null && a.sortVal !== b.sortVal) return a.sortVal - b.sortVal;
  return a.sku.localeCompare(b.sku, undefined, { numeric: true });
}

// Comparable capacity (ml) from a volume label, normalising oz.
function volumeNumber(vol) {
  if (!vol) return null;
  const ml = vol.match(/(\d+)\s?ml/i);
  if (ml) return Number(ml[1]);
  const oz = vol.match(/(\d+)\s?oz/i);
  if (oz) return Number(oz[1]) * 30;
  return null;
}
