import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { invoiceDetail, recordInvoice } from "@/lib/warehouse/invoiceDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  — one Zoho invoice with its lines, remembered item links, rack stock and job.
// POST — record it: { status: "loaded" | "not_from_warehouse", ... }.
export async function GET(_req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const d = await invoiceDetail(params.id);
    if (!d) return NextResponse.json({ error: "Zoho has no such invoice" }, { status: 404 });
    return NextResponse.json(d);
  } catch (e) {
    console.error("zoho invoice detail failed:", e?.message || e);
    return NextResponse.json({ error: "Couldn't reach Zoho right now. Try again in a minute." }, { status: 502 });
  }
}

export async function POST(req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const res = await recordInvoice({ session, zohoInvoiceId: params.id, body });
    const { status, ok, ...rest } = res;
    return NextResponse.json(ok ? rest : { error: res.error }, { status });
  } catch (e) {
    console.error("zoho invoice record failed:", e?.message || e);
    return NextResponse.json({ error: e.message || "Could not record this invoice" }, { status: 500 });
  }
}
