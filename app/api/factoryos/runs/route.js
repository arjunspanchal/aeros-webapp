import { getSession, requireManager } from "@/lib/auth/session";
import { listRuns, createRun } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const runs = await listRuns({
      machineId: url.searchParams.get("machineId") || undefined,
      status: url.searchParams.get("status") || undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    });
    return Response.json({ runs });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    if (!body.machineId) {
      return Response.json({ error: "Machine is required" }, { status: 400 });
    }
    const run = await createRun({
      ...body,
      operatorEmail: body.operatorEmail || session.email || "",
      operatorName: body.operatorName || session.name || "",
    });
    return Response.json({ run });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
