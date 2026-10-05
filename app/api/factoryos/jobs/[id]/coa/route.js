import { getSession, requireManager } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { getCoa, saveCoa, coaDefaults } from "@/lib/factoryos/coa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// COA is an Aeros document — team only. Factory managers / admin write it.
export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  const coa = await getCoa(job.id);
  return Response.json({ coa, defaults: coa ? null : await coaDefaults(job) });
}

export async function PUT(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  if (!requireManager(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    return Response.json({ coa: await saveCoa(job.id, body, { email: session.email || null }) });
  } catch (e) {
    return Response.json({ error: e?.message || "Could not save COA" }, { status: 400 });
  }
}
