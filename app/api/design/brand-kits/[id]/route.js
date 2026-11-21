import { getSession, requireInternal } from "@/lib/auth/session";
import { getKit, dropLogo, archiveKit } from "@/lib/dieline/brand-kits-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(session) {
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  return null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req, { params }) {
  const session = getSession(), bad = guard(session);
  if (bad) return bad;
  if (!UUID.test(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  try { const kit = await getKit(params.id); return kit ? Response.json({ kit }) : Response.json({ error: "Not found" }, { status: 404 }); }
  catch (e) { console.error(e); return Response.json({ error: e.message || "Failed" }, { status: 500 }); }
}

// DELETE ?logo=<key> takes one logo out; without it the whole kit leaves the list (archived, the row stays)
export async function DELETE(req, { params }) {
  const session = getSession(), bad = guard(session);
  if (bad) return bad;
  if (!UUID.test(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const key = new URL(req.url).searchParams.get("logo"), who = session.email || session.name || null;
    if (key) await dropLogo(params.id, key, who); else await archiveKit(params.id, who);
    return Response.json({ ok: true });
  } catch (e) { console.error(e); return Response.json({ error: e.message || "Failed" }, { status: 400 }); }
}
