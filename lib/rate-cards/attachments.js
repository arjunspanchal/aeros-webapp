// Rate-card PDF attachments — Supabase Storage for the bytes, Postgres
// for the metadata. Used by admin to upload past quote PDFs onto a card so
// the customer can review every quote ever sent to them in one place.
//
// Storage bucket: `rate-card-attachments` (private). Reads go through
// signed URLs minted on-demand by listAttachments(). All callers run on
// the server with the service-role key — never imported from a client
// component.

import { dbSelect, dbInsert, dbDelete } from "@/lib/db/supabase";
import {
  uploadToBucket,
  deleteFromBucket,
  signStorageUrl,
  safeFilename,
} from "@/lib/db/storage";

const BUCKET = "rate-card-attachments";
const TABLE = "rate_card_attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — long enough to download a few MB

function rowToAttachment(row, signedUrl = null) {
  return {
    id: row.id,
    cardId: row.rate_card_id || "",
    cardRef: row.rate_card_ref || "",
    clientEmail: row.client_email || "",
    filename: row.filename,
    contentType: row.content_type,
    bytes: row.bytes ?? null,
    notes: row.notes || "",
    createdAt: row.created_at,
    uploadedBy: row.uploaded_by || "",
    storagePath: row.storage_path,
    url: signedUrl,
  };
}

function buildPath({ cardRef, filename }) {
  // Group by card ref so admin can see all of one card's files in the
  // bucket browser; suffix with timestamp to avoid collisions when the
  // same filename is uploaded twice.
  const safe = safeFilename(filename || "quote.pdf");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${cardRef || "no-ref"}/${stamp}-${safe}`;
}

export async function listAttachments({ cardId, cardRef } = {}) {
  if (!cardId && !cardRef) return [];
  const filter = {};
  if (cardId) filter.rate_card_id = `eq.${cardId}`;
  else filter.rate_card_ref = `eq.${cardRef}`;
  const rows = await dbSelect(TABLE, {
    select: "id,rate_card_id,rate_card_ref,client_email,filename,storage_path,content_type,bytes,notes,created_at,uploaded_by",
    filter,
    order: "created_at.desc",
    range: "0-499",
  });
  // Mint a fresh signed URL per row so the UI can render direct download links.
  // Failures are surfaced as `url:null` rather than blowing up the whole list.
  return Promise.all(rows.map(async (r) => {
    let url = null;
    try { url = await signStorageUrl(BUCKET, r.storage_path, SIGNED_URL_TTL_SECONDS); } catch {}
    return rowToAttachment(r, url);
  }));
}

export async function getAttachment(id) {
  const rows = await dbSelect(TABLE, {
    select: "id,rate_card_id,rate_card_ref,client_email,filename,storage_path,content_type,bytes,notes,created_at,uploaded_by",
    filter: { id: `eq.${id}` },
    limit: 1,
  });
  if (!rows[0]) return null;
  let url = null;
  try { url = await signStorageUrl(BUCKET, rows[0].storage_path, SIGNED_URL_TTL_SECONDS); } catch {}
  return rowToAttachment(rows[0], url);
}

export async function createAttachment({
  cardId, cardRef, clientEmail, filename, contentType, fileBase64,
  notes, uploadedBy,
}) {
  if (!cardRef) throw new Error("createAttachment: cardRef required");
  if (!filename || !contentType || !fileBase64) {
    throw new Error("createAttachment: filename, contentType, fileBase64 required");
  }
  const path = buildPath({ cardRef, filename });
  const { size } = await uploadToBucket({ bucket: BUCKET, path, contentType, fileBase64 });

  let inserted;
  try {
    [inserted] = await dbInsert(TABLE, [{
      rate_card_id: cardId || null,
      rate_card_ref: cardRef,
      client_email: clientEmail || null,
      filename,
      storage_path: path,
      content_type: contentType,
      bytes: size,
      notes: notes || null,
      uploaded_by: uploadedBy || null,
    }]);
  } catch (err) {
    // Roll back the bucket upload so we don't leak orphan bytes when the
    // metadata insert fails. Best-effort — surface the original error.
    try { await deleteFromBucket(BUCKET, path); } catch {}
    throw err;
  }

  let url = null;
  try { url = await signStorageUrl(BUCKET, path, SIGNED_URL_TTL_SECONDS); } catch {}
  return rowToAttachment(inserted, url);
}

export async function deleteAttachment(id) {
  const att = await getAttachment(id);
  if (!att) return { ok: true };
  // Order: delete bucket object first; if that fails, leave the metadata
  // row alone so the operator can retry. Inverse order would risk an
  // orphan blob with no metadata pointer.
  await deleteFromBucket(BUCKET, att.storagePath);
  await dbDelete(TABLE, "id", id);
  return { ok: true };
}
