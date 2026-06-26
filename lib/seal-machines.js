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
    "Manual heat-seal machines that bond a pre-cut film lid onto PP, PET or paper cups — spill-proof closure for bubble tea, juices, coffee and dairy. One frame, four control tiers from basic energy control up to an export-grade build.",
  "Tub Sealer (Manual)":
    "Manual sealer set up for tubs and deli containers up to 1 L, and small cups to 250 ml — leak-proof film closure for curd, ice-cream, gravies and ready meals.",
  "Universal Sealer (Manual)":
    "One adjustable sealer that handles cups, tubs, dessert pots and meal boxes from 65–165 mm across — the flexible choice for kitchens running mixed packaging.",
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
    control: "Temperature controller + timer + buzzer",
  },
  "MACH-004": {
    variant: "CE Premium",
    frame: "Export frame",
    control: "In-house timer circuit, CE build",
  },
  "MACH-005": { variant: "Tub", frame: "Standard frame", control: "Manual seal" },
  "MACH-006": { variant: "V5 Universal", frame: "Adjustable frame", control: "Manual seal" },
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
