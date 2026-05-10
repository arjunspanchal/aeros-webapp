// Single-RFQ operations. GET returns the quote with a fresh signed URL.
// DELETE is admin/customer-manager/internal only.

import { getSession } from "@/lib/auth/session";
import { requireInternal } from "@/lib/auth/policy";
import { getRfqQuote, deleteRfqQuote, updateRfqQuote } from "@/lib/rfq/store";

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

// Edit metadata only (RFQ #s, brand, product, customer, notes). The PDF
// itself can't be replaced through PATCH — to swap files, delete + re-
// upload via POST /api/rfq.
export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  try {
    const quote = await updateRfqQuote(params.id, body);
    if (!quote) return Response.json({ error: "Not found" }, { status: 404 });
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
