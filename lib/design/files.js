// Design module — server-side helpers for product design assets
// (KLDs, keylines, outlines, mockups). Reads/writes route through the
// shared Supabase REST helpers; binary objects live in the private
// `design-files` bucket and are served via signed URLs.

import { dbSelect, dbInsert, dbDelete } from "../db/supabase.js";
import {
  uploadToBucket,
  deleteFromBucket,
  signStorageUrl,
  safeFilename,
} from "../db/storage.js";
import { ROLES } from "../factoryos/constants.js";

const BUCKET = "design-files";

// Upload + delete are gated to Admin / FM / FE — same staff set that
// owns the catalogue. Anyone else with a session can still browse and
// download (the page enforces session-only at minimum).
export function canManageDesign(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const role = session.modules?.factoryos;
  return (
    role === ROLES.ADMIN ||
    role === ROLES.FACTORY_MANAGER ||
    role === ROLES.FACTORY_EXECUTIVE
  );
}

export const FILE_TYPES = ["KLD", "Keyline", "Outline", "Mockup", "Other"];

// Common formats we accept. The server enforces a hard cap separately.
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "kld", "ai", "eps", "svg", "dxf", "dwg", "zip",
  "png", "jpg", "jpeg", "webp",
]);

export function isAllowedFilename(filename) {
  const ext = String(filename || "").toLowerCase().split(".").pop();
  return ALLOWED_EXTENSIONS.has(ext);
}

function normalizeFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    fileType: row.file_type || "Other",
    filename: row.filename,
    storagePath: row.storage_path,
    contentType: row.content_type || "application/octet-stream",
    sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : null,
    notes: row.notes || "",
    uploadedBy: row.uploaded_by || "",
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Products with design assets attached, plus the file count. Drives the
// list screen at /design. Returns an array sorted by product_name asc.
//
// We pull every master_products row so designers can find products that
// don't yet have any files — that's the common upload path.
export async function listProductsWithDesignSummary({ search = "" } = {}) {
  const products = await dbSelect("master_products", {
    select:
      "id,product_name,sku,category,sub_category,size_volume,colour,material,gsm,wall_type,coating,top_diameter_mm,bottom_diameter_mm,height_mm,length_mm,width_mm,carton_dimensions",
    order: "product_name.asc",
    range: "0-9999",
  });

  const files = await dbSelect("product_design_files", {
    select: "product_id,file_type",
    range: "0-9999",
  });

  // Map productId → { totalCount, byType: { KLD: 1, Keyline: 2, ... } }
  const summary = new Map();
  for (const f of files) {
    const cur = summary.get(f.product_id) || { total: 0, byType: {} };
    cur.total += 1;
    cur.byType[f.file_type] = (cur.byType[f.file_type] || 0) + 1;
    summary.set(f.product_id, cur);
  }

  const q = search.trim().toLowerCase();
  return products
    .map((p) => {
      const s = summary.get(p.id) || { total: 0, byType: {} };
      return {
        id: p.id,
        productName: p.product_name,
        sku: p.sku || "",
        category: p.category || "",
        subCategory: p.sub_category || "",
        sizeVolume: p.size_volume || "",
        colour: p.colour || "",
        material: p.material || "",
        gsm: p.gsm,
        wallType: p.wall_type || "",
        coating: p.coating || "",
        topDiameterMm: p.top_diameter_mm,
        bottomDiameterMm: p.bottom_diameter_mm,
        heightMm: p.height_mm,
        lengthMm: p.length_mm,
        widthMm: p.width_mm,
        cartonDimensions: p.carton_dimensions || "",
        fileCount: s.total,
        filesByType: s.byType,
      };
    })
    .filter((p) => {
      if (!q) return true;
      const hay = `${p.productName} ${p.sku} ${p.category} ${p.material} ${p.colour} ${p.sizeVolume}`.toLowerCase();
      return hay.includes(q);
    });
}

export async function listFilesForProduct(productId) {
  const rows = await dbSelect("product_design_files", {
    select: "*",
    filter: { product_id: `eq.${productId}` },
    order: "sort_order.asc,created_at.desc",
    range: "0-999",
  });
  return rows.map(normalizeFile).filter(Boolean);
}

export async function getProductById(productId) {
  const rows = await dbSelect("master_products", {
    select: "id,product_name,sku,category,sub_category",
    filter: { id: `eq.${productId}` },
    limit: 1,
  });
  return rows[0] || null;
}

// Upload a design asset. Stores it in the bucket as
//   <productId>/<timestamp>-<safe-filename>
// and writes the row in product_design_files.
export async function uploadDesignFile({
  productId,
  fileType,
  filename,
  contentType,
  fileBase64,
  uploadedBy = "",
  notes = "",
}) {
  if (!productId) throw new Error("productId required");
  if (!filename) throw new Error("filename required");
  if (!fileBase64) throw new Error("fileBase64 required");

  const safe = safeFilename(filename);
  const path = `${productId}/${Date.now()}-${safe}`;
  const { size } = await uploadToBucket({
    bucket: BUCKET,
    path,
    contentType,
    fileBase64,
  });

  const inserted = await dbInsert("product_design_files", [
    {
      product_id: productId,
      file_type: FILE_TYPES.includes(fileType) ? fileType : "Other",
      filename,
      storage_path: path,
      content_type: contentType || null,
      size_bytes: size,
      notes: notes || null,
      uploaded_by: uploadedBy || null,
    },
  ]);
  return normalizeFile(inserted?.[0]);
}

// Delete the row + the underlying object. Object delete is best-effort —
// orphaned rows should never happen here, but a 404 in storage shouldn't
// block the row removal.
export async function deleteDesignFile(fileId) {
  const rows = await dbSelect("product_design_files", {
    select: "id,storage_path",
    filter: { id: `eq.${fileId}` },
    limit: 1,
  });
  const row = rows[0];
  if (!row) return null;

  if (row.storage_path) {
    try {
      await deleteFromBucket(BUCKET, row.storage_path);
    } catch {
      // swallow — storage may already be gone
    }
  }
  await dbDelete("product_design_files", "id", fileId);
  return { id: fileId };
}

// Time-limited signed URL for a download. 5-minute window — enough for a
// click but not so long the URL is useful if leaked.
export async function getDesignFileSignedUrl(fileId, { expiresIn = 300 } = {}) {
  const rows = await dbSelect("product_design_files", {
    select: "storage_path,filename,content_type",
    filter: { id: `eq.${fileId}` },
    limit: 1,
  });
  const row = rows[0];
  if (!row) return null;
  const url = await signStorageUrl(BUCKET, row.storage_path, expiresIn);
  return {
    url,
    filename: row.filename,
    contentType: row.content_type,
  };
}
