import { getSession, requireInternal } from "@/lib/auth/session";
import { getJob, listVendors } from "@/lib/factoryos/repo";
import { sessionCanSeeJob } from "@/lib/factoryos/jobAccess";
import { stepContext, listOutsourcers } from "@/lib/factoryos/transitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everything the "Next step" form needs for one job, so a job can be moved
// from the jobs list without opening its full page (Arjun, 19-Nov-2026).
// Staff only; it reads, the move itself still goes through PATCH /jobs/[id].
export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  try {
    const job = await getJob(params.id);
    if (!job) return Response.json({ error: "Not found" }, { status: 404 });
    if (!sessionCanSeeJob(session, job)) return Response.json({ error: "Forbidden" }, { status: 403 });
    const [ctx, outsourcers, printers] = await Promise.all([
      stepContext(job.id).catch(() => null),
      listOutsourcers().catch(() => []),
      listVendors({ type: "Printing", activeOnly: true }).catch(() => []),
    ]);
    return Response.json({
      job,
      ctx: ctx ? { inwardCount: ctx.inwardCount, coaCount: ctx.coaCount, lots: ctx.lots, dispatchedQty: ctx.dispatchedQty } : null,
      outsourcers,
      printingVendors: printers.map((v) => v.name),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("step read failed:", e);
    return Response.json({ error: "Couldn't load this job" }, { status: 500 });
  }
}
