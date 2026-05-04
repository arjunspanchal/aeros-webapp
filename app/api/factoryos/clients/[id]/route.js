import { getSession, requireManager } from "@/lib/auth/session";
import { updateClient, deleteClient, countJobsForClient } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

// GET /api/factoryos/clients/[id]?count=jobs
// Preview endpoint used by the admin UI before destructive delete.
export async function GET(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("count") === "jobs") {
      const jobCount = await countJobsForClient(params.id);
      return Response.json({ jobCount });
    }
    return Response.json({ error: "Specify ?count=jobs" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    if (body.name !== undefined && !body.name.trim()) {
      return Response.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    const client = await updateClient(params.id, body);
    return Response.json({ client });
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
    const result = await deleteClient(params.id);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
