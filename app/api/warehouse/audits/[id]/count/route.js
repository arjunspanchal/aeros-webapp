import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { recordCount } from "@/lib/warehouse/audits";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.line_id) return NextResponse.json({ error: "line_id required" }, { status: 400 });
  try {
    const line = await recordCount(body.line_id, {
      counted_qty: body.counted_qty,
      remarks: body.remarks,
    }, session.email);
    return NextResponse.json({ line });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
