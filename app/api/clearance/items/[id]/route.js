import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageClearance, updateItem } from "@/lib/clearance/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/clearance/items/[id]
// Body: subset of { itemName, brand, category, stockQuantity, unit,
//                   casePack, price, description, specifications, status,
//                   location, gsm, rmForm, rmType }
// updateItem() in lib/clearance/admin.js already allow-lists keys, so we
// just forward the body verbatim.
export async function PATCH(request, { params }) {
  const session = getSession();
  if (!canManageClearance(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const item = await updateItem(id, body);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Update failed" },
      { status: 500 },
    );
  }
}
