import { getSession, requireInternal } from "@/lib/auth/session";
import { addTaskComment } from "@/lib/factoryos/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const out = await addTaskComment(params.id, body.body, session);
    if (out.error) return Response.json({ error: out.error }, { status: out.status || 400 });
    return Response.json(out);
  } catch (e) {
    console.error("task comment failed:", e);
    return Response.json({ error: "Couldn't save the comment" }, { status: 500 });
  }
}
