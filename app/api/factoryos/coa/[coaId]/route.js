import { getSession, requireManager } from "@/lib/auth/session";
import { updateStandaloneCoa } from "@/lib/factoryos/coa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    const coa = await updateStandaloneCoa(params.coaId, body, { email: session.email || null });
    if (!coa) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ coa });
  } catch (e) {
    return Response.json({ error: e?.message || "Could not save COA" }, { status: 400 });
  }
}
