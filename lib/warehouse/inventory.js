// WarehouseOS — master inventory data layer.
// All reads/writes go through Supabase REST via lib/db/supabase.js.

import { dbSelect, dbInsert, dbUpdate } from "../db/supabase.js";
import { ROLES } from "../factoryos/constants.js";
import { normalizePhoto } from "./itemPhotos.js";

// Item-shaped row + nested photos array. Mirrors the clearance pattern:
// embedded photos so the items table can render thumbnails without a
// follow-up fetch. Photos are sorted by sort_order ASC then created_at ASC
// (PostgREST embeds preserve order from the embed clause).
function normalizeItem(row) {
  if (!row) return null;
  const photoRows = Array.isArray(row.inventory_item_photos) ? row.inventory_item_photos : [];
  const photos = photoRows
    .slice()
    .sort((a, b) => {
      const sa = a.sort_order ?? 0, sb = b.sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    })
    .map(normalizePhoto)
    .filter(Boolean);
  // Strip the embed key from the public shape; expose `photos` instead.
  const { inventory_item_photos: _omit, ...rest } = row;
  return { ...rest, photos };
}

// Match canManageClearance — same staff set runs WarehouseOS.
export function canManageInventory(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const role = session.modules?.factoryos;
  return role === ROLES.FACTORY_MANAGER || role === ROLES.FACTORY_EXECUTIVE;
}

export const SOURCE_OPTIONS = ["FG", "RM", "Clearance", "Other"];
export const UOM_OPTIONS    = ["pcs", "kg", "sheets", "box", "roll", "set"];

// ---------- Items master --------------------------------------------------

export async function listItems({
  search = "",
  source = "",
  needsReview = false,
  includeInactive = false,
} = {}) {
  const filter = {};
  if (source) filter.source = `eq.${source}`;
  if (needsReview) filter.needs_review = `eq.true`;
  if (!includeInactive) filter.is_active = `eq.true`;

  const rows = await dbSelect("inventory_items", {
    select:
      "id,sku,name,category,brand,uom,case_pack,source,brand_customer,parent_sku,needs_review,avg_cost,gsm,rm_form,rm_type,clearance_item_id,is_active,notes,created_at,updated_at,created_by,updated_by," +
      "inventory_item_photos(id,storage_path,filename,content_type,size_bytes,sort_order,created_at)",
    filter,
    order: "sku.asc",
    limit: 5000,
  });

  const normalized = rows.map(normalizeItem).filter(Boolean);
  if (!search) return normalized;
  const q = search.toLowerCase();
  return normalized.filter(
    (r) =>
      (r.sku || "").toLowerCase().includes(q) ||
      (r.name || "").toLowerCase().includes(q) ||
      (r.brand || "").toLowerCase().includes(q) ||
      (r.brand_customer || "").toLowerCase().includes(q),
  );
}

export async function getItem(id) {
  const rows = await dbSelect("inventory_items", {
    select: "*,inventory_item_photos(id,storage_path,filename,content_type,size_bytes,sort_order,created_at)",
    filter: { id: `eq.${id}` },
    limit: 1,
  });
  return normalizeItem(rows[0]) || null;
}

// Plain SKUs only — branded variants must come from a FactoryOS push so the
// parent_sku/brand_customer linkage is correct.
export async function createItem(fields, userEmail) {
  const sku = (fields.sku || "").trim();
  const name = (fields.name || "").trim();
  if (!sku) throw new Error("SKU is required");
  if (!name) throw new Error("Name is required");
  if (fields.brand_customer)
    throw new Error("Branded variants must be created via FactoryOS push, not the warehouse UI");

  const row = {
    sku,
    name,
    category: fields.category || null,
    brand: fields.brand || null,
    uom: fields.uom || "pcs",
    case_pack: numOrNull(fields.case_pack),
    source: fields.source || "FG",
    gsm: numOrNull(fields.gsm),
    rm_form: fields.rm_form || null,
    rm_type: fields.rm_type || null,
    clearance_item_id: fields.clearance_item_id || null,
    notes: fields.notes || null,
    created_by: userEmail || null,
    updated_by: userEmail || null,
  };
  const inserted = await dbInsert("inventory_items", row);
  // Freshly-created items have no photos; stamp explicitly so the UI shape is
  // consistent with listItems / getItem (which include `photos: []`).
  return { ...inserted, photos: [] };
}

export async function updateItem(id, fields, userEmail) {
  const patch = { updated_by: userEmail || null, updated_at: new Date().toISOString() };
  // Whitelist editable fields. SKU stays immutable once set (it's the public
  // identifier and may be referenced from movements / barcode labels).
  for (const k of [
    "name", "category", "brand", "uom", "case_pack", "source",
    "gsm", "rm_form", "rm_type", "clearance_item_id", "notes",
    "is_active", "needs_review",
  ]) {
    if (fields[k] !== undefined) patch[k] = fields[k] === "" ? null : fields[k];
  }
  // Coerce numerics
  if (patch.case_pack !== undefined) patch.case_pack = numOrNull(patch.case_pack);
  if (patch.gsm !== undefined)       patch.gsm       = numOrNull(patch.gsm);
  await dbUpdate("inventory_items", "id", id, patch, { returning: "minimal" });
  // Re-fetch with photos embed so the caller gets the same shape as listItems.
  // Cheap (single row + small photos array); avoids photo-loss in the UI's
  // optimistic state replacement after save.
  return getItem(id);
}

// Soft delete — set is_active=false. Hard delete blocked because movements may
// reference the row.
export async function deactivateItem(id, userEmail) {
  return updateItem(id, { is_active: false }, userEmail);
}

// ---------- Locations -----------------------------------------------------

export async function listLocations({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { is_active: `eq.true` };
  return dbSelect("inventory_locations", {
    select: "id,code,name,warehouse,zone,is_active,is_virtual",
    filter,
    order: "code.asc",
    limit: 200,
  });
}

// ---------- Stock position view -------------------------------------------

export async function listStockPosition({ search = "", source = "" } = {}) {
  const filter = { is_active: `eq.true` };
  if (source) filter.source = `eq.${source}`;
  const rows = await dbSelect("inventory_stock_position", {
    select:
      "item_id,sku,name,category,brand,brand_customer,uom,source,avg_cost,needs_review,total_qty,total_value,by_location,last_movement_at",
    filter,
    order: "sku.asc",
    limit: 5000,
  });
  if (!search) return rows;
  const q = search.toLowerCase();
  return rows.filter(
    (r) =>
      (r.sku || "").toLowerCase().includes(q) ||
      (r.name || "").toLowerCase().includes(q) ||
      (r.brand || "").toLowerCase().includes(q) ||
      (r.brand_customer || "").toLowerCase().includes(q),
  );
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
