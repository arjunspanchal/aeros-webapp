// WarehouseOS — item photos data layer.
// Mirrors the intent of the clearance pattern but skips the Airtable shim
// — calls Supabase Storage + REST directly. Bucket: inventory-item-photos
// (public, 10MB cap, jpeg/png/webp/heic).

import { dbSelect, dbInsert, dbDelete, dbUpdate } from "../db/supabase.js";
import {
  uploadToBucket,
  deleteFromBucket,
  publicStorageUrl,
  safeFilename,
} from "../db/storage.js";

const BUCKET = "inventory-item-photos";

// Shape returned to the UI. Matches clearance's photo shape so reused UI
// patterns (3-col grid, thumbnail src) work without translation. thumbnailUrl
// + largeUrl are aliases of the public URL today; future thumb generation
// will swap these without UI churn.
function normalizePhoto(row) {
  if (!row?.storage_path) return null;
  const url = publicStorageUrl(BUCKET, row.storage_path);
  return {
    id: row.id,
    url,
    thumbnailUrl: url,
    largeUrl: url,
    filename: row.filename || "",
    contentType: row.content_type || "",
    size: typeof row.size_bytes === "number" ? row.size_bytes : null,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    createdAt: row.created_at || null,
  };
}

export { normalizePhoto };

/** List photos for one item, ordered by sort_order ASC then created_at ASC. */
export async function listItemPhotos(itemId) {
  if (!itemId) return [];
  const rows = await dbSelect("inventory_item_photos", {
    select: "id,inventory_item_id,storage_path,filename,content_type,size_bytes,sort_order,created_at",
    filter: { inventory_item_id: `eq.${itemId}` },
    order: "sort_order.asc,created_at.asc",
    limit: 500,
  });
  return rows.map(normalizePhoto).filter(Boolean);
}

/**
 * Upload one photo. Auto-increments sort_order: new photo lands at the end.
 * Caller provides {filename, contentType, fileBase64}. Returns the normalized
 * photo row.
 */
export async function uploadItemPhoto({ itemId, filename, contentType, fileBase64 }) {
  if (!itemId)        throw new Error("itemId is required");
  if (!fileBase64)    throw new Error("fileBase64 is required");
  if (!contentType)   throw new Error("contentType is required");

  // Path: <itemId>/<timestamp>-<safeFilename>. Collision-resistant + groups
  // all photos for one item under a folder for easy cleanup.
  const path = `${itemId}/${Date.now()}-${safeFilename(filename || "photo")}`;
  const up = await uploadToBucket({ bucket: BUCKET, path, contentType, fileBase64 });

  // sort_order = MAX(existing) + 1 so the new photo is last; thumbnail
  // (sort_order=0) stays unchanged unless this is the first photo.
  const existing = await dbSelect("inventory_item_photos", {
    select: "sort_order",
    filter: { inventory_item_id: `eq.${itemId}` },
    order: "sort_order.desc",
    limit: 1,
  });
  const nextSort = existing.length > 0 ? Number(existing[0].sort_order ?? -1) + 1 : 0;

  const inserted = await dbInsert(
    "inventory_item_photos",
    {
      inventory_item_id: itemId,
      storage_path: up.path,
      filename: filename || null,
      content_type: contentType || null,
      size_bytes: up.size,
      sort_order: nextSort,
    },
    { returning: "representation" },
  );
  // dbInsert returns array when input is array; we passed a single object.
  return normalizePhoto(Array.isArray(inserted) ? inserted[0] : inserted);
}

/**
 * Delete one photo: storage object first (best-effort), then DB row.
 * Returns the deleted photo's id for caller convenience.
 */
export async function deleteItemPhoto(photoId) {
  if (!photoId) throw new Error("photoId is required");
  const rows = await dbSelect("inventory_item_photos", {
    select: "id,storage_path,inventory_item_id",
    filter: { id: `eq.${photoId}` },
    limit: 1,
  });
  const photo = rows[0];
  if (!photo) return { id: photoId, deleted: false, reason: "not-found" };

  if (photo.storage_path) {
    try { await deleteFromBucket(BUCKET, photo.storage_path); } catch {}
  }
  await dbDelete("inventory_item_photos", "id", photoId);
  return { id: photoId, deleted: true, itemId: photo.inventory_item_id };
}

/**
 * Reorder photos: caller supplies the full ordered list of photo ids for one
 * item. We assign sort_order by index. Photos not in the list keep their
 * current sort_order (caller is expected to supply all photos to avoid drift).
 */
export async function reorderItemPhotos(itemId, orderedIds) {
  if (!itemId) throw new Error("itemId is required");
  if (!Array.isArray(orderedIds)) throw new Error("orderedIds must be an array");

  // Verify all ids belong to this item to prevent cross-item PATCH abuse.
  if (orderedIds.length > 0) {
    const rows = await dbSelect("inventory_item_photos", {
      select: "id,inventory_item_id",
      filter: { id: `in.(${orderedIds.join(",")})` },
      limit: orderedIds.length,
    });
    const mismatched = rows.filter((r) => r.inventory_item_id !== itemId);
    if (mismatched.length > 0) {
      throw new Error(`Photo(s) ${mismatched.map((r) => r.id).join(",")} do not belong to item ${itemId}`);
    }
    if (rows.length !== orderedIds.length) {
      throw new Error("Some photo ids in orderedIds were not found");
    }
  }

  // Apply sort_order = index. Sequential because PostgREST has no batch
  // update with per-row values. Volume is small (rarely > 5 photos).
  for (let i = 0; i < orderedIds.length; i++) {
    await dbUpdate("inventory_item_photos", "id", orderedIds[i], { sort_order: i }, { returning: "minimal" });
  }
  return listItemPhotos(itemId);
}
