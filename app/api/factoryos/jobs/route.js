import { getSession as getFactoryosSession } from "@/lib/factoryos/session";
import { getSession, requireInternal, requireManager, requireRole } from "@/lib/auth/session";
import { listJobsForSession, createJob } from "@/lib/factoryos/repo";
import { STAGES, CATEGORIES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  // listJobsForSession reads s.role / s.userId / s.clientIds for FM-scoping
  // and AM-scoping. Pass the legacy session through; PR 1.5 collapses.
  const s = getFactoryosSession();
  try {
    const jobs = await listJobsForSession(s);
    return Response.json({ jobs });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  // Allow admin / factory manager / account manager to create jobs.
  // FE is shop-floor and shouldn't open new jobs; CUSTOMER is already
  // blocked by requireInternal().
  if (!requireManager(session) && !requireRole(session, "factoryos", "account_manager")) {
    return Response.json({ error: "Only admin, factory manager or account manager can create jobs" }, { status: 403 });
  }
  try {
    const body = await req.json();
    if (!body.jNumber || !body.clientId || !body.item) {
      return Response.json({ error: "J#, client, and item are required" }, { status: 400 });
    }
    // Every new job must map to a row in Aeros Products Master so FG inventory can be tracked by SKU.
    if (!body.masterSku || !String(body.masterSku).trim()) {
      return Response.json(
        { error: "Pick a product from the master catalogue — required so this job maps to an SKU." },
        { status: 400 },
      );
    }
    if (body.stage && !STAGES.includes(body.stage)) {
      return Response.json({ error: "Invalid stage" }, { status: 400 });
    }
    if (body.category && !CATEGORIES.includes(body.category)) {
      return Response.json({ error: "Invalid category" }, { status: 400 });
    }
    const job = await createJob({
      stage: STAGES[0],
      ...body,
    });
    return Response.json({ job });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
