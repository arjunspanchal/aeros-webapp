import { getSession, requireInternal } from "@/lib/auth/session";
import { listDesigns, createDesign } from "@/lib/dieline/designs-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Saved dieline designs are internal: staff only, never customers or vendors.
function guard(session) {
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  return null;
}

export async function GET() {
  const session = getSession(), bad = guard(session);
  if (bad) return bad;
  try { return Response.json({ designs: await listDesigns() }); }
  catch (e) { console.error(e); return Response.json({ error: e.message || "Failed" }, { status: 500 }); }
}

export async function POST(req) {
  const session = getSession(), bad = guard(session);
  if (bad) return bad;
  try { return Response.json({ design: await createDesign(await req.json().catch(() => ({})), session.email || session.name || null) }); }
  catch (e) { console.error(e); return Response.json({ error: e.message || "Failed" }, { status: 400 }); }
}
