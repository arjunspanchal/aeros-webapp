import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { addLine } from "@/lib/warehouse/audits";

export const dynamic = "force-dynamic";

// POST adds an ad-hoc line to an audit (counter found stock not in snapshot).
export async function POST(req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.item_id || !body.location_id) {
    return NextResponse.json({ error: "item_id and location_id required" }, { status: 400 });
  }
  try {
    const result = await addLine(params.id, body.item_id, body.location_id);
    return NextResponse.json({ line: result }, { status: result.created ? 201 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
