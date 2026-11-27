import { getSession, requireRole, requireInternal } from "@/lib/auth/session";
import { listCustomerPOs, createCustomerPO, attachPoFile } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // Airtable content-upload limit

export async function GET() {
  const session = getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Customer POs carry customer names, PO numbers and the PO file. Staff only:
  // an outside printer (vendor login) must never read them (audit, 27-Nov-2026).
  const isCustomer = requireRole(session, "factoryos", "customer");
  if (!isCustomer && !requireInternal(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  // Customers see only their own client's POs; staff see all.
  let clientIds;
  if (isCustomer) clientIds = session.factoryosClientIds || [];
  // Sales see every customer PO, like every job (18-Nov-2026).
  const pos = await listCustomerPOs(clientIds ? { clientIds } : undefined);
  return Response.json({ pos });
}

export async function POST(req) {
  const session = getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Staff (or a customer for their own client) only: never a vendor login.
  if (!requireRole(session, "factoryos", "customer") && !requireInternal(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { poNumber, filename, contentType, fileBase64, notes } = body;
  if (!poNumber || !filename || !fileBase64) {
    return Response.json({ error: "poNumber, filename, and fileBase64 are required" }, { status: 400 });
  }
  if ((contentType || "").toLowerCase() !== "application/pdf") {
    return Response.json({ error: "Only PDF files are accepted" }, { status: 400 });
  }
  // Rough size guard: base64 ~1.37x raw.
  const rawBytes = Math.floor((fileBase64.length * 3) / 4);
  if (rawBytes > MAX_BYTES) {
    return Response.json({ error: "File too large. Max 5 MB." }, { status: 413 });
  }

  // Customers can only upload to their own client.
  let clientId;
  if (requireRole(session, "factoryos", "customer")) {
    clientId = (session.factoryosClientIds || [])[0];
    if (!clientId) return Response.json({ error: "No client linked to your account" }, { status: 400 });
  } else {
    clientId = body.clientId;
    if (!clientId) return Response.json({ error: "clientId required" }, { status: 400 });
  }

  try {
    const po = await createCustomerPO({
      poNumber: poNumber.trim(),
      clientId,
      uploadedByEmail: session.email || "",
      notes: notes || "",
    });
    await attachPoFile({
      recordId: po.id,
      contentType,
      filename,
      fileBase64,
    });
    return Response.json({ ok: true, id: po.id });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}
