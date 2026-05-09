// Brand repository — file upload/list/delete via Supabase Storage.
// Bucket: `brand-assets` (public, mixed file types: image/* + pdf + zip).
// Storage URLs are public (cheap to share with vendors/printers); the
// LISTING page that exposes those URLs is auth-gated to staff, so
// clients never discover them through the app UI.

import {
  uploadToBucket,
  deleteFromBucket,
  publicStorageUrl,
  safeFilename,
} from "../db/storage.js";
import { ROLES } from "../factoryos/constants.js";

const BUCKET = "brand-assets";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Same staff set that runs WarehouseOS / FactoryOS admin. Customers
// (factoryos=customer) and clients (calculator=client) are excluded.
export function canAccessBrandRepo(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const fos  = session.modules?.factoryos;
  const calc = session.modules?.calculator;
  if (fos === "customer") return false;
  if (calc === "client")  return false;
  return (
    fos === ROLES.FACTORY_MANAGER   ||
    fos === ROLES.FACTORY_EXECUTIVE ||
    fos === ROLES.ACCOUNT_MANAGER   ||
    fos === ROLES.ADMIN
  );
}

function ensureConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Brand repo not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)",
    );
  }
}

// Supabase Storage list endpoint — flat for now (no folders).
export async function listBrandFiles() {
  ensureConfig();
  const url = `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prefix: "",
      limit: 200,
      sortBy: { column: "updated_at", order: "desc" },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    // Bucket missing or unreachable — surface a friendly error.
    if (res.status === 404 || /not.found/i.test(body)) {
      throw new Error(
        "Bucket 'brand-assets' not found. Create it in Supabase Storage (public, 25 MB cap, allowed: image/*, application/pdf, application/zip).",
      );
    }
    throw new Error(`Brand list ${res.status}: ${body.slice(0, 300)}`);
  }
  const rows = await res.json();
  // Filter out the .emptyFolderPlaceholder Supabase auto-creates.
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r.name && r.name !== ".emptyFolderPlaceholder")
    .map((r) => ({
      name: r.name,
      size: r.metadata?.size ?? null,
      contentType: r.metadata?.mimetype ?? r.metadata?.contentType ?? null,
      lastModified: r.updated_at || r.created_at || null,
      url: publicStorageUrl(BUCKET, r.name),
    }));
}

const MAX_BRAND_BYTES = 25 * 1024 * 1024;
const ALLOWED_PREFIXES = ["image/", "application/pdf", "application/zip", "application/postscript"];
const ALLOWED_EXACT = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml",
  "image/heic", "image/heif", "image/gif",
  "application/pdf", "application/zip", "application/postscript",
]);

export async function uploadBrandFile({ filename, contentType, fileBase64 }) {
  ensureConfig();
  if (!filename || !contentType || !fileBase64) {
    throw new Error("filename, contentType and fileBase64 are required");
  }
  const ct = contentType.toLowerCase();
  if (!ALLOWED_EXACT.has(ct) && !ALLOWED_PREFIXES.some((p) => ct.startsWith(p))) {
    throw new Error(`Unsupported type ${contentType}. Allowed: image/*, PDF, ZIP, PostScript.`);
  }
  const approxBytes = Math.ceil((fileBase64.length * 3) / 4);
  if (approxBytes > MAX_BRAND_BYTES) {
    throw new Error(
      `File too large. Max 25 MB, got ~${(approxBytes / (1024 * 1024)).toFixed(2)} MB`,
    );
  }
  // Path includes a timestamp to avoid name collisions when re-uploading.
  const safe = safeFilename(filename);
  const path = `${Date.now()}-${safe}`;
  const up = await uploadToBucket({ bucket: BUCKET, path, contentType, fileBase64 });
  return {
    name: up.path,
    size: up.size,
    contentType,
    url: publicStorageUrl(BUCKET, up.path),
  };
}

export async function deleteBrandFile(name) {
  ensureConfig();
  if (!name) throw new Error("name is required");
  await deleteFromBucket(BUCKET, name);
  return { name, deleted: true };
}
