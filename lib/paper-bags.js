// Public paper-bag rate sheet data. Reads `master_products` (category =
// "Paper Bags") + `master_product_pricing`, joins them in JS, and shapes two
// render-ready, grouped lists:
//   • `sections`        — plain (unprinted) bags, one EXW per-piece rate each.
//   • `printedSections` — the same bags in their custom-branded form, each
//                         carrying three print tiers (coverage / colour) and a
//                         per-tier quantity-break price ladder.
//
// Plain parents have no `parent_sku`; printed variants are separate SKUs that
// point back at their plain parent via `parent_sku` (e.g. SOS-034 → SOS-034-P10
// / -P30 / -P100). Rates are EXW India, per piece, INR (USD is indicative).

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only. Matches the calculator's
// USD_RATE constant; the page labels the USD column as indicative.
export const USD_PER_INR_DIVISOR = 95;

// India DDP build-up on top of the FCL/EXW price (= cost × 1.10): +15% margin,
// + ₹10/kg freight per piece (needs item weight), then per-product GST. Strict:
// without a per-piece weight there's no freight basis, so DDP is null ("On
// request"). GST defaults to 18% (standard for bags & cups).
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

// Print tiers. The catalogue stores each printed variant as a `-P<n>` SKU; the
// coverage band and the colour count it bundles are fixed presets.
const TIER_META = {
  P10: { coverage: 10, colours: 1 },
  P30: { coverage: 30, colours: 2 },
  P100: { coverage: 100, colours: 4 },
};

export async function fetchPaperBags() {
  const bags = await dbSelect("master_products", {
    select:
      "id,sku,product_name,sub_category,size_volume,material,gsm,colour,units_per_case,parent_sku,market,carton_dimensions,item_weight_g,gst_percent",
    filter: { category: "eq.Paper Bags" },
    order: "sku.asc",
  });
  // Pricing MUST be scoped to these products: PostgREST caps responses at
  // 1,000 rows, and the unscoped table is far past that — an unfiltered fetch
  // silently drops whichever rows fall outside the window as the catalog grows.
  const idFilter = `in.(${bags.map((b) => b.id).join(",")})`;
  const [plainPricing, printedPricing] = bags.length
    ? await Promise.all([
        dbSelect("master_product_pricing", {
          select: "product_id,min_qty,price_inr,incoterm",
          filter: { product_id: idFilter, offering_type: "eq.plain" },
        }),
        dbSelect("master_product_pricing", {
          select: "product_id,min_qty,price_inr,incoterm",
          filter: { product_id: idFilter, offering_type: "eq.custom_branded" },
        }),
      ])
    : [[], []];

  // ── Plain: one price per bag (single-break EXW rows). Keep lowest min_qty. ──
  const plainByProduct = new Map();
  for (const p of plainPricing) {
    const prev = plainByProduct.get(p.product_id);
    if (!prev || (p.min_qty ?? 0) < (prev.min_qty ?? 0)) {
      plainByProduct.set(p.product_id, p);
    }
  }

  // ── Printed: many rows per product (a quantity ladder). Group by product. ──
  const printedByProduct = new Map();
  for (const p of printedPricing) {
    if (p.price_inr == null) continue;
    if (!printedByProduct.has(p.product_id)) printedByProduct.set(p.product_id, []);
    printedByProduct.get(p.product_id).push(p);
  }

  const plainBags = bags.filter((b) => !b.parent_sku);
  const printedChildren = bags.filter((b) => b.parent_sku);

  // Per-bag weight + GST for the India DDP build-up; printed children inherit
  // their plain parent's weight (same physical bag) when their own is blank.
  const specBySku = new Map();
  for (const b of bags) {
    specBySku.set(b.sku, {
      weightG: b.item_weight_g != null ? Number(b.item_weight_g) : null,
      gstPct: b.gst_percent,
    });
  }

  // ── Plain sections ─────────────────────────────────────────────────────────
  const groups = new Map();
  for (const b of plainBags) {
    const price = plainByProduct.get(b.id) || null;
    const inr = price?.price_inr != null ? Number(price.price_inr) : null;
    const row = {
      sku: b.sku,
      name: cleanName(b.product_name, b.sku),
      size: b.size_volume,
      material: b.material,
      gsm: b.gsm != null ? Number(b.gsm) : null,
      colour: b.colour,
      casePack: b.units_per_case,
      market: b.market || "Exports", // untagged bags ship Exports
      ...cbmFields(cartonCbm(b)),
      minQty: price?.min_qty ?? null,
      incoterm: price?.incoterm ?? null,
      priceInr: inr,
      priceUsd: inr != null ? inr / USD_PER_INR_DIVISOR : null,
      ddpInr: ddpOf(inr, b.item_weight_g != null ? Number(b.item_weight_g) : null, b.gst_percent),
    };
    const key = b.sub_category || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const sections = buildSections(groups, (a, b) => skuSort(a, b));

  // ── Printed sections: collapse the -P10/-P30/-P100 children into one bag ────
  const bagByParent = new Map(); // parent_sku → { specs…, tiers:[] }
  for (const c of printedChildren) {
    const ladder = printedByProduct.get(c.id);
    if (!ladder || !ladder.length) continue;
    const band = bandFromSku(c.sku);
    const meta = band && TIER_META[band];
    if (!meta) continue;

    // DDP weight: printed child's own, else inherit the plain parent's.
    const pspec = specBySku.get(c.parent_sku);
    const wG = (c.item_weight_g != null ? Number(c.item_weight_g) : null) ?? pspec?.weightG ?? null;
    const gP = c.gst_percent ?? pspec?.gstPct ?? null;
    const breaks = ladder
      .map((r) => ({
        minQty: r.min_qty ?? 0,
        priceInr: Number(r.price_inr),
        ddpInr: ddpOf(Number(r.price_inr), wG, gP),
      }))
      .sort((a, b) => a.minQty - b.minQty);
    if (!breaks.length) continue;

    let entry = bagByParent.get(c.parent_sku);
    if (!entry) {
      entry = {
        sku: c.parent_sku,
        name: cleanPrintedName(c.product_name, c.parent_sku),
        size: c.size_volume,
        material: c.material,
        gsm: c.gsm != null ? Number(c.gsm) : null,
        colour: c.colour,
        casePack: c.units_per_case,
        market: c.market || "Exports", // untagged bags ship Exports
        ...cbmFields(cartonCbm(c)),
        bagType: (c.sub_category || "").replace(/^Customized\s+/i, "") || "Other",
        tiers: [],
      };
      bagByParent.set(c.parent_sku, entry);
    }
    entry.tiers.push({
      code: band,
      coverage: meta.coverage,
      colours: meta.colours,
      breaks,
    });
  }

  const printedGroups = new Map();
  for (const entry of bagByParent.values()) {
    entry.tiers.sort((a, b) => a.coverage - b.coverage);
    // Union of quantity breaks across tiers → table columns.
    const qty = new Set();
    for (const t of entry.tiers) for (const b of t.breaks) qty.add(b.minQty);
    entry.qtyBreaks = [...qty].sort((a, b) => a - b);
    const key = entry.bagType;
    if (!printedGroups.has(key)) printedGroups.set(key, []);
    printedGroups.get(key).push(entry);
  }
  const printedSections = buildSections(printedGroups, (a, b) => skuSort(a, b));

  const total = plainBags.length;
  const priced = plainBags.filter((b) => plainByProduct.has(b.id)).length;
  const printedTotal = bagByParent.size;
  return { sections, printedSections, total, priced, printedTotal };
}

// Order a Map<sub_category, rows[]> into the canonical section list.
function buildSections(groups, rowSort) {
  const ordered = [
    ...GROUP_ORDER,
    ...[...groups.keys()].filter((k) => !GROUP_ORDER.includes(k)),
  ];
  return ordered
    .filter((k) => groups.has(k))
    .map((k) => ({
      key: k,
      label: k,
      blurb: GROUP_BLURB[k] || null,
      rows: groups.get(k).sort(rowSort),
    }));
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

// Printed names carry an extra "- Printed 30% coverage / 2-colour" tail on top
// of the dimension/gsm noise — drop it before the shared cleanup.
function cleanPrintedName(name, sku) {
  if (!name) return sku;
  const base = name.split(/\s*-\s*Printed\b/i)[0];
  return cleanName(base, sku);
}

// ── Carton CBM ──────────────────────────────────────────────────────────────
// Per-carton volume in m³. Prefer the real carton size (`carton_dimensions`,
// stored as "L x W x H mm"); fall back to a geometry estimate when absent.
// Returns { cbm, est } — est=true flags the estimate so the UI can mark it "~".
function cartonCbm(b) {
  const fromDims = cbmFromCartonDims(b.carton_dimensions);
  if (fromDims != null) return { cbm: fromDims, est: false };
  const est = estimateCartonCbm(b);
  return est != null ? { cbm: est, est: true } : { cbm: null, est: false };
}

// Map the {cbm, est} result onto the render-row fields.
function cbmFields({ cbm, est }) {
  return { cartonCbm: cbm, cartonCbmEst: cbm != null ? est : false };
}

function cbmFromCartonDims(raw) {
  if (!raw) return null;
  const n = (String(raw).match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
  if (n.length < 3 || n.some((v) => !v)) return null;
  return round3((n[0] * n[1] * n[2]) / 1e9); // mm³ → m³
}

// Geometry estimate mirroring the calculator's approxBoxDimensions: bags lie
// flat, stacked to case pack; layer count varies by bag type. Coarse, hence "~".
function estimateCartonCbm(b) {
  const d = (b.size_volume?.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
  const gsm = Number(b.gsm), pack = Number(b.units_per_case);
  if (d.length < 3 || !gsm || !pack) return null;
  const [w, g, h] = d;
  const sub = b.sub_category || "";
  const folds = /SOS/i.test(sub) ? 4 : /handle|PTH|FHB/i.test(sub) ? 5 : 4;
  const perBagMm = (gsm / 1000) * folds * 1.6;
  const pad = 20;
  const L = h + pad;
  const W = w + g * 0.3 + pad;
  const D = perBagMm * pack + pad;
  return round3((L * W * D) / 1e9);
}

const round3 = (v) => Math.round(v * 1000) / 1000;

function bandFromSku(sku) {
  const m = sku.match(/-(P\d+)$/i);
  return m ? m[1].toUpperCase() : null;
}

function skuSort(a, b) {
  return a.sku.localeCompare(b.sku, undefined, { numeric: true });
}
