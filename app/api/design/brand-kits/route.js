import { getSession, requireInternal } from "@/lib/auth/session";
import { listKits, saveKit } from "@/lib/dieline/brand-kits-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Brand kits are internal: staff only, never customers or vendors.
function guard(session) {
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  return null;
}

export async function GET() {
  const session = getSession(), bad = guard(session);
  if (bad) return bad;
  try { return Response.json({ kits: await listKits() }); }
  catch (e) { console.error(e); return Response.json({ error: e.message || "Failed" }, { status: 500 }); }
}

export async function POST(req) {
  const session = getSession(), bad = guard(session);
  if (bad) return bad;
  try { const kit = await saveKit(await req.json().catch(() => ({})), session.email || session.name || null); return Response.json({ kit: { id: kit.id, customer: kit.customer, logo_names: kit.logo_names, colours: kit.colours } }); }
  catch (e) { console.error(e); return Response.json({ error: e.message || "Failed" }, { status: 400 }); }
}
