// Single-attachment delete. Admin-only. (List + create live on
// /api/rate-cards/[id]/attachments — keyed by card id, not attachment id.)

import { requireRateCardAdmin } from "@/lib/rate-cards/auth";
import { deleteAttachment } from "@/lib/rate-cards/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req, { params }) {
  try { requireRateCardAdmin(); } catch (r) { return r; }
  try {
    await deleteAttachment(params.attachmentId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
