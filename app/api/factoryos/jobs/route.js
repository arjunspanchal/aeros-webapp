import { getSession, requireInternal, requireManager, requireRole } from "@/lib/auth/session";
import { listJobsForSession, createJob, setJobDelivery } from "@/lib/factoryos/repo";
import { STAGES } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    // listJobsForSession reads .role / .userId / .clientIds. Build the
    // legacy shape inline from the unified session — keeps the helper
    // signature unchanged.
    const jobs = await listJobsForSession({
      role: session.modules?.factoryos,
      userId: session.factoryosUserId,
      clientIds: session.factoryosClientIds,
    });
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
    // Traded (non-factory) jobs are bought-in items (e.g. foils) that skip the
    // production pipeline — but they still pick a product from the catalogue, so
    // the master-SKU requirement below applies to them too.
    const isTraded = body.sourcing === "traded";
    if (body.sourcing !== undefined && body.sourcing !== "traded" && body.sourcing !== "in_house") {
      return Response.json({ error: "Invalid sourcing" }, { status: 400 });
    }
    if (!body.jNumber || !body.clientId || !body.item) {
      return Response.json({ error: "J#, client, and item are required" }, { status: 400 });
    }
    // Every job must map to a row in Aeros Products Master so FG inventory can
    // be tracked by SKU — including traded items (already in the catalogue).
    if (!body.masterSku || !String(body.masterSku).trim()) {
      return Response.json(
        { error: "Pick a product from the master catalogue — required so this job maps to an SKU." },
        { status: 400 },
      );
    }
    if (body.stage && !STAGES.includes(body.stage)) {
      return Response.json({ error: "Invalid stage" }, { status: 400 });
    }
    // Category used to be CATEGORIES.includes()-gated, but that hardcoded
    // list (Paper Bag / Paper Cups / Food Box / Tub / Other) didn't match
    // the actual catalog taxonomy (Cups / Lids / Take Out Containers / …)
    // — so any non-overlapping catalog value got rejected, forcing the UI
    // gate to silently fall back to a default. Source of truth is the
    // catalog. Just require a non-empty trimmed string up to a sane cap.
    // Audit finding C6.
    if (body.category !== undefined && body.category !== null) {
      const c = String(body.category).trim();
      if (c.length > 80) {
        return Response.json({ error: "Category too long" }, { status: 400 });
      }
      body.category = c || undefined;
    }
    const { orderRate, ...rest } = body;
    const job = await createJob({
      stage: STAGES[0],
      ...rest,
      sourcing: isTraded ? "traded" : "in_house",
    });
    // order_rate lives on a PG column outside the Airtable shim — set it after
    // create. Mainly used for traded items (open value / rate on the plan).
    if (orderRate !== undefined && orderRate !== null && orderRate !== "") {
      await setJobDelivery(job.id, { orderRate }).catch((e) =>
        console.error("set order_rate on new job failed:", e),
      );
    }
    return Response.json({ job });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
