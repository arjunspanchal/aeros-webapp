import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canAdminStudio, listRuleVersions, spendSummary, userKey } from "@/lib/design/artwork-studio";
import { dbRPC, dbSelect, dbUpdate } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — rules versions, open flags and this month's spend (admin only).
export async function GET() {
  const session = getSession();
  if (!canAdminStudio(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const [versions, flags, spend] = await Promise.all([
      listRuleVersions(),
      dbSelect("artwork_studio_flags", { order: "created_at.desc", limit: 50 }),
      spendSummary(),
    ]);
    return NextResponse.json({
      versions: versions.map(({ rules, ...v }) => ({ ...v, files: (rules || []).map((r) => r.file) })),
      flags,
      spend,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST { action: "publish", versionId } | { action: "resolveFlag", flagId }
export async function POST(request) {
  const session = getSession();
  if (!canAdminStudio(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const who = session.name || userKey(session);
  const now = new Date().toISOString();

  if (b.action === "publish") {
    // Retire + publish in one transaction (DB function) so a job starting
    // mid-publish never finds no live rules.
    try {
      await dbRPC("publish_artwork_studio_rules", { p_version_id: b.versionId, p_who: who });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }
  if (b.action === "resolveFlag") {
    await dbUpdate("artwork_studio_flags", "id", b.flagId, { status: "resolved", resolved_by: who, resolved_at: now }, { returning: "minimal" });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
