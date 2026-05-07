import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { listMovements, postMovement } from "@/lib/warehouse/movements";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const movements = await listMovements({
    type:     searchParams.get("type") || "",
    fromDate: searchParams.get("from") || "",
    toDate:   searchParams.get("to") || "",
    search:   searchParams.get("q") || "",
    limit:    Number(searchParams.get("limit") || 200),
  });
  return NextResponse.json({ movements });
}

export async function POST(req) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await postMovement(body, session.email);
    return NextResponse.json({ movement: result }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
