import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canViewWarehouse, canWorkWarehouse } from "@/lib/warehouse/access";
import { invoiceDetail, recordInvoice } from "@/lib/warehouse/outward";
import { respond, forbidden, readJson, zohoDown } from "../../_respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  — one Zoho invoice: lines, remembered item links, rack stock, its job.
// POST — record it: { status: "loaded" | "not_from_warehouse", ... }.
export async function GET(_req, { params }) {
  const session = getSession();
  if (!canViewWarehouse(session)) return forbidden();
  try {
    const d = await invoiceDetail(params.id);
    return d ? NextResponse.json(d) : NextResponse.json({ error: "Zoho has no such invoice" }, { status: 404 });
  } catch (e) { return zohoDown(e, "zoho invoice detail"); }
}

export async function POST(req, { params }) {
  const session = getSession();
  if (!canWorkWarehouse(session)) return forbidden("Only the warehouse team can record a dispatch");
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try { return respond(await recordInvoice({ session, zohoInvoiceId: params.id, body })); }
  catch (e) { console.error("record invoice failed:", e?.message || e); return NextResponse.json({ error: e.message || "Could not record this invoice" }, { status: 500 }); }
}
