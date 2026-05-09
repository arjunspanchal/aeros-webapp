import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canAccessBrandRepo, deleteBrandFile } from "@/lib/brand/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!canAccessBrandRepo(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!params?.name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }
  try {
    // [name] is URL-encoded by Next; the path stored in the bucket is the
    // already-decoded value the GET endpoint returned.
    const result = await deleteBrandFile(decodeURIComponent(params.name));
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}
