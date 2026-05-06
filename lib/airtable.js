// Server-side clearance-inventory fetcher. Reads from Supabase
// `clearance_items` + `clearance_item_photos`. Photos served as public URLs
// from the `clearance-photos` bucket.
//
// Returns the same UI-shaped objects the existing /clearance page expects;
// no caller changes needed.

import { dbSelect } from "./db/supabase.js";
import { publicStorageUrl } from "./db/storage.js";

const WHATSAPP_NUMBER = "917977007497";
const EMAIL_ADDRESS = "clearance@aeros-x.com";

function buildWhatsAppUrl(item) {
  const msg = `Hi, I'm interested in this item from Aeros Clearance Stock — Item: ${item.itemName} — Brand: ${item.brand} — Category: ${item.category} — Stock available: ${item.stockQuantity ?? "TBC"} ${item.unit} — Could you share more details and pricing?`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

function buildEmailUrl(item) {
  const subject = `Inquiry: ${item.itemName}`;
  const body = `Hi, I'm interested in this item from your clearance stock — Item: ${item.itemName} — Brand: ${item.brand} — Category: ${item.category} — Stock available: ${item.stockQuantity ?? "TBC"} ${item.unit} — Please share more details and pricing. Thanks`;
  return `mailto:${EMAIL_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Fetch every record from the clearance_items table, plus the first photo
 * per item (if any). Returns the dedup'd, branded-line-filtered list the
 * /clearance page expects.
 */
export async function fetchInventory() {
  const items = await dbSelect("clearance_items", {
    select: "id,airtable_id,item_name,brand,category,stock_quantity,unit,case_pack,price,description,specifications,status,clearance_item_photos(storage_path,sort_order)",
    order: "item_name.asc",
    range: "0-9999",
  });

  const normalized = items.map(normalizeRow).filter(Boolean);
  const BRANDED = new Set(["Chuk"]);
  const plainOnly = normalized.filter((item) => !BRANDED.has(item.brand));
  return deduplicateByName(plainOnly);
}

// Hand-curated aliases — ripple cups are paper cups; legacy / typo'd
// labels collapse to the canonical name. Keys MUST be lowercase since the
// lookup is case-insensitive. Add new aliases here when the merch list
// drifts again.
const CATEGORY_ALIASES = {
  "ripple cup":  "Paper Cup",
  "ripple cups": "Paper Cup",
  // "paper cup" and "Paper Cup" auto-collapse via title-casing below; no
  // alias entry needed for plain case differences.
};

// Normalise a raw category string so dropdown + filter agree:
//   1. Trim and collapse internal whitespace.
//   2. Title-case each word so "paper Cup" === "Paper Cup".
//   3. Apply the hand-curated alias map for legitimate merges
//      (e.g. Ripple Cup → Paper Cup).
// Words that are already all-caps acronyms (PET, PP) stay as-is.
function normalizeCategory(raw) {
  const cleaned = String(raw || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const aliased = CATEGORY_ALIASES[cleaned.toLowerCase()];
  if (aliased) return aliased;
  return cleaned
    .split(" ")
    .map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function normalizeRow(row) {
  if (!row.item_name) return null;
  const photos = Array.isArray(row.clearance_item_photos) ? row.clearance_item_photos : [];
  const firstPhoto = photos.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
  const item = {
    id: row.airtable_id || row.id,
    itemName: row.item_name,
    brand: row.brand || "",
    category: normalizeCategory(row.category) || "Other",
    stockQuantity: typeof row.stock_quantity === "number" ? row.stock_quantity : null,
    unit: row.unit || "pcs",
    casePack: typeof row.case_pack === "number" ? row.case_pack : null,
    price: typeof row.price === "number" ? row.price : null,
    description: row.description || "",
    specifications: row.specifications || "",
    status: row.status || "Available",
    photoUrl: firstPhoto ? publicStorageUrl("clearance-photos", firstPhoto.storage_path) : null,
  };
  item.whatsappUrl = buildWhatsAppUrl(item);
  item.emailUrl = buildEmailUrl(item);
  return item;
}

// Merge records that share the same item name. Stock quantities sum; first
// non-null wins for casePack/price; first non-empty/non-Other wins for brand+category.
// Order-independent so the result is deterministic.
function deduplicateByName(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.itemName.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const existing = map.get(key);
      if (item.stockQuantity !== null || existing.stockQuantity !== null) {
        existing.stockQuantity = (existing.stockQuantity ?? 0) + (item.stockQuantity ?? 0);
      }
      if (!existing.photoUrl && item.photoUrl) existing.photoUrl = item.photoUrl;
      if (existing.price == null && item.price != null) existing.price = item.price;
      const existingPack = existing.casePack ?? 0;
      const incomingPack = item.casePack ?? 0;
      if (incomingPack > existingPack) existing.casePack = item.casePack;
      if (!existing.brand && item.brand) existing.brand = item.brand;
      if ((existing.category === "Other" || !existing.category) && item.category && item.category !== "Other") {
        existing.category = item.category;
      }
    }
  }
  return Array.from(map.values()).map((item) => {
    item.whatsappUrl = buildWhatsAppUrl(item);
    item.emailUrl = buildEmailUrl(item);
    return item;
  });
}

export function getCategories(items) {
  const set = new Set();
  for (const item of items) if (item.category) set.add(item.category);
  return Array.from(set).sort();
}
