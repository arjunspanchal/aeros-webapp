import { getSession, requireManager } from "@/lib/auth/session";
import { setPortalPassword, clearPortalPassword } from "@/lib/factoryos/printerAuth";

export const runtime = "nodejs";

// POST { password } sets the vendor's /printer password; { password: "" } removes access.
export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    if (!body.password) { await clearPortalPassword(params.id); return Response.json({ ok: true, cleared: true }); }
    await setPortalPassword(params.id, body.password);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e?.message || "Could not set password" }, { status: 400 });
  }
}
