// Rate-card attachment list + upload. Admin uploads; client + admin can list.
//
//   GET  → array of attachments with signed download URLs.
//   POST → upload one PDF (json body). Caller wraps the bytes in fileBase64.

import { requireRateCardSession, requireRateCardAdmin } from "@/lib/rate-cards/auth";
import { getCard } from "@/lib/rate-cards/store";
import { listAttachments, createAttachment } from "@/lib/rate-cards/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per PDF
const ALLOWED_TYPES = new Set(["application/pdf"]);

export async function GET(_req, { params }) {
  let session;
  try { session = requireRateCardSession(); } catch (r) { return r; }

  const card = await getCard(params.id);
  if (!card) return Response.json({ error: "Card not found" }, { status: 404 });
  if (session.rateCardRole !== "admin" && card.clientEmail !== session.email) {
    // Don't leak existence of other clients' cards.
    return Response.json({ error: "Card not found" }, { status: 404 });
  }
  const attachments = await listAttachments({ cardRef: card.ref });
  return Response.json(attachments);
}

export async function POST(req, { params }) {
  let session;
  try { session = requireRateCardAdmin(); } catch (r) { return r; }

  const card = await getCard(params.id);
  if (!card) return Response.json({ error: "Card not found" }, { status: 404 });

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { filename, contentType, fileBase64, notes } = body || {};
  if (!filename || !contentType || !fileBase64) {
    return Response.json(
      { error: "Missing filename, contentType, or fileBase64" },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    return Response.json(
      { error: "Only PDF uploads are allowed (application/pdf)" },
      { status: 400 },
    );
  }
  // base64 length ≈ 4/3 × raw size — server-side cap so a runaway upload
  // can't crash the route. Client UI also enforces the same limit.
  const approxBytes = Math.ceil((fileBase64.length * 3) / 4);
  if (approxBytes > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `File too large. Max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB` },
      { status: 413 },
    );
  }

  try {
    const attachment = await createAttachment({
      cardId: card.id,
      cardRef: card.ref,
      clientEmail: card.clientEmail,
      filename,
      contentType,
      fileBase64,
      notes: notes || "",
      uploadedBy: session.email || (session.isAdmin ? "Admin" : ""),
    });
    return Response.json(attachment);
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
