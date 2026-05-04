import { getSession, requireManager } from "@/lib/auth/session";
import { getRun, updateRun, deleteRun, listConsumptionForRun } from "@/lib/factoryos/repo";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return new Response("Forbidden", { status: 403 });
  try {
    const run = await getRun(params.id);
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
    const consumption = await listConsumptionForRun(params.id);
    return Response.json({ run, consumption });
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
    const run = await updateRun(params.id, body);
    return Response.json({ run });
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
    const result = await deleteRun(params.id);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
