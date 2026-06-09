import { getSession, requireInternal } from "@/lib/auth/session";
import { updateInvoiceStatus, deleteVendorInvoice } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

// PATCH /api/factoryos/invoices/[id] — team updates an invoice's status
// (submitted → approved → paid, or rejected). Internal staff only.
export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (!["submitted", "approved", "paid", "rejected"].includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }
  try {
    await updateInvoiceStatus(params.id, status);
    return Response.json({ ok: true, status });
  } catch (e) {
    console.error("invoice status update failed:", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE /api/factoryos/invoices/[id] — internal staff only.
export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    await deleteVendorInvoice(params.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("invoice delete failed:", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
