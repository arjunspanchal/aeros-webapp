// Backend helpers for the Clearance Stock management page. Reads + writes
// route through the Supabase shim. Admin sees the RAW (un-deduped) list.

import { ROLES } from "../factoryos/constants.js";
import { airtableList, airtableUpdate, airtableUploadAttachment, airtableGet, airtableCreate } from "../db/airtableShim.js";
import { dbSelect, dbDelete } from "../db/supabase.js";
import { deleteFromBucket } from "../db/storage.js";

export function canManageClearance(session) {
  if (!session) return false;
  const factoryosRole = session.modules?.factoryos;
  const calculatorRole = session.modules?.calculator;
  if (factoryosRole === "customer") return false;
  if (calculatorRole === "client") return false;
  if (session.isAdmin) return true;
  return factoryosRole === ROLES.FACTORY_MANAGER || factoryosRole === ROLES.FACTORY_EXECUTIVE;
}

function normalize(record) {
  const f = record.fields || {};
  const photos = Array.isArray(f.Photos) ? f.Photos : [];
  return {
    id: record.id,
    itemName: f["Item Name"] || "",
    brand: f.Brand || "",
    category: f.Category || "",
    stockQuantity: typeof f["Stock Quantity"] === "number" ? f["Stock Quantity"] : null,
    unit: f.Unit || "pcs",
    casePack: typeof f["Case Pack"] === "number" ? f["Case Pack"] : null,
    price: typeof f.Price === "number" ? f.Price : null,
    description: f.Description || "",
    specifications: f.Specifications || "",
    status: f.Status || "",
    // Internal warehouse note — admin/FM/FE only. Public lib/airtable.js
    // never reads this column, so it can't leak to /clearance.
    location: f.Location || "",
    // RM dead-stock fields. NULL/empty on finished-goods rows.
    // For Roll form, stockQuantity is kg (unit="kg").
    // For Sheet form, stockQuantity is sheet count (unit="sheets").
    gsm: typeof f.GSM === "number" ? f.GSM : null,
    rmForm: f["RM Form"] || "",   // "Roll" | "Sheet" | ""
    rmType: f["RM Type"] || "",   // "FBB" | "Cups Stock" | "Brown Kraft Board" | ...
    // Price denomination override. Empty string means "price is per `unit`".
    // Common case: stock counted in sheets, price quoted per kg.
    priceUnit: f["Price Unit"] || "",
    // Internal-only flag: when true the row is hidden from the public
    // /clearance page. Used for branded dead stock and other inventory
    // that staff want to track but not advertise.
    isInternal: f["Is Internal"] === true,
    photos: photos.map((a) => ({
      id: a.id,
      url: a.url,
      thumbnailUrl: a.thumbnails?.small?.url || a.url,
      largeUrl: a.thumbnails?.large?.url || a.url,
      filename: a.filename,
      size: a.size,
      type: a.type,
    })),
  };
}

export async function listItemsAdmin() {
  const records = await airtableList("Plain Items", { sort: [{ field: "Item Name", direction: "asc" }] });
  return records.map(normalize);
}

// Create a new clearance item. Photos are uploaded separately via the
// existing POST /api/clearance/items/[id]/photos endpoint after creation.
// `fields` accepts the same camel-cased keys as updateItem; only itemName
// is required (DB constraint). Defaults match the column defaults: unit
// "pcs", status "Available".
export async function createItem(fields) {
  const itemName = (fields?.itemName || "").trim();
  if (!itemName) throw new Error("Item name is required");

  const patch = { "Item Name": itemName };
  if (fields.brand !== undefined) patch.Brand = fields.brand;
  if (fields.category !== undefined) patch.Category = fields.category;
  if (fields.stockQuantity !== undefined) patch["Stock Quantity"] = fields.stockQuantity === "" || fields.stockQuantity === null ? null : Number(fields.stockQuantity);
  if (fields.unit !== undefined && fields.unit !== "") patch.Unit = fields.unit;
  if (fields.casePack !== undefined) patch["Case Pack"] = fields.casePack === "" || fields.casePack === null ? null : Number(fields.casePack);
  if (fields.price !== undefined) patch.Price = fields.price === "" || fields.price === null ? null : Number(fields.price);
  if (fields.description !== undefined) patch.Description = fields.description;
  if (fields.specifications !== undefined) patch.Specifications = fields.specifications;
  if (fields.status !== undefined && fields.status !== "") patch.Status = fields.status;
  if (fields.location !== undefined) patch.Location = fields.location || null;
  // RM dead-stock fields.
  if (fields.gsm !== undefined) patch.GSM = fields.gsm === "" || fields.gsm === null ? null : Number(fields.gsm);
  if (fields.rmForm !== undefined) patch["RM Form"] = fields.rmForm || null;
  if (fields.rmType !== undefined) patch["RM Type"] = fields.rmType || null;
  if (fields.priceUnit !== undefined) patch["Price Unit"] = fields.priceUnit || null;
  if (fields.isInternal !== undefined) patch["Is Internal"] = !!fields.isInternal;

  const rec = await airtableCreate("Plain Items", patch);
  return normalize(rec);
}

export async function updateItem(id, fields) {
  const patch = {};
  if (fields.itemName !== undefined) patch["Item Name"] = fields.itemName;
  if (fields.brand !== undefined) patch.Brand = fields.brand;
  if (fields.category !== undefined) patch.Category = fields.category;
  if (fields.stockQuantity !== undefined) patch["Stock Quantity"] = fields.stockQuantity === "" || fields.stockQuantity === null ? null : Number(fields.stockQuantity);
  if (fields.unit !== undefined) patch.Unit = fields.unit;
  if (fields.casePack !== undefined) patch["Case Pack"] = fields.casePack === "" || fields.casePack === null ? null : Number(fields.casePack);
  if (fields.price !== undefined) patch.Price = fields.price === "" || fields.price === null ? null : Number(fields.price);
  if (fields.description !== undefined) patch.Description = fields.description;
  if (fields.specifications !== undefined) patch.Specifications = fields.specifications;
  if (fields.status !== undefined) patch.Status = fields.status;
  if (fields.location !== undefined) patch.Location = fields.location || "";
  // RM dead-stock fields.
  if (fields.gsm !== undefined) patch.GSM = fields.gsm === "" || fields.gsm === null ? null : Number(fields.gsm);
  if (fields.rmForm !== undefined) patch["RM Form"] = fields.rmForm || null;
  if (fields.rmType !== undefined) patch["RM Type"] = fields.rmType || null;
  if (fields.priceUnit !== undefined) patch["Price Unit"] = fields.priceUnit || null;
  if (fields.isInternal !== undefined) patch["Is Internal"] = !!fields.isInternal;
  const rec = await airtableUpdate("Plain Items", id, patch);
  return normalize(rec);
}

export async function attachItemPhoto({ itemId, contentType, filename, fileBase64 }) {
  return airtableUploadAttachment(itemId, "Photos", { contentType, filename, fileBase64 });
}

// Remove one photo. Looks up the row in clearance_item_photos by its PG id
// (the shim returns photos with their PG id as `id`). Falls back to no-op
// if the row isn't found.
export async function removeItemPhoto(itemId, attachmentId) {
  const photo = (await dbSelect("clearance_item_photos", {
    select: "storage_path",
    filter: { id: `eq.${attachmentId}` },
    limit: 1,
  }))[0];
  if (photo?.storage_path) {
    try { await deleteFromBucket("clearance-photos", photo.storage_path); } catch {}
  }
  await dbDelete("clearance_item_photos", "id", attachmentId);
  const rec = await airtableGet("Plain Items", itemId);
  return rec ? normalize(rec) : null;
}
