import { getSession, hasModule } from "@/lib/auth/session";
import { deleteAttendance } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    await deleteAttendance(params.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
