import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canAdminStudio, listRuleVersions, spendSummary } from "@/lib/design/artwork-studio";
import { dbSelect, dbUpdate } from "@/lib/db/supabase";

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
  const who = session.name || session.email;
  const now = new Date().toISOString();

  if (b.action === "publish") {
    const [v] = await dbSelect("artwork_studio_rule_versions", { filter: { id: `eq.${b.versionId}` }, limit: 1 });
    if (!v) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    // Retire the current live version first — the unique index allows one.
    const live = await dbSelect("artwork_studio_rule_versions", { select: "id", filter: { status: "eq.live" } });
    for (const l of live) {
      if (l.id !== v.id) await dbUpdate("artwork_studio_rule_versions", "id", l.id, { status: "retired" }, { returning: "minimal" });
    }
    await dbUpdate("artwork_studio_rule_versions", "id", v.id, { status: "live", published_by: who, published_at: now }, { returning: "minimal" });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "resolveFlag") {
    await dbUpdate("artwork_studio_flags", "id", b.flagId, { status: "resolved", resolved_by: who, resolved_at: now }, { returning: "minimal" });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
