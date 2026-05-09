// RFQ Manager — PDF quote archive. Each row in `rfq_quotes` is one PDF
// uploaded by an admin / customer manager and visible to the matching
// customer (gated by client_email or client_id).
//
// Storage bucket: `rfq-quotes` (private). Reads use signed URLs minted on
// demand. Service-role only — never import from a client component.

import { dbSelect, dbInsert, dbDelete } from "@/lib/db/supabase";
import {
  uploadToBucket,
  deleteFromBucket,
  signStorageUrl,
  safeFilename,
} from "@/lib/db/storage";

const BUCKET = "rfq-quotes";
const TABLE = "rfq_quotes";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

const SELECT_COLS =
  "id,aeros_rfq_number,customer_rfq_number,client_id,client_email," +
  "brand,product_name,filename,storage_path,content_type,bytes,notes," +
  "uploaded_by,created_at,updated_at";

function rowToQuote(row, signedUrl = null) {
  return {
    id: row.id,
    aerosRfqNumber: row.aeros_rfq_number || "",
    customerRfqNumber: row.customer_rfq_number || "",
    clientId: row.client_id || null,
    clientEmail: (row.client_email || "").toLowerCase(),
    brand: row.brand || "",
    productName: row.product_name || "",
    filename: row.filename || "",
    storagePath: row.storage_path || "",
    contentType: row.content_type || "application/pdf",
    bytes: typeof row.bytes === "number" ? row.bytes : null,
    notes: row.notes || "",
    uploadedBy: row.uploaded_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    url: signedUrl,
  };
}

function buildPath({ aerosRfqNumber, filename }) {
  // Group all uploads for the same Aeros RFQ # under one folder so admin
  // can browse them together in the bucket UI; suffix with timestamp to
  // avoid collisions on re-upload.
  const safeRfq = safeFilename(aerosRfqNumber || "no-rfq");
  const safeName = safeFilename(filename || "quote.pdf");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safeRfq}/${stamp}-${safeName}`;
}

/**
 * List quotes. Filtering options:
 *   - clientEmail   — limit to one denormalized contact email (legacy)
 *   - clientId      — limit to one customer by uuid
 *   - clientIdsIn   — limit to a set of customer uuids (used for customer
 *                     scope so every user linked to a customer sees the
 *                     same RFQs, not just the primary contact email).
 *   - search        — case-insensitive match across RFQ #, brand, product,
 *                     filename, notes
 */
export async function listRfqQuotes({ clientEmail, clientId, clientIdsIn, search } = {}) {
  const filter = {};
  if (clientEmail) filter.client_email = `ilike.${clientEmail.toLowerCase()}`;
  if (clientId) filter.client_id = `eq.${clientId}`;
  if (clientIdsIn && clientIdsIn.length) {
    filter.client_id = `in.(${clientIdsIn.join(",")})`;
  }

  const rows = await dbSelect(TABLE, {
    select: SELECT_COLS,
    filter,
    order: "created_at.desc",
    range: "0-499",
  });

  const sq = (search || "").trim().toLowerCase();
  const filtered = sq
    ? rows.filter((r) =>
        (r.aeros_rfq_number || "").toLowerCase().includes(sq) ||
        (r.customer_rfq_number || "").toLowerCase().includes(sq) ||
        (r.brand || "").toLowerCase().includes(sq) ||
        (r.product_name || "").toLowerCase().includes(sq) ||
        (r.filename || "").toLowerCase().includes(sq) ||
        (r.notes || "").toLowerCase().includes(sq),
      )
    : rows;

  // Mint signed URLs in parallel; failures surface as url:null so the row
  // still renders with a "regenerate" path.
  return Promise.all(filtered.map(async (r) => {
    let url = null;
    try { url = await signStorageUrl(BUCKET, r.storage_path, SIGNED_URL_TTL_SECONDS); } catch {}
    return rowToQuote(r, url);
  }));
}

/**
 * Resolve the customer UUIDs a user is linked to (via user_clients) and
 * return RFQs whose client_id is in that set. This is the customer-scope
 * lookup used by GET /api/rfq so any user attached to a customer (now or
 * later) sees that customer's RFQs — not just whoever's email got
 * denormalized onto the row at upload time.
 */
export async function listRfqQuotesForUserEmail(email, { search } = {}) {
  if (!email) return [];
  const userRows = await dbSelect("users", {
    select: "id",
    filter: { email: `ilike.${email.toLowerCase()}` },
    limit: 1,
  });
  const userId = userRows[0]?.id;
  if (!userId) return [];
  const links = await dbSelect("user_clients", {
    select: "client_id",
    filter: { user_id: `eq.${userId}` },
    limit: 200,
  });
  const clientIds = [...new Set(links.map((l) => l.client_id).filter(Boolean))];
  if (clientIds.length === 0) return [];
  return listRfqQuotes({ clientIdsIn: clientIds, search });
}

export async function getRfqQuote(id) {
  const rows = await dbSelect(TABLE, {
    select: SELECT_COLS,
    filter: { id: `eq.${id}` },
    limit: 1,
  });
  if (!rows[0]) return null;
  let url = null;
  try { url = await signStorageUrl(BUCKET, rows[0].storage_path, SIGNED_URL_TTL_SECONDS); } catch {}
  return rowToQuote(rows[0], url);
}

/**
 * Create a quote. Caller is responsible for admin auth.
 *   { aerosRfqNumber, customerRfqNumber?, clientId?, clientEmail?,
 *     productName?, notes?, uploadedBy, filename, contentType, fileBase64, bytes }
 *
 * Uploads bytes to storage first; if the metadata insert fails, the blob
 * is deleted to avoid orphan files.
 */
export async function createRfqQuote(input) {
  const {
    aerosRfqNumber,
    customerRfqNumber,
    clientId,
    clientEmail,
    brand,
    productName,
    notes,
    uploadedBy,
    filename,
    contentType,
    fileBase64,
    bytes,
  } = input || {};

  if (!aerosRfqNumber || !String(aerosRfqNumber).trim()) {
    throw new Error("aerosRfqNumber is required");
  }
  if (!filename) throw new Error("filename is required");
  if (!fileBase64 && !bytes) throw new Error("file payload is required");

  const path = buildPath({ aerosRfqNumber, filename });

  await uploadToBucket({
    bucket: BUCKET,
    path,
    contentType: contentType || "application/pdf",
    fileBase64,
    bytes,
  });

  let row;
  try {
    row = await dbInsert(TABLE, {
      aeros_rfq_number: String(aerosRfqNumber).trim(),
      customer_rfq_number: customerRfqNumber ? String(customerRfqNumber).trim() : null,
      client_id: clientId || null,
      client_email: clientEmail ? String(clientEmail).toLowerCase() : null,
      brand: brand ? String(brand).trim() : null,
      product_name: productName ? String(productName).trim() : null,
      notes: notes ? String(notes) : null,
      filename,
      storage_path: path,
      content_type: contentType || "application/pdf",
      bytes: typeof bytes === "number" ? bytes : null,
      uploaded_by: uploadedBy || null,
    });
  } catch (err) {
    // Clean up the orphaned blob so we don't leak storage on schema error.
    try { await deleteFromBucket(BUCKET, path); } catch {}
    throw err;
  }

  let url = null;
  try { url = await signStorageUrl(BUCKET, path, SIGNED_URL_TTL_SECONDS); } catch {}
  return rowToQuote(row, url);
}

export async function deleteRfqQuote(id) {
  // Look up storage path before deleting the row so we can clean storage too.
  const rows = await dbSelect(TABLE, {
    select: "storage_path",
    filter: { id: `eq.${id}` },
    limit: 1,
  });
  const path = rows[0]?.storage_path;
  await dbDelete(TABLE, "id", id);
  if (path) {
    try { await deleteFromBucket(BUCKET, path); } catch {}
  }
}
