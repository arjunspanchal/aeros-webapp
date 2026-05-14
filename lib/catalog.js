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
import { dbSelect, dbDelete } from "./db/supabase.js";
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

function normalizeProduct(record) {
  const f = record.fields || {};
  const productName = f["Product Name"];
  if (!productName) return null;
  const product = {
    id: record.id,
    productName,
    sku: f["SKU"] || "",
    category: f["Category"] || "Other",
    subCategory: f["Sub-Category / Style"] || "",
    sizeVolume: f["Size / Volume"] || "",
    colour: f["Colour / Print"] || "",
    material: f["Material"] || "",
    gsm: typeof f["GSM"] === "number" ? f["GSM"] : null,
    wallType: f["Wall Type"] || "",
    coating: f["Coating"] || "",
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

export async function fetchCatalog() {
  const records = await airtableList("Products", { sort: [{ field: "Product Name", direction: "asc" }] });
  const products = records
    .map(normalizeProduct)
    .filter(Boolean)
    .map(attachLandedPrices)
    .map(stripPublicPricing);
  return attachLidCompatibility(products);
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
export function canManageCatalogue(session) {
  if (!session) return false;
  const factoryosRole = session.modules?.factoryos;
  const calculatorRole = session.modules?.calculator;
  if (factoryosRole === "customer") return false;
  if (calculatorRole === "client") return false;
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
  return records.map(normalizeAdmin);
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
  num("Price per Unit", "pricePerUnit");
  num("Price per Case", "pricePerCase");
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
