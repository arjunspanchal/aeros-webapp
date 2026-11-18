import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory, canSeeStock, listLocations } from "@/lib/warehouse/inventory";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = getSession();
  if (!canSeeStock(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const locations = await listLocations();
  return NextResponse.json({ locations });
}
