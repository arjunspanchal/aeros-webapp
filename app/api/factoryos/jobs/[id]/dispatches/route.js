import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { listDispatches, addDispatch, deleteDispatch, roleOf } from "@/lib/factoryos/transitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dispatch lots for a job: what actually left, with the Zoho invoice number.
//   GET    -> { lots }                       any internal staff who can see the job
//   POST   -> record a lot                   warehouse or admin
//   DELETE ?lotId= -> remove a wrong entry   warehouse or admin
const CAN_DISPATCH = new Set(["admin", "warehouse"]);

export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ lots: await listDispatches(job.id) });
}

export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  if (!CAN_DISPATCH.has(roleOf(session))) {
    return Response.json({ error: "Dispatch is recorded by the warehouse team." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const res = await addDispatch({ session, jobId: job.id, body });
    if (!res.ok) return Response.json({ error: res.error, missing: res.missing || [] }, { status: res.status });
    return Response.json({ job: res.job, lots: await listDispatches(job.id), dispatchedQty: res.dispatchedQty });
  } catch (e) {
    console.error("dispatch add failed:", e);
    return Response.json({ error: e?.message || "Could not record dispatch" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  if (!CAN_DISPATCH.has(roleOf(session))) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (job.stage !== "Ready for Dispatch") {
    return Response.json({ error: "A dispatch can only be removed while the job is still at Ready for Dispatch." }, { status: 409 });
  }
  const lotId = new URL(req.url).searchParams.get("lotId");
  if (!lotId) return Response.json({ error: "lotId required" }, { status: 400 });
  const res = await deleteDispatch({ jobId: job.id, lotId });
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  return Response.json({ lots: res.lots, dispatchedQty: res.dispatchedQty });
}
