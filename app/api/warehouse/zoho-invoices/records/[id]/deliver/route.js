import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canConfirmDelivery } from "@/lib/warehouse/access";
import { confirmDelivery } from "@/lib/warehouse/outward";
import { respond, forbidden, readJson } from "../../../../_respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { deliveredOn, note } — confirm a loaded invoice reached the customer.
// Also ticks Delivery Acknowledgment on the invoice in Zoho (best effort).
export async function POST(req, { params }) {
  const session = getSession();
  if (!canConfirmDelivery(session)) return forbidden();
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  return respond(await confirmDelivery({ session, recordId: params.id, body }));
}
