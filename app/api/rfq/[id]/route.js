// Single-RFQ operations. GET returns the quote with a fresh signed URL.
// PATCH and DELETE are admin/customer-manager/internal only.

import { getSession } from "@/lib/auth/session";
import { requireInternal } from "@/lib/auth/policy";
import { dbSelect } from "@/lib/db/supabase";
import { getRfqQuote, updateRfqQuote, deleteRfqQuote } from "@/lib/rfq/store";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

// True if `email` is linked to client `clientId` via user_clients.
async function userOwnsClient(email, clientId) {
  if (!email || !clientId) return false;
  const userRows = await dbSelect("users", {
    select: "id",
    filter: { email: `ilike.${email.toLowerCase()}` },
    limit: 1,
  });
  const userId = userRows[0]?.id;
  if (!userId) return false;
  const links = await dbSelect("user_clients", {
    select: "client_id",
    filter: { user_id: `eq.${userId}`, client_id: `eq.${clientId}` },
    limit: 1,
  });
  return links.length > 0;
}

export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const quote = await getRfqQuote(params.id);
  if (!quote) return new Response("Not found", { status: 404 });

  // Internal users always see the row.
  if (session.isAdmin || requireInternal(session)) {
    return Response.json({ quote });
  }

  // Everyone else: only if they're linked to the quote's client.
  const owns = await userOwnsClient(session.email, quote.clientId);
  if (!owns) return new Response("Not found", { status: 404 });
  return Response.json({ quote });
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  // Validate optional PDF replacement payload.
  if (body.fileBase64) {
    if (!body.filename) {
      return Response.json({ error: "Filename is required when replacing the PDF" }, { status: 400 });
    }
    const ct = (body.contentType || "application/pdf").toLowerCase();
    if (!ct.includes("pdf")) {
      return Response.json({ error: "Only PDF uploads are supported" }, { status: 400 });
    }
    const approxBytes = Math.floor((body.fileBase64.length * 3) / 4);
    if (approxBytes > MAX_BYTES) {
      return Response.json({ error: "File exceeds 10 MB limit" }, { status: 400 });
    }
    body.bytes = approxBytes;
    body.contentType = ct;
  }

  try {
    const quote = await updateRfqQuote(params.id, body);
    return Response.json({ quote });
  } catch (err) {
    console.error("[rfq] update failed", err);
    return Response.json({ error: err?.message || "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await deleteRfqQuote(params.id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[rfq] delete failed", err);
    return Response.json({ error: err?.message || "Delete failed" }, { status: 500 });
  }
}
