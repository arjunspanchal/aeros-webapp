import { getSession, requireInternal } from "@/lib/auth/session";
import { getDesign, updateDesign, archiveDesign } from "@/lib/dieline/designs-repo";

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
  try { const design = await getDesign(params.id); return design ? Response.json({ design }) : Response.json({ error: "Not found" }, { status: 404 }); }
  catch (e) { console.error(e); return Response.json({ error: e.message || "Failed" }, { status: 500 }); }
}

export async function PUT(req, { params }) {
  const session = getSession(), bad = guard(session);
  if (bad) return bad;
  if (!UUID.test(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  try { return Response.json({ design: await updateDesign(params.id, await req.json().catch(() => ({})), session.email || session.name || null) }); }
  catch (e) { console.error(e); return Response.json({ error: e.message || "Failed" }, { status: 400 }); }
}

// "Delete" = archive: the row stays, it just leaves the list.
export async function DELETE(_req, { params }) {
  const session = getSession(), bad = guard(session);
  if (bad) return bad;
  if (!UUID.test(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  try { await archiveDesign(params.id, session.email || session.name || null); return Response.json({ ok: true }); }
  catch (e) { console.error(e); return Response.json({ error: e.message || "Failed" }, { status: 400 }); }
}
