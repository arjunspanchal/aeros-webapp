import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canViewWarehouse, canWorkWarehouse } from "@/lib/warehouse/access";
import { poDetail, recordPoReceipt } from "@/lib/warehouse/inward";
import { respond, forbidden, readJson, zohoDown } from "../../../_respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  — one Zoho purchase order: lines, what has come in so far, item links.
// POST — receive against it: { status: "received" | "not_to_warehouse", ... }.
export async function GET(_req, { params }) {
  const session = getSession();
  if (!canViewWarehouse(session)) return forbidden();
  try {
    const d = await poDetail(params.id);
    return d ? NextResponse.json(d) : NextResponse.json({ error: "Zoho has no such purchase order" }, { status: 404 });
  } catch (e) { return zohoDown(e, "zoho po detail"); }
}

export async function POST(req, { params }) {
  const session = getSession();
  if (!canWorkWarehouse(session)) return forbidden("Only the warehouse team can receive goods");
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try { return respond(await recordPoReceipt({ session, zohoPoId: params.id, body })); }
  catch (e) { console.error("po receipt failed:", e?.message || e); return NextResponse.json({ error: e.message || "Could not record this receipt" }, { status: 500 }); }
}
