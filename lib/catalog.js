// Server-side helper for the fresh product catalog. Reads + writes go to
// Supabase `master_products`. Image attachments are not yet wired (zero
// images in source data); attachProductPhoto / removeProductPhoto are
// preserved as no-ops for back-compat.

import { ROLES } from "./factoryos/constants.js";
import {
  airtableList,
  airtableGet,
  airtableCreate,
  airtableUpdate,
  airtableDelete,
  airtableUploadAttachment,
} from "./db/airtableShim.js";
import { dbSelect, dbInsert, dbUpdate, dbDelete, findOne } from "./db/supabase.js";
import { deleteFromBucket } from "./db/storage.js";
import { computeLandedPrices } from "./catalog/landed-prices.js";

const WHATSAPP_NUMBER = "917977007497";
const EMAIL_ADDRESS = "clearance@aeros-x.com";

// Pricing is intentionally omitted from inquiry templates — the public
// catalogue is "Price on request"; pricing only lives in /catalog/manage
// for admins and on rate cards for specific customers.
function buildWhatsAppUrl(product) {
  const msg = `Hi, I'm interested in this product from Aeros — ${product.productName} (SKU: ${product.sku}) — Category: ${product.category} — Size: ${product.sizeVolume || "N/A"} — Could you share pricing and more details?`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

function buildEmailUrl(product) {
  const subject = `Product Inquiry: ${product.productName} (${product.sku})`;
  const body = `Hi,\n\nI'm interested in the following product from your catalog:\n\nProduct: ${product.productName}\nSKU: ${product.sku}\nCategory: ${product.category}\nSize: ${product.sizeVolume || "N/A"}\n\nCould you please share pricing and availability?\n\nThanks`;
  return `mailto:${EMAIL_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function normalizeImages(field) {
  if (!Array.isArray(field)) return [];
  return field.map((a) => ({
    id: a.id,
    url: a.url,
    thumbnailUrl: a.thumbnails?.small?.url || a.url,
    largeUrl: a.thumbnails?.large?.url || a.url,
    filename: a.filename || "",
    size: typeof a.size === "number" ? a.size : null,
    type: a.type || "",
  }));
}

// Compact "size" label used as a facet filter. Pulls the volume/diameter
// portion out of size_volume so chips read "200ml", "12oz / 400ml",
// "Ø 98 mm" instead of the long "200ml | 73 x 51 x 78 mm (TD x BD x H)".
//   • Cups / tubs / boxes — text before "|"
//   • Lids round / square — full size_volume (already compact)
//   • Bags — strip trailing "(W x G x H)" annotation
function deriveSizeLabel(sizeVolume) {
  if (!sizeVolume) return "";
  if (sizeVolume.includes("|")) return sizeVolume.split("|")[0].trim();
  return sizeVolume.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// Lid manufacturing process — derived from the "- TF" / "- IM" marker in
// the product name. Only meaningful for the Lids category; everything
// else returns "" so it never surfaces as a facet on cups, bags, etc.
// If lid naming ever drifts from "<size> <type> Lid - TF|IM (qualifier)",
// promote this to a real master_products column instead.
function deriveLidProcess(category, productName) {
  if (category !== "Lids" || !productName) return "";
  const m = productName.match(/\b(TF|IM)\b/);
  return m ? m[1] : "";
}

// Wrapping facet — only meaningful for categories where
// individually-wrapped vs bulk is a real choice (paper straws today;
// expand the set if utensils, etc. ever ship in both forms). Treats
// null/false on Paper Straws as "Unwrapped" because legacy bulk SKUs
// were created before `individually_wrapped` was populated.
const WRAPPING_AWARE = new Set(["Paper Straws"]);
function deriveWrapping(category, individuallyWrapped) {
  if (!WRAPPING_AWARE.has(category)) return "";
  return individuallyWrapped === true ? "Wrapped" : "Unwrapped";
}

function normalizeProduct(record) {
  const f = record.fields || {};
  const productName = f["Product Name"];
  if (!productName) return null;
  const sizeVolume = f["Size / Volume"] || "";
  const category = f["Category"] || "Other";
  const product = {
    id: record.id,
    productName,
    sku: f["SKU"] || "",
    category,
    subCategory: f["Sub-Category / Style"] || "",
    sizeVolume,
    sizeLabel: deriveSizeLabel(sizeVolume),
    lidProcess: deriveLidProcess(category, productName),
    wrapping: deriveWrapping(category, f["Individually Wrapped"]),
    individuallyWrapped: typeof f["Individually Wrapped"] === "boolean" ? f["Individually Wrapped"] : null,
    colour: f["Colour / Print"] || "",
    material: f["Material"] || "",
    gsm: typeof f["GSM"] === "number" ? f["GSM"] : null,
    wallType: f["Wall Type"] || "",
    coating: f["Coating"] || "",
    // Wall-specific GSM/coating split. For DW cups: sidewall = inner
    // (drink-contact, food-grade white cup stock), outer = decorative wrap.
    // SW cups have only sidewall set; outer is null.
    sidewallGsm: typeof f["Sidewall GSM"] === "number" ? f["Sidewall GSM"] : null,
    sidewallCoating: f["Sidewall Coating"] || "",
    outerWallGsm: typeof f["Outer Wall GSM"] === "number" ? f["Outer Wall GSM"] : null,
    outerWallCoating: f["Outer Wall Coating"] || "",
    bottomGsm: typeof f["Bottom GSM"] === "number" ? f["Bottom GSM"] : null,
    bottomCoating: f["Bottom Coating"] || "",
    unitsPerCase: typeof f["Units per Case"] === "number" ? f["Units per Case"] : null,
    casesPerPallet: typeof f["Cases per Pallet"] === "number" ? f["Cases per Pallet"] : null,
    pricePerUnit: typeof f["Price per Unit"] === "number" ? f["Price per Unit"] : null,
    pricePerCase: typeof f["Price per Case"] === "number" ? f["Price per Case"] : null,
    cartonDimensions: f["Carton Dimensions (mm)"] || "",
    // Weights — used to compute landed-USD pricing for export inquiries.
    // Catalog rows usually carry gross_weight_kg; item_weight_g is sparser.
    grossWeightKg: typeof f["Gross Weight (kg)"] === "number" ? f["Gross Weight (kg)"] : null,
    netWeightKg: typeof f["Net Weight (kg)"] === "number" ? f["Net Weight (kg)"] : null,
    itemWeightG: typeof f["Item Weight (g)"] === "number" ? f["Item Weight (g)"] : null,
    topDiameter: typeof f["Top Diameter (mm)"] === "number" ? f["Top Diameter (mm)"] : null,
    bottomDiameter: typeof f["Bottom Diameter (mm)"] === "number" ? f["Bottom Diameter (mm)"] : null,
    heightMm: typeof f["Height (mm)"] === "number" ? f["Height (mm)"] : null,
    printMoqUnits: typeof f["Print MOQ (units)"] === "number" ? f["Print MOQ (units)"] : null,
    supplier: f["Supplier / Manufacturer"] || "",
    notes: f["Notes"] || "",
    images: normalizeImages(f["Image"]),
  };
  product.whatsappUrl = buildWhatsAppUrl(product);
  product.emailUrl = buildEmailUrl(product);
  return product;
}

// Public catalogue fetcher. Each product gets an indicative landed-INR and
// landed-USD price pinned on (`landed.landedInrFormatted` / `landed.
// landedUsdFormatted`) so cards can render both. Raw `pricePerCase` is
// stripped — only per-unit pricing surfaces publicly, and only via the
// formatted landed object so we don't accidentally leak case multiples.
function stripPublicPricing(p) {
  if (!p) return p;
  const { pricePerCase, ...rest } = p;
  void pricePerCase;
  return rest;
}

function attachLandedPrices(p) {
  if (!p) return p;
  return { ...p, landed: computeLandedPrices(p) };
}

// Pull tiered pricing rows from master_product_pricing in a single batched
// query and attach `pricingTiers: [...]` to each product (matched by SKU).
// Tiers are the new source of truth for sell rates (plain + custom_branded);
// the legacy master_products.price_per_unit / price_per_case columns will be
// dropped once all callers consume this array.
async function attachPricingTiers(products) {
  if (!Array.isArray(products) || products.length === 0) return products;
  let rows;
  try {
    rows = await dbSelect("master_product_pricing", {
      select:
        "id,offering_type,min_qty,incoterm,purchase_inr,price_inr,price_usd,fob_india_inr,fob_india_usd,india_landed_inr,usa_landed_usd,target_margin_pct,notes,master_products(sku,parent_sku)",
      order: "min_qty.asc",
    });
  } catch {
    return products.map((p) => ({ ...p, pricingTiers: [] }));
  }
  const bySku = new Map();
  // Child SKUs (like *-CUST) carry their printed pricing on their own product_id.
  // We ALSO surface those rows under the parent SKU so the parent's detail page
  // shows the full Plain + Printed ladder without losing the "separate SKUs"
  // structure. Keyed by parent_sku → list of normalized tier objects.
  const childRowsByParent = new Map();
  for (const r of rows) {
    const sku = r.master_products?.sku;
    const parentSku = r.master_products?.parent_sku || null;
    if (!sku) continue;
    const normalized = {
      id: r.id,
      offeringType: r.offering_type,
      minQty: r.min_qty,
      incoterm: r.incoterm || null,
      purchaseInr: r.purchase_inr != null ? Number(r.purchase_inr) : null,
      priceInr: r.price_inr != null ? Number(r.price_inr) : null,
      priceUsd: r.price_usd != null ? Number(r.price_usd) : null,
      fobIndiaInr: r.fob_india_inr != null ? Number(r.fob_india_inr) : null,
      fobIndiaUsd: r.fob_india_usd != null ? Number(r.fob_india_usd) : null,
      indiaLandedInr: r.india_landed_inr != null ? Number(r.india_landed_inr) : null,
      usaLandedUsd: r.usa_landed_usd != null ? Number(r.usa_landed_usd) : null,
      targetMarginPct: r.target_margin_pct != null ? Number(r.target_margin_pct) : null,
      notes: r.notes || "",
      sourceSku: sku, // useful when the row was mirrored from a child SKU
    };
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(normalized);
    if (parentSku) {
      if (!childRowsByParent.has(parentSku)) childRowsByParent.set(parentSku, []);
      childRowsByParent.get(parentSku).push(normalized);
    }
  }
  for (const p of products) {
    const ownRows = (p.sku && bySku.get(p.sku)) || [];
    const childRows = (p.sku && childRowsByParent.get(p.sku)) || [];
    p.pricingTiers = [...ownRows, ...childRows];
    // Back-compat shim — `pricePerUnit` used to be the lowest plain EXW Aeros.
    // Under the new "show price with margin only" rule, customers see one number:
    // India DDP × (1 + target_margin_pct/100). Compute that here so downstream
    // surfaces (landed-prices calc, ProductCard, calculators) all show the
    // margin-included rate without each one re-implementing the formula.
    const lowestPlain = p.pricingTiers
      .filter((t) => t.offeringType === "plain" && t.indiaLandedInr != null)
      .sort((a, b) => (a.minQty || 0) - (b.minQty || 0))[0];
    if (lowestPlain) {
      const margin = lowestPlain.targetMarginPct ?? 0;
      p.pricePerUnit = Math.round(lowestPlain.indiaLandedInr * (1 + margin / 100) * 100) / 100;
    } else {
      p.pricePerUnit = null;
    }
  }
  return products;
}

export async function fetchCatalog() {
  const records = await airtableList("Products", { sort: [{ field: "Product Name", direction: "asc" }] });
  const products = records.map(normalizeProduct).filter(Boolean);
  // Tiers MUST attach before landed-price computation — the landed calc
  // reads p.pricePerUnit, which attachPricingTiers now derives from the
  // lowest-MOQ plain tier (legacy price_per_unit column was dropped).
  await attachPricingTiers(products);
  for (const p of products) {
    p.landed = computeLandedPrices(p);
    delete p.pricePerCase; // back-compat: never existed publicly anyway
  }
  return attachLidCompatibility(products);
}

// Slim catalog for product PICKERS (job editor, new-job form, rate-card
// item form). fetchCatalog() goes through the airtable shim, whose
// Products.toAirtable fires one photos query PER ROW — ~600 round trips
// per call — plus pricing tiers and landed-price math the pickers never
// read. This fetches the 7 picker fields in ONE query. Returns the same
// public id shape the shim would (airtable_id when present, else uuid)
// so masterSku/productId resolution keeps working against saved jobs.
//
// `specFields: true` widens the same single query with the 6 spec columns
// the rate-card item form pre-fills from (sub-category, wall type, coating,
// units/case, carton dims, colour). Off by default so the job-editor pages
// keep their minimal client payload.
export async function fetchCatalogLite({ specFields = false } = {}) {
  const rows = await dbSelect("master_products", {
    select:
      "id,airtable_id,product_name,sku,category,size_volume,gsm,material" +
      (specFields ? ",sub_category,wall_type,coating,units_per_case,carton_dimensions,colour" : ""),
    order: "product_name.asc",
    range: "0-9999",
  });
  return rows
    .filter((r) => r.product_name)
    .map((r) => {
      const p = {
        id: r.airtable_id || r.id,
        productName: r.product_name,
        sku: r.sku || "",
        category: r.category || "Other",
        sizeVolume: r.size_volume || "",
        gsm: typeof r.gsm === "number" ? r.gsm : null,
        material: r.material || "",
      };
      if (specFields) {
        p.subCategory = r.sub_category || "";
        p.wallType = r.wall_type || "";
        p.coating = r.coating || "";
        p.unitsPerCase = typeof r.units_per_case === "number" ? r.units_per_case : null;
        p.cartonDimensions = r.carton_dimensions || "";
        p.colour = r.colour || "";
      }
      return p;
    });
}

// Catalog for the chat assistant's searchCatalog tool. The tool only reads
// the lite spec fields plus pricePerUnit, which attachPricingTiers derives
// from the lowest-MOQ plain tier — so this is two queries total
// (master_products + master_product_pricing) instead of the ~600 per-product
// photo round trips fetchCatalog incurs via the airtable shim on every
// lambda cold start.
export async function fetchCatalogChat() {
  const products = await fetchCatalogLite({ specFields: true });
  return attachPricingTiers(products);
}

// Single-product fetcher for the public detail page. Builds the full
// catalogue (sub-second; gives us `compatibleWith` enrichment for lids)
// and picks out the one matching id. Returns null when not found so the
// detail route can render notFound().
export async function fetchCatalogProductById(id) {
  if (!id) return null;
  const products = await fetchCatalog();
  return products.find((p) => p.id === id) || null;
}

// Round-lid → cup compatibility. Derives a `compatibleWith` array on each
// round-lid product so the catalogue can surface which cups/tubs/bowls the
// lid fits. Twin lids ("Ø 73/75 mm") match both rim sizes.
const LID_FITTING_CATEGORIES = new Set([
  "Paper Cups",
  "PET Cups",
  "Paper Tubs",
  "Salad Bowls",
  "Ice Cream Tubs",
]);

function parseLidDiameters(product) {
  if (product.category !== "Lids") return null;
  if (!product.sizeVolume || !product.sizeVolume.includes("Ø")) return null;
  const out = new Set();
  if (typeof product.topDiameter === "number") out.add(product.topDiameter);
  const match = product.sizeVolume.match(/Ø\s*([\d/\s]+?)\s*mm/i);
  if (match) {
    for (const part of match[1].split("/")) {
      const n = Number.parseInt(part.trim(), 10);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return out.size ? Array.from(out) : null;
}

function attachLidCompatibility(products) {
  const byDiameter = new Map();
  for (const p of products) {
    if (!LID_FITTING_CATEGORIES.has(p.category)) continue;
    if (typeof p.topDiameter !== "number") continue;
    if (!byDiameter.has(p.topDiameter)) byDiameter.set(p.topDiameter, []);
    byDiameter.get(p.topDiameter).push(p);
  }
  for (const p of products) {
    const diameters = parseLidDiameters(p);
    if (!diameters) continue;
    const seen = new Map();
    for (const d of diameters) {
      for (const c of byDiameter.get(d) || []) seen.set(c.id, c);
    }
    if (seen.size) {
      p.compatibleWith = Array.from(seen.values()).map((c) => ({
        id: c.id,
        sku: c.sku,
        productName: c.productName,
        category: c.category,
        sizeVolume: c.sizeVolume,
      }));
    }
  }
  return products;
}

// Internal version that keeps pricing intact. Not exposed via any public
// API — admin-gated callers only (e.g. /catalog/manage uses listCatalogAdmin
// further down which has its own auth gate).
export async function fetchCatalogWithPricing() {
  const records = await airtableList("Products", { sort: [{ field: "Product Name", direction: "asc" }] });
  return records.map(normalizeProduct).filter(Boolean);
}

export function getCatalogCategories(products) {
  const set = new Set();
  for (const p of products) if (p.category) set.add(p.category);
  return Array.from(set).sort();
}

// ---------- Admin ----------
// Catalog management is gated on the FactoryOS role. A user's Calculator
// role is a separate axis — a Factory Manager who also receives quotes via
// the calculator (calculator_role = "client") is still legitimate staff and
// must keep their catalog access. Only an explicit FactoryOS "customer"
// role rules them out of staff-only screens.
export function canManageCatalogue(session) {
  if (!session) return false;
  const factoryosRole = session.modules?.factoryos;
  if (factoryosRole === "customer") return false;
  if (session.isAdmin) return true;
  return (
    factoryosRole === ROLES.ADMIN ||
    factoryosRole === ROLES.FACTORY_MANAGER ||
    factoryosRole === ROLES.FACTORY_EXECUTIVE ||
    factoryosRole === ROLES.ACCOUNT_MANAGER
  );
}

function normalizeAdmin(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    productName: f["Product Name"] || "",
    sku: f["SKU"] || "",
    category: f["Category"] || "",
    subCategory: f["Sub-Category / Style"] || "",
    sizeVolume: f["Size / Volume"] || "",
    colour: f["Colour / Print"] || "",
    material: f["Material"] || "",
    gsm: typeof f["GSM"] === "number" ? f["GSM"] : null,
    wallType: f["Wall Type"] || "",
    coating: f["Coating"] || "",
    // Wall-specific GSM/coating split. For DW cups: sidewall = inner
    // (drink-contact, food-grade white cup stock), outer = decorative wrap.
    // SW cups have only sidewall set; outer is null.
    sidewallGsm: typeof f["Sidewall GSM"] === "number" ? f["Sidewall GSM"] : null,
    sidewallCoating: f["Sidewall Coating"] || "",
    outerWallGsm: typeof f["Outer Wall GSM"] === "number" ? f["Outer Wall GSM"] : null,
    outerWallCoating: f["Outer Wall Coating"] || "",
    bottomGsm: typeof f["Bottom GSM"] === "number" ? f["Bottom GSM"] : null,
    bottomCoating: f["Bottom Coating"] || "",
    unitsPerCase: typeof f["Units per Case"] === "number" ? f["Units per Case"] : null,
    casesPerPallet: typeof f["Cases per Pallet"] === "number" ? f["Cases per Pallet"] : null,
    pricePerUnit: typeof f["Price per Unit"] === "number" ? f["Price per Unit"] : null,
    pricePerCase: typeof f["Price per Case"] === "number" ? f["Price per Case"] : null,
    cartonDimensions: f["Carton Dimensions (mm)"] || "",
    topDiameter: typeof f["Top Diameter (mm)"] === "number" ? f["Top Diameter (mm)"] : null,
    bottomDiameter: typeof f["Bottom Diameter (mm)"] === "number" ? f["Bottom Diameter (mm)"] : null,
    heightMm: typeof f["Height (mm)"] === "number" ? f["Height (mm)"] : null,
    printMoqUnits: typeof f["Print MOQ (units)"] === "number" ? f["Print MOQ (units)"] : null,
    supplier: f["Supplier / Manufacturer"] || "",
    notes: f["Notes"] || "",
    images: normalizeImages(f["Image"]),
  };
}

export async function listCatalogAdmin() {
  const records = await airtableList("Products", { sort: [{ field: "Product Name", direction: "asc" }] });
  const products = records.map(normalizeAdmin);
  await attachPricingTiers(products);
  return products;
}

function toAirtableFields(draft) {
  const out = {};
  const text = (k, key) => {
    if (draft[key] !== undefined) out[k] = draft[key] === "" ? null : draft[key];
  };
  const num = (k, key) => {
    if (draft[key] !== undefined) {
      const v = draft[key];
      out[k] = v === "" || v === null ? null : Number(v);
    }
  };
  text("Product Name", "productName");
  text("SKU", "sku");
  text("Category", "category");
  text("Sub-Category / Style", "subCategory");
  text("Size / Volume", "sizeVolume");
  text("Colour / Print", "colour");
  text("Material", "material");
  num("GSM", "gsm");
  text("Wall Type", "wallType");
  text("Coating", "coating");
  num("Units per Case", "unitsPerCase");
  num("Cases per Pallet", "casesPerPallet");
  // Legacy price columns intentionally NOT written here — sell rates now
  // live in master_product_pricing and are edited via the dedicated tier
  // API. The price_per_unit / price_per_case columns are deprecated and
  // will be dropped once all stale callers are migrated.
  text("Carton Dimensions (mm)", "cartonDimensions");
  num("Top Diameter (mm)", "topDiameter");
  num("Bottom Diameter (mm)", "bottomDiameter");
  num("Height (mm)", "heightMm");
  num("Print MOQ (units)", "printMoqUnits");
  text("Supplier / Manufacturer", "supplier");
  text("Notes", "notes");
  return out;
}

export async function updateProduct(id, draft) {
  const rec = await airtableUpdate("Products", id, toAirtableFields(draft));
  return normalizeAdmin(rec);
}

export async function createProduct(draft) {
  const rec = await airtableCreate("Products", toAirtableFields(draft));
  return normalizeAdmin(rec);
}

export async function deleteProduct(id) {
  return airtableDelete("Products", id);
}

export async function getProductById(id) {
  const rec = await airtableGet("Products", id);
  return rec ? normalizeAdmin(rec) : null;
}

// ---------- Pricing tier CRUD ----------
// Tiers live in `master_product_pricing`. Edits go through these helpers
// rather than the legacy single-row price columns (price_per_unit etc.).

function tierToCamel(r) {
  if (!r) return null;
  return {
    id: r.id,
    offeringType: r.offering_type,
    minQty: r.min_qty,
    incoterm: r.incoterm || null,
    priceInr: r.price_inr != null ? Number(r.price_inr) : null,
    priceUsd: r.price_usd != null ? Number(r.price_usd) : null,
    fobIndiaInr: r.fob_india_inr != null ? Number(r.fob_india_inr) : null,
    fobIndiaUsd: r.fob_india_usd != null ? Number(r.fob_india_usd) : null,
    indiaLandedInr: r.india_landed_inr != null ? Number(r.india_landed_inr) : null,
    usaLandedUsd: r.usa_landed_usd != null ? Number(r.usa_landed_usd) : null,
    notes: r.notes || "",
  };
}

function numOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function tierDraftToRow(draft) {
  const row = {};
  if (draft.offeringType !== undefined) row.offering_type = draft.offeringType || "plain";
  if (draft.minQty !== undefined) row.min_qty = Number(draft.minQty);
  if (draft.incoterm !== undefined) row.incoterm = draft.incoterm || null;
  if (draft.priceInr !== undefined) row.price_inr = numOrNull(draft.priceInr);
  if (draft.priceUsd !== undefined) row.price_usd = numOrNull(draft.priceUsd);
  if (draft.fobIndiaInr !== undefined) row.fob_india_inr = numOrNull(draft.fobIndiaInr);
  if (draft.fobIndiaUsd !== undefined) row.fob_india_usd = numOrNull(draft.fobIndiaUsd);
  if (draft.indiaLandedInr !== undefined) row.india_landed_inr = numOrNull(draft.indiaLandedInr);
  if (draft.usaLandedUsd !== undefined) row.usa_landed_usd = numOrNull(draft.usaLandedUsd);
  if (draft.notes !== undefined) row.notes = draft.notes || null;
  return row;
}

// Convert publicId (recXXX or UUID) to the PG UUID master_products.id —
// master_product_pricing.product_id is a hard FK to UUID, so we always need
// the UUID side even when callers passed an Airtable rec id.
async function resolveProductPgId(publicProductId) {
  const row = await findOne("master_products", publicProductId, "id");
  return row?.id ?? null;
}

export async function createPricingTier(publicProductId, draft) {
  const pgId = await resolveProductPgId(publicProductId);
  if (!pgId) throw new Error("Product not found");
  const row = tierDraftToRow(draft);
  row.product_id = pgId;
  if (!row.offering_type) row.offering_type = "plain";
  if (!Number.isFinite(row.min_qty) || row.min_qty <= 0) {
    throw new Error("Minimum quantity (min_qty) must be a positive number");
  }
  const inserted = await dbInsert("master_product_pricing", row);
  return tierToCamel(inserted);
}

export async function updatePricingTier(tierId, draft) {
  if (!tierId) throw new Error("Missing tier id");
  const patch = tierDraftToRow(draft);
  patch.updated_at = new Date().toISOString();
  const updated = await dbUpdate("master_product_pricing", "id", tierId, patch);
  return tierToCamel(updated);
}

export async function deletePricingTier(tierId) {
  if (!tierId) throw new Error("Missing tier id");
  await dbDelete("master_product_pricing", "id", tierId);
  return { ok: true };
}

// Image attachments. Mirrors the clearance pattern: upload to a public bucket
// (`catalog-photos`) via the airtable shim, which inserts a row in the
// `master_product_photos` join table. Removal looks the row up by its PG id
// (which is what the shim surfaces as the public attachment id) and deletes
// the object from storage plus the join row.
export async function attachProductPhoto({ productId, contentType, filename, fileBase64 }) {
  return airtableUploadAttachment(productId, "Photos", { contentType, filename, fileBase64 });
}

export async function removeProductPhoto(productId, attachmentId) {
  const photo = (
    await dbSelect("master_product_photos", {
      select: "storage_path",
      filter: { id: `eq.${attachmentId}` },
      limit: 1,
    })
  )[0];
  if (photo?.storage_path) {
    try { await deleteFromBucket("catalog-photos", photo.storage_path); } catch {}
  }
  await dbDelete("master_product_photos", "id", attachmentId);
  return getProductById(productId);
}
