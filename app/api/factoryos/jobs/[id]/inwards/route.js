import { getSession, requireManager } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { postJobMessage } from "@/lib/factoryos/repo";
import { listJobInwards, addJobInward, deleteJobInward } from "@/lib/factoryos/inwards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inward receipts are the factory's record of what came back from the
// printer — internal only. The vendor sees their own dispatch milestone,
// not our count.
export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ inwards: await listJobInwards(job.id) });
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
    const inward = await addJobInward(job.id, body, { email: session.email || null, vendor: job.printingVendor });
    await postJobMessage({
      jobId: job.id,
      body: `Inward: ${inward.qty.toLocaleString("en-IN")} ${inward.unit} received${inward.damagedQty ? ` (${inward.damagedQty.toLocaleString("en-IN")} damaged)` : ""}${inward.fromVendor ? ` from ${inward.fromVendor}` : ""}`,
      authorEmail: session.email || null,
      authorRole: "team",
      kind: "system",
    }).catch(() => {});
    return Response.json({ inward, inwards: await listJobInwards(job.id) });
  } catch (e) {
    return Response.json({ error: e?.message || "Could not record inward" }, { status: 400 });
  }
}

export async function DELETE(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  if (!requireManager(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const ok = await deleteJobInward(job.id, id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ inwards: await listJobInwards(job.id) });
}
