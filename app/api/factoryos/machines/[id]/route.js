import { getSession, requireManager } from "@/lib/auth/session";
import { updateMachine, deleteMachine } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    if (body.name !== undefined && !body.name.trim()) {
      return Response.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    const patch = { ...body };
    if (patch.name) patch.name = patch.name.trim();
    const machine = await updateMachine(params.id, patch);
    return Response.json({ machine });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const result = await deleteMachine(params.id);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
