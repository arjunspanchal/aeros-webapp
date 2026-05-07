import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { getMovement } from "@/lib/warehouse/movements";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const movement = await getMovement(params.id);
  if (!movement) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ movement });
}
