import { NextResponse } from "next/server";
import { studioGuard } from "../../../_access";
import { dbInsert } from "@/lib/db/supabase";
import { userKey } from "@/lib/design/artwork-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { note } — staff report a problem with a result; Arjun fixes the rule
// in Cowork, republishes, and resolves the flag.
export async function POST(request, { params }) {
  const { session, job, error } = await studioGuard(params.id);
  if (error) return error;
  const { note } = await request.json().catch(() => ({}));
  const text = String(note || "").trim();
  if (!text) return NextResponse.json({ error: "Say what went wrong" }, { status: 400 });
  await dbInsert("artwork_studio_flags", [{
    job_id: job.id,
    created_by_email: userKey(session),
    created_by_name: session.name || userKey(session),
    note: text.slice(0, 2000),
  }], { returning: "minimal" });
  return NextResponse.json({ ok: true });
}
