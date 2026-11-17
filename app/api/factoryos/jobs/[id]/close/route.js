import { getSession, requireManager } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { postJobMessage } from "@/lib/factoryos/repo";
import { reopenJob } from "@/lib/factoryos/closeJob";
import { moveStage } from "@/lib/factoryos/transitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { fgQty, fgCartons?, note? }  -> close the job, hand FG to warehouse
// POST { action: "reopen" }           -> undo (admin / factory manager)
export async function POST(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") return Response.json({ error: "Not found" }, { status: 404 });
  if (!requireManager(session)) return Response.json({ error: "Only a factory manager or admin can close a job" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "reopen") {
      await reopenJob(job.id);
      await postJobMessage({ jobId: job.id, body: "Job reopened by factory", authorEmail: session.email || null, authorRole: "team", kind: "system" }).catch(() => {});
      return Response.json({ ok: true });
    }
    const moved = await moveStage({
      session, jobId: job.id, to: "Ready for Dispatch",
      fields: { fgQty: body.fgQty, fgCartons: body.fgCartons, closeNote: body.note },
      note: "Handed to warehouse",
    });
    if (!moved.ok) return Response.json({ error: moved.error, missing: moved.missing || [] }, { status: moved.status });
    await postJobMessage({
      jobId: job.id,
      body: `Job closed — ${Number(body.fgQty).toLocaleString("en-IN")} pcs${body.fgCartons ? ` in ${body.fgCartons} cartons` : ""} handed to warehouse${body.note ? ` · ${body.note}` : ""}`,
      authorEmail: session.email || null, authorRole: "team", kind: "system",
    }).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e?.message || "Could not close job" }, { status: 400 });
  }
}
