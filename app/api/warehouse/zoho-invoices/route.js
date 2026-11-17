import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { invoiceQueue } from "@/lib/warehouse/invoiceDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/warehouse/zoho-invoices?since=YYYY-MM-DD
// Zoho invoices still to load + recently recorded ones. No rates.
export async function GET(req) {
  const session = getSession();
  if (!canManageInventory(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const since = new URL(req.url).searchParams.get("since") || "";
  return NextResponse.json(await invoiceQueue({ since }));
}
