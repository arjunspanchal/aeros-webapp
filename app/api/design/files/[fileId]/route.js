import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageDesign, deleteDesignFile } from "@/lib/design/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/design/files/[fileId]
// Removes the file from storage + the row. Admin / FM / FE only.
export async function DELETE(_request, { params }) {
  const session = getSession();
  if (!canManageDesign(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const fileId = params?.fileId;
  if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });

  try {
    const result = await deleteDesignFile(fileId);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}
