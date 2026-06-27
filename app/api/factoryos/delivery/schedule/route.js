import { getSession, requireInternal } from "@/lib/auth/session";
import { sessionCanSeeJob } from "@/lib/factoryos/jobAccess";
import {
  getJob,
  addScheduleRow,
  updateScheduleRow,
  deleteScheduleRow,
} from "@/lib/factoryos/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Internal staff manage the committed dispatch schedule for a job (PO line).
// Every verb checks the caller is internal AND can see the job in question.
async function guard(session, jobId) {
  if (!session) return { error: "Unauthorized", status: 401 };
  if (!requireInternal(session)) return { error: "Forbidden", status: 403 };
  if (!jobId) return { error: "jobId required", status: 400 };
  const job = await getJob(jobId);
  if (!job) return { error: "Job not found", status: 404 };
  if (!sessionCanSeeJob(session, job)) return { error: "Forbidden", status: 403 };
  return { job };
}

// POST { jobId, dispatchDate, qty, note? } — add a committed dispatch row.
export async function POST(req) {
  const session = getSession();
  const body = await req.json().catch(() => ({}));
  const g = await guard(session, body.jobId);
  if (g.error) return Response.json({ error: g.error }, { status: g.status });
  if (!body.dispatchDate) return Response.json({ error: "dispatchDate required" }, { status: 400 });
  try {
    const row = await addScheduleRow(body.jobId, {
      dispatchDate: body.dispatchDate,
      qty: body.qty,
      note: body.note,
      email: session.email || null,
    });
    return Response.json({ row });
  } catch (e) {
    console.error("schedule add failed:", e);
    return Response.json({ error: e?.message || "Could not add" }, { status: 500 });
  }
}

// PATCH { id, jobId, dispatchDate?, qty?, status?, note? } — edit a row.
export async function PATCH(req) {
  const session = getSession();
  const body = await req.json().catch(() => ({}));
  const g = await guard(session, body.jobId);
  if (g.error) return Response.json({ error: g.error }, { status: g.status });
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    const row = await updateScheduleRow(body.id, {
      dispatchDate: body.dispatchDate,
      qty: body.qty,
      status: body.status,
      note: body.note,
    });
    return Response.json({ row });
  } catch (e) {
    console.error("schedule update failed:", e);
    return Response.json({ error: e?.message || "Could not update" }, { status: 500 });
  }
}

// DELETE ?id=&jobId= — remove a row.
export async function DELETE(req) {
  const session = getSession();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const jobId = url.searchParams.get("jobId");
  const g = await guard(session, jobId);
  if (g.error) return Response.json({ error: g.error }, { status: g.status });
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    await deleteScheduleRow(id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("schedule delete failed:", e);
    return Response.json({ error: e?.message || "Could not delete" }, { status: 500 });
  }
}
