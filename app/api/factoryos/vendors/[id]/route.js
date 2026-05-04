import { getSession, requireManager } from "@/lib/auth/session";
import { updateVendor, deleteVendor } from "@/lib/factoryos/repo";
import { VENDOR_TYPES } from "@/lib/factoryos/constants";

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
    if (body.type !== undefined && !VENDOR_TYPES.includes(body.type)) {
      return Response.json({ error: `Type must be one of: ${VENDOR_TYPES.join(", ")}` }, { status: 400 });
    }
    const patch = { ...body };
    if (patch.name) patch.name = patch.name.trim();
    const vendor = await updateVendor(params.id, patch);
    return Response.json({ vendor });
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
    const result = await deleteVendor(params.id);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
