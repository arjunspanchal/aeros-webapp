// RFQ Manager API. POST = upload PDF (admin / customer manager / factory
// staff). GET = list quotes; admin sees all (with optional clientEmail/
// clientId filter), customers see only their own.

import { getSession } from "@/lib/auth/session";
import { requireInternal } from "@/lib/auth/policy";
import { listRfqQuotes, createRfqQuote } from "@/lib/rfq/store";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("q") || "";

  // Customer scope: locked to their own email.
  if (session.modules?.factoryos === "customer") {
    if (!session.email) return Response.json({ quotes: [] });
    const quotes = await listRfqQuotes({ clientEmail: session.email, search });
    return Response.json({ quotes });
  }

  // Internal scope: pass through filters.
  const clientEmail = searchParams.get("clientEmail") || undefined;
  const clientId = searchParams.get("clientId") || undefined;
  const quotes = await listRfqQuotes({ clientEmail, clientId, search });
  return Response.json({ quotes });
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) {
    return Response.json({ error: "Only internal users can upload RFQs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const {
    aerosRfqNumber,
    customerRfqNumber,
    clientId,
    clientEmail,
    brand,
    productName,
    notes,
    filename,
    contentType,
    fileBase64,
  } = body;

  if (!aerosRfqNumber || !String(aerosRfqNumber).trim()) {
    return Response.json({ error: "Aeros RFQ number is required" }, { status: 400 });
  }
  if (!filename) {
    return Response.json({ error: "Filename is required" }, { status: 400 });
  }
  if (!fileBase64) {
    return Response.json({ error: "File payload is required" }, { status: 400 });
  }
  if (!clientEmail && !clientId) {
    return Response.json({ error: "Pick a client (email or ID) so the customer can see this RFQ" }, { status: 400 });
  }

  const ct = (contentType || "application/pdf").toLowerCase();
  if (!ct.includes("pdf")) {
    return Response.json({ error: "Only PDF uploads are supported" }, { status: 400 });
  }

  // Reject oversize early — base64 expands ~1.37x; 14 MB string ≈ 10 MB binary.
  const approxBytes = Math.floor((fileBase64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return Response.json({ error: "File exceeds 10 MB limit" }, { status: 400 });
  }

  try {
    const quote = await createRfqQuote({
      aerosRfqNumber,
      customerRfqNumber,
      clientId,
      clientEmail,
      brand,
      productName,
      notes,
      filename,
      contentType: ct,
      fileBase64,
      bytes: approxBytes,
      uploadedBy: session.email || (session.isAdmin ? "admin" : null),
    });
    return Response.json({ quote });
  } catch (err) {
    console.error("[rfq] create failed", err);
    return Response.json({ error: err?.message || "Upload failed" }, { status: 500 });
  }
}
