// Public AeroSeal cup/tub sealer rate sheet data. Reads `master_products`
// (category = "Machines") directly — unlike the consumable sheets these are
// capital equipment priced per unit, so the rate is stored straight on the
// product row (no quantity ladder, no v_product_pricing view).
//
// The displayed rate is `sell_price_inr` = the customer sell price, delivered
// within India (DDP, freight baked in) and EXCLUDING GST. Rows with no
// sell price yet render as "On request". INR is the quoting currency; USD is
// an indicative display conversion, matching the other sheets.

import { dbSelect } from "./db/supabase.js";

// Indicative INR→USD divisor for display only — matches the other sheets.
export const USD_PER_INR_DIVISOR = 95;

// Section order, keyed by the raw `sub_category`.
const GROUP_ORDER = [
  "Cup Sealer (Manual)",
  "Tub Sealer (Manual)",
  "Universal Sealer (Manual)",
];

const GROUP_LABEL = {
  "Cup Sealer (Manual)": "Cup Sealers",
  "Tub Sealer (Manual)": "Tub Sealers",
  "Universal Sealer (Manual)": "Universal Sealers",
};

const GROUP_CODE = {
  "Cup Sealer (Manual)": "Cup",
  "Tub Sealer (Manual)": "Tub",
  "Universal Sealer (Manual)": "Universal",
};

const GROUP_BLURB = {
  "Cup Sealer (Manual)":
    "Manual countertop hot-seal machines for beverage and sauce cups from 2 oz (60 ml) to 20 oz (600 ml). One frame, four control tiers — from basic energy control up to a digital-PID, timer-and-buzzer build and an export-grade CE model. Seals paper, PET and PP cups.",
  "Tub Sealer (Manual)":
    "Leak-proof sealing for successful food deliveries — tubs and deli containers up to 1 L, and cups down to 8 oz (250 ml). Stainless-steel 304 build, 1–5 second seal. For curd, ice-cream, gravies and ready meals.",
  "Universal Sealer (Manual)":
    "One machine for everything — an adjustable sealer that handles cups, tubs, dessert pots and meal boxes from 65 to 165 mm across, up to 4 lid formats at once, 8–10 cups a minute. Digital PID control, hot and cold.",
};

// Product media, hotlinked from the Aeros marketing site's own Vercel Blob CDN
// (aeros-x.com). URLs are content-addressed (immutable hash suffix), so they're
// stable — they can't be renamed, only deleted. Per-SKU still image where one
// exists; the demo videos are shared across a form, so they hang off the
// section (SECTION_VIDEO) not the card. Tub sealer has no marketing media yet.
const BLOB = "https://fdu0vqxj8cqurkpm.public.blob.vercel-storage.com/";

const IMAGE = {
  "MACH-001": BLOB + "aeroseal-cup-sealer-v1-1-9E4c1Vh3wWNBKIqjjlO01GMHhfcVFJ.png",
  "MACH-002": BLOB + "aeroseal-cup-sealer-v2-1-eLK74jeQZIkqPCfS2dwYDuuGMaUB0L.webp",
  "MACH-003": BLOB + "aeroseal-cup-sealer-v3-1-PaQPxLE5fcbGasUrdis7yi9RB49M2P.png",
  "MACH-004": BLOB + "aeroseal-cup-sealer-v4-1-lvFM5oSQD12bZdE1H10SQAPFj7y5qa.webp",
};

// Demo video per form (sub_category). Large files (~60–95 MB) — the browser
// lazy-loads them behind a "Watch demo" control, never on first paint.
const SECTION_VIDEO = {
  "Cup Sealer (Manual)": BLOB + "aeroseal-cup-sealer-4rbhUaG362ifgeltL2ZOD4FzvNT3KG.mp4",
  "Universal Sealer (Manual)": BLOB + "aeroseal-v5-PUqyKPGXVIAYFkmDkYWeRsHb8sXrJB.mp4",
};

// Curated spec line per SKU (from the 3MB build sheet). Keeps the rate sheet
// readable without bloating the product row.
const SPEC = {
  "MACH-001": { variant: "Entry", frame: "Standard frame", control: "Energy controller" },
  "MACH-002": {
    variant: "Analog Timer",
    frame: "Standard frame",
    control: "Energy controller + timer + buzzer",
  },
  "MACH-003": {
    variant: "Digital Control",
    frame: "Standard frame",
    control: "Digital PID temperature controller + timer + buzzer",
  },
  "MACH-004": {
    variant: "CE Premium",
    frame: "Export frame, CE build",
    control: "In-house timer circuit",
  },
  "MACH-005": { variant: "Tub", frame: "Stainless steel 304", control: "Manual, 1–5 s seal" },
  "MACH-006": {
    variant: "V5 Universal",
    frame: "Adjustable · 8–10 cups/min",
    control: "Digital PID · up to 4 lid formats",
  },
};

export async function fetchSealMachines() {
  const products = await dbSelect("master_products", {
    select:
      "sku,product_name,sub_category,size_volume,supplier,country_of_origin,carton_dimensions,gross_weight_kg,gst_percent,sell_price_inr",
    filter: { category: "eq.Machines" },
    order: "sku.asc",
  });
  if (products.length === 0) return { sections: [], total: 0, priced: 0 };

  const groups = new Map();
  let priced = 0;

  for (const item of products) {
    const sellInr = item.sell_price_inr != null ? Number(item.sell_price_inr) : null;
    if (sellInr != null) priced += 1;
    const spec = SPEC[item.sku] || {};

    const row = {
      sku: item.sku,
      name: cleanName(item.product_name),
      variant: spec.variant || null,
      frame: spec.frame || null,
      control: spec.control || null,
      range: item.size_volume || null,
      origin: item.country_of_origin || null,
      carton: item.carton_dimensions || null,
      weightKg: item.gross_weight_kg != null ? Number(item.gross_weight_kg) : null,
      gstPct: item.gst_percent != null ? Number(item.gst_percent) : 18,
      sellInr,
      image: IMAGE[item.sku] || null,
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
      video: SECTION_VIDEO[k] || null,
      rows: groups.get(k).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true })),
    }));

  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  return { sections, total, priced };
}

// "AeroSeal Cup Sealer - Entry (Manual)" → "Cup Sealer — Entry". Drop the
// brand (it's the whole sheet) and the trailing "(Manual)".
function cleanName(name) {
  if (!name) return "";
  return String(name)
    .replace(/\bAeroSeal\s*/i, "")
    .replace(/\s*\(Manual\)\s*$/i, "")
    .replace(/\s*-\s*/g, " — ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
