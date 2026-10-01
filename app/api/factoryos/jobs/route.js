import { getSession, requireInternal, requireManager, requireRole } from "@/lib/auth/session";
import { routeAt } from "@/lib/factoryos/routes";
import { listRmStockOptions, rmStockFree } from "@/lib/factoryos/rmStock";
import { copyJobOrder } from "@/lib/factoryos/jobOrder";
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
  // Factory managers (Rahul / Sachin) or admin only — Arjun, 01-Oct-2026.
  if (!requireManager(session)) {
    return Response.json({ error: "Only a factory manager or admin can create jobs" }, { status: 403 });
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
    // A job drawing from a stock line must say how much it needs — that is
    // the number the stock "free" figure is computed from.
    if (body.rmStockLineId && !(Number(body.rmQtySheets) > 0 || Number(body.rmQtyKgs) > 0)) {
      return Response.json({ error: "Enter the sheets or kg this job needs from the RM stock line." }, { status: 400 });
    }
    // Hard block on over-claiming a stock line (Arjun, 01-Oct-2026) so the
    // same paper isn't promised to two jobs. Admin may override explicitly.
    if (body.rmStockLineId) {
      const line = (await listRmStockOptions()).find((x) => x.id === body.rmStockLineId);
      const free = rmStockFree(line);
      if (free) {
        const need = Number(free.unit === "sheets" ? body.rmQtySheets : body.rmQtyKgs) || 0;
        const isAdmin = session.isAdmin || session.modules?.factoryos === "admin";
        if (need > free.free && !(isAdmin && body.overrideShortRm === true)) {
          return Response.json({
            error: `Only ${free.free.toLocaleString("en-IN")} ${free.unit} of this stock line are free — ${(need - free.free).toLocaleString("en-IN")} short. Reduce the quantity, pick another line, or order paper.`,
          }, { status: 409 });
        }
      }
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
    const { orderRate, copySpecFromJobId, overrideShortRm, ...rest } = body;
    const job = await createJob({
      stage: STAGES[0],
      ...rest,
      sourcing: isTraded ? "traded" : "in_house",
      conversionAt: routeAt(body.conversionAt),
      rmStockLineId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.rmStockLineId || "")) ? body.rmStockLineId : null,
      packingAt: routeAt(body.packingAt),
    });
    // order_rate lives on a PG column outside the Airtable shim — set it after
    // create. Mainly used for traded items (open value / rate on the plan).
    if (orderRate !== undefined && orderRate !== null && orderRate !== "") {
      await setJobDelivery(job.id, { orderRate }).catch((e) =>
        console.error("set order_rate on new job failed:", e),
      );
    }
    // Repeat order: carry the previous job's print spec over as a fresh draft.
    if (copySpecFromJobId) {
      await copyJobOrder(String(copySpecFromJobId), job.id).catch((e) => console.error("copyJobOrder failed:", e));
    }
    return Response.json({ job });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
