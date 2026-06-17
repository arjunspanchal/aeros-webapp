// Hiring pipeline: move a candidate between stages, edit fields, or delete.
import { getSession, hasModule } from "@/lib/auth/session";
import { updateCandidate, deleteCandidate } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const candidate = await updateCandidate(params.id, body);
    return Response.json({ candidate });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    await deleteCandidate(params.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
