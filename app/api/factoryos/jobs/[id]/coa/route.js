import { getSession, requireManager } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { listJobCoas, createJobCoa, coaDefaults } from "@/lib/factoryos/coa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// COAs are Aeros documents — team only. Factory managers / admin write them.
// One job can have many: one per dispatch lot. Edits go through
// /api/factoryos/coa/[coaId].
export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ coas: await listJobCoas(job.id), defaults: await coaDefaults(job) });
}

export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  if (!requireManager(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    return Response.json({ coa: await createJobCoa(job.id, body, { email: session.email || null }) });
  } catch (e) {
    return Response.json({ error: e?.message || "Could not save COA" }, { status: 400 });
  }
}
