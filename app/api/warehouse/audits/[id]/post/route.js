import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { postAudit } from "@/lib/warehouse/audits";

export const dynamic = "force-dynamic";

export async function POST(_req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await postAudit(params.id, session.email);
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
