// Single-RFQ operations. GET returns the quote with a fresh signed URL.
// DELETE is admin/customer-manager/internal only.

import { getSession } from "@/lib/auth/session";
import { requireInternal } from "@/lib/auth/policy";
import { getRfqQuote, deleteRfqQuote } from "@/lib/rfq/store";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const quote = await getRfqQuote(params.id);
  if (!quote) return new Response("Not found", { status: 404 });

  // Customers can only fetch their own quotes.
  if (session.modules?.factoryos === "customer") {
    if ((quote.clientEmail || "").toLowerCase() !== (session.email || "").toLowerCase()) {
      return new Response("Not found", { status: 404 });
    }
  }

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
