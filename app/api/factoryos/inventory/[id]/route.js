import { getSession, requireManager } from "@/lib/auth/session";
import { updateRawMaterial, deleteRawMaterial } from "@/lib/factoryos/repo";

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
    const stockLine = await updateRawMaterial(params.id, body);
    return Response.json({ stockLine });
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
    const result = await deleteRawMaterial(params.id);
    return Response.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
