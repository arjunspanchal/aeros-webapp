import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageClearance, createItem } from "@/lib/clearance/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/clearance/items
// Body: { itemName (required), brand?, category?, stockQuantity?, unit?,
//         casePack?, price?, priceUnit?, description?, specifications?,
//         status?, location?, gsm?, rmForm?, rmType? }
// Returns: { item } — the normalized newly-created row.
export async function POST(request) {
  const session = getSession();
  if (!canManageClearance(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const itemName = (body?.itemName || "").trim();
  if (!itemName) {
    return NextResponse.json({ error: "Item name is required" }, { status: 400 });
  }

  try {
    const item = await createItem(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Create failed" },
      { status: 500 },
    );
  }
}
