// Single-RFQ operations. GET returns the quote with a fresh signed URL.
// DELETE is admin/customer-manager/internal only.

import { getSession } from "@/lib/auth/session";
import { requireInternal } from "@/lib/auth/policy";
import { dbSelect } from "@/lib/db/supabase";
import { getRfqQuote, deleteRfqQuote } from "@/lib/rfq/store";

export const runtime = "nodejs";

// True if `email` is linked to customer `clientId` via user_clients.
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

  // Everyone else: only if they're linked to the quote's customer via
  // user_clients. Covers the multi-user-per-customer case (Testing
  // Grounds with akif + arjunspanchal@gmail.com).
  const owns = await userOwnsClient(session.email, quote.clientId);
  if (!owns) return new Response("Not found", { status: 404 });
  return Response.json({ quote });
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
