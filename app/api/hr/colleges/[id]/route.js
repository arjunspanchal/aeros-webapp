import { getSession, hasModule } from "@/lib/auth/session";
import { updateCollege, deleteCollege } from "@/lib/hr/colleges";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    const college = await updateCollege(params.id, body);
    return Response.json({ college });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}

export async function DELETE(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    await deleteCollege(params.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
