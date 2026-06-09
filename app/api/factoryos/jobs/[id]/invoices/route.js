import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { listJobInvoices, createVendorInvoice } from "@/lib/factoryos/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);
const CURRENCIES = new Set(["INR", "USD", "EUR", "GBP"]);

// GET — invoices submitted against this job (team or owning vendor).
export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || !access) return Response.json({ error: "Not found" }, { status: 404 });
  const invoices = await listJobInvoices(job.id);
  return Response.json({ invoices });
}

// POST — submit an invoice (vendor, or team on the vendor's behalf).
export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access, vendor } = await resolveJobAccess(session, params.id);
  if (!job || !access) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { invoiceNo, amount, invoiceDate, filename, contentType, fileBase64, currency } = body;
  if (!invoiceNo && !fileBase64) {
    return Response.json({ error: "Invoice number or file required" }, { status: 400 });
  }
  // Validate amount (≥ 0, finite) + currency so payables stays clean (audit L1).
  let amountNum = null;
  if (amount !== "" && amount != null) {
    amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      return Response.json({ error: "Amount must be a positive number" }, { status: 400 });
    }
  }
  const cur = (currency || "INR").toUpperCase();
  if (!CURRENCIES.has(cur)) {
    return Response.json({ error: "Unsupported currency" }, { status: 400 });
  }
  if (fileBase64) {
    if (!ALLOWED.has((contentType || "").toLowerCase())) {
      return Response.json({ error: "Invoice must be PDF, JPG, or PNG" }, { status: 400 });
    }
    const rawBytes = Math.floor((fileBase64.length * 3) / 4);
    if (rawBytes > MAX_BYTES) return Response.json({ error: "File too large. Max 15 MB." }, { status: 413 });
  }
  if (invoiceDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(invoiceDate).slice(0, 10))) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }

  try {
    const invoice = await createVendorInvoice({
      jobId: job.id,
      vendorId: vendor?.id || job.printingVendorId || null,
      invoiceNo,
      amount: amountNum,
      currency: cur,
      invoiceDate: invoiceDate ? String(invoiceDate).slice(0, 10) : null,
      filename,
      contentType,
      fileBase64,
      submittedByEmail: session.email || null,
    });
    const invoices = await listJobInvoices(job.id);
    return Response.json({ invoice, invoices });
  } catch (e) {
    console.error("invoice create failed:", e);
    return Response.json({ error: "Could not submit invoice" }, { status: 500 });
  }
}
