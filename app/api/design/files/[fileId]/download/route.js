import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { getDesignFileSignedUrl } from "@/lib/design/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/design/files/[fileId]/download
// Returns a 302 redirect to a 5-minute signed Supabase Storage URL so the
// browser fetches the binary directly without proxying through our app.
// Auth: any session (browse + download is open to authenticated users).
export async function GET(_request, { params }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fileId = params?.fileId;
  if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });

  try {
    const result = await getDesignFileSignedUrl(fileId);
    if (!result?.url) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.redirect(result.url, 302);
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Download URL failed" },
      { status: 500 },
    );
  }
}
