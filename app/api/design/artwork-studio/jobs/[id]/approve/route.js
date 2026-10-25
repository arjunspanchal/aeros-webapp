import { NextResponse } from "next/server";
import { studioGuard } from "../../../_access";
import { canApprove } from "@/lib/design/artwork-studio";
import { dbUpdate } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — approve the latest print file version (Admin / Factory Manager).
export async function POST(_request, { params }) {
  const { session, job, error } = await studioGuard(params.id);
  if (error) return error;
  if (!canApprove(session)) return NextResponse.json({ error: "Only Arjun or a factory manager can approve" }, { status: 403 });
  const versions = (job.outputs || []).filter((o) => o.kind === "print" && o.version != null).map((o) => o.version);
  if (!versions.length) return NextResponse.json({ error: "No print file to approve yet" }, { status: 400 });
  const approved_version = Math.max(...versions);
  await dbUpdate("artwork_studio_jobs", "id", job.id, {
    approved_version,
    approved_by: session.name || session.email,
    approved_at: new Date().toISOString(),
  }, { returning: "minimal" });
  return NextResponse.json({ ok: true, approvedVersion: approved_version });
}
