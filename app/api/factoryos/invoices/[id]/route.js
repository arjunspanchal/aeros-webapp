import { getSession, requireManager } from "@/lib/auth/session";
import { getVendorInvoice, updateInvoiceStatus, deleteVendorInvoice } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

// Approving / paying / deleting a vendor invoice is a finance action, so it is
// restricted to admin + Factory Manager (requireManager) — NOT every internal
// role. This also closes the prior hole where any Account Manager could mutate
// any invoice with no job-scope check (audit C1): managers have global scope by
// definition, so a separate per-job check isn't needed once AMs/FE are excluded.
function guard(session) {
  if (!session) return { status: 401, error: "Unauthorized" };
  if (!requireManager(session)) return { status: 403, error: "Forbidden" };
  return null;
}

// PATCH /api/factoryos/invoices/[id] — manager updates an invoice's status
// (submitted → approved → paid, or rejected).
export async function PATCH(req, { params }) {
  const session = getSession();
  const denied = guard(session);
  if (denied) return Response.json({ error: denied.error }, { status: denied.status });

  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (!["submitted", "approved", "paid", "rejected"].includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }
  // 404 (not 403) when the invoice doesn't exist — no existence oracle.
  const invoice = await getVendorInvoice(params.id);
  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    await updateInvoiceStatus(params.id, status);
    return Response.json({ ok: true, status });
  } catch (e) {
    console.error("invoice status update failed:", e);
    return Response.json({ error: "Could not update invoice" }, { status: 500 });
  }
}

// DELETE /api/factoryos/invoices/[id] — manager only.
export async function DELETE(_req, { params }) {
  const session = getSession();
  const denied = guard(session);
  if (denied) return Response.json({ error: denied.error }, { status: denied.status });

  const invoice = await getVendorInvoice(params.id);
  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    await deleteVendorInvoice(params.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("invoice delete failed:", e);
    return Response.json({ error: "Could not delete invoice" }, { status: 500 });
  }
}
