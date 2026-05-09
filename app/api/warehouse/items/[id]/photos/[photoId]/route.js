import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { deleteItemPhoto } from "@/lib/warehouse/itemPhotos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/warehouse/items/[id]/photos/[photoId] — remove one photo.
// Storage object first (best-effort), then DB row. Idempotent on missing row.
export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!canManageInventory(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!params?.id || !params?.photoId) {
    return NextResponse.json({ error: "Missing id or photoId" }, { status: 400 });
  }
  try {
    const result = await deleteItemPhoto(params.photoId);
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}
