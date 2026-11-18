import { getSession, requireInternal, requireManager, requireRole } from "@/lib/auth/session";
import { routeAt } from "@/lib/factoryos/routes";
import { listRmStockOptions, rmStockFree } from "@/lib/factoryos/rmStock";
import { copyJobOrder } from "@/lib/factoryos/jobOrder";
import { listJobsForSession, createJob, setJobDelivery, getNextJobNumber, customerSafeJob, vendorSafeJob, addJobUpdate, getClient, updateClient } from "@/lib/factoryos/repo";
import { STAGES } from "@/lib/factoryos/constants";
import { cleanFeatures } from "@/lib/factoryos/jobOptions";
import { dbSelect, dbUpdate, findOne, publicId } from "@/lib/db/supabase";
import { getSalesOrderByNumber, normaliseSoNumber, zohoConfigured } from "@/lib/zoho/books";

export const runtime = "nodejs";

// Every job needs a sales manager (Arjun, 17-Nov-2026). When a caller doesn't
// send one (the assistant, old clients), take the manager on this customer's
// most recent job that has one.
async function lastSalesManagerFor(clientPublicId) {
  const client = await findOne("clients", clientPublicId, "id");
  if (!client) return null;
  const rows = await dbSelect("jobs", {
    select: "customer_manager_id,created_at",
    filter: { client_id: `eq.${client.id}`, customer_manager_id: "not.is.null" },
    order: "created_at.desc",
    limit: 1,
  });
  const mgrPg = rows[0]?.customer_manager_id;
  if (!mgrPg) return null;
  const user = await findOne("users", mgrPg, "id,airtable_id,active");
  return user && user.active !== false ? publicId(user) : null;
}

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
    // Outside parties get an allow-listed shape, never the raw job.
    const role = session.isAdmin ? "admin" : session.modules?.factoryos;
    if (role === "customer") return Response.json({ jobs: jobs.map(customerSafeJob) });
    if (role === "vendor") return Response.json({ jobs: jobs.map(vendorSafeJob) });
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
    // No J# given (e.g. the assistant) → take the next free one.
    if (!body.jNumber) body.jNumber = await getNextJobNumber();
    if (!body.jNumber || !body.clientId || !body.item) {
      return Response.json({ error: "J#, client, and item are required" }, { status: 400 });
    }
    // Every job hangs off exactly one Zoho sales order, and one SO has one job
    // (Arjun, 18-Nov-2026: "One SO should have one job from now on" / "without
    // SO number a job cannot be created"). Checked live against Zoho
    // (read-only). No skip, admins included.
    const soNumber = normaliseSoNumber(body.zohoSoNo);
    delete body.soSkipReason;
    if (!soNumber) return Response.json({ error: "Enter the Zoho SO number. A job can't be created without one." }, { status: 400 });
    // When Zoho can't be reached (daily API limit, outage) the job is still
    // raised, flagged zoho_so_unverified, and the Zoho check page re-checks
    // it once Zoho is back (Arjun, 18-Nov-2026). "Not in Zoho" still blocks.
    let soInfo = null;
    let soUnverified = false;
    if (!zohoConfigured()) soUnverified = true;
    else {
      try { soInfo = await getSalesOrderByNumber(soNumber); }
      catch (e) { console.error("zoho SO check failed, raising unverified:", e?.message || e); soUnverified = true; }
      if (!soUnverified && !soInfo) return Response.json({ error: `${soNumber} is not in Zoho. Check the SO number.` }, { status: 400 });
      if (soInfo && soInfo.status === "void") return Response.json({ error: `${soNumber} is void in Zoho.` }, { status: 400 });
    }
    const taken = await dbSelect("jobs", { select: "j_number", filter: { zoho_so_no: `ilike.${soNumber}` }, limit: 1 }).catch(() => []);
    if (taken && taken.length) return Response.json({ error: `${soNumber} already has job J# ${taken[0].j_number}. One SO, one job.` }, { status: 400 });
    body.zohoSoNo = soNumber;

    // The job's customer must be the SO's Zoho customer (Arjun, 18-Nov-2026).
    // A customer not yet linked to Zoho is linked here only when the user
    // ticked "same customer" on the form; names are never changed.
    let linkedClientNote = "";
    const linkClient = body.linkClientToZoho === true;
    delete body.linkClientToZoho;
    if (soInfo && soInfo.customerId) {
      const client = await getClient(body.clientId).catch(() => null);
      if (!client) return Response.json({ error: "Customer not found" }, { status: 400 });
      if (client.zohoContactId && client.zohoContactId !== soInfo.customerId) {
        return Response.json({ error: `${soInfo.number} is for ${soInfo.customer} in Zoho, but this job's customer is ${client.name}. Pick the right customer or check the SO number.` }, { status: 400 });
      }
      if (!client.zohoContactId) {
        if (!linkClient) return Response.json({ error: `${client.name} isn't linked to Zoho yet. Tick "same customer as ${soInfo.customer}" to link it, or pick the right customer.` }, { status: 400 });
        await updateClient(client.id, { zohoContactId: soInfo.customerId });
        linkedClientNote = ` · customer ${client.name} linked to Zoho ${soInfo.customer}`;
      }
    }

    if (!body.customerManagerId) body.customerManagerId = await lastSalesManagerFor(body.clientId);
    if (!body.customerManagerId) {
      return Response.json({ error: "Pick the sales manager for this job." }, { status: 400 });
    }
    // Every job must map to a row in Aeros Products Master so FG inventory can
    // be tracked by SKU — including traded items (already in the catalogue).
    // A custom item (size or form not in the catalogue) carries its own name,
    // type and size instead of a wrong "nearest" SKU.
    const isCustomItem = body.customItem === true;
    if (isCustomItem) {
      if (!String(body.category || "").trim() || !String(body.itemSize || "").trim()) {
        return Response.json({ error: "For a custom item, pick the product type and enter its real size." }, { status: 400 });
      }
      body.masterSku = "";
      body.masterProductName = "";
    } else if (!body.masterSku || !String(body.masterSku).trim()) {
      return Response.json(
        { error: "Pick the item from the list, or tick 'Custom item' if it is not in the catalogue." },
        { status: 400 },
      );
    }
    // A job on a catalogue item carries the catalogue (listing) name.
    if (!isCustomItem && body.masterProductName) body.item = String(body.masterProductName);
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
    const { orderRate, copySpecFromJobId, overrideShortRm, stage: requestedStage, ...rest } = body;
    if (rest.channel !== undefined && !["app", "key_account", "export", "other"].includes(rest.channel)) delete rest.channel;
    if (rest.extraFeatures !== undefined) rest.extraFeatures = cleanFeatures(rest.extraFeatures);
    if (!(Number(body.qty) > 0)) {
      return Response.json({ error: "Enter the order quantity." }, { status: 400 });
    }
    // Every job starts at the first step and earns its way forward. Only an
    // admin may enter an old job at a later stage (backfill).
    const isAdminCaller = session.isAdmin || session.modules?.factoryos === "admin";
    const startStage = isAdminCaller && STAGES.includes(requestedStage) ? requestedStage : STAGES[0];
    const job = await createJob({
      ...rest,
      stage: startStage,
      sourcing: isTraded ? "traded" : "in_house",
      conversionAt: routeAt(body.conversionAt),
      rmStockLineId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.rmStockLineId || "")) ? body.rmStockLineId : null,
      packingAt: routeAt(body.packingAt),
    });
    if (soUnverified) {
      await dbUpdate("jobs", "zoho_so_no", soNumber, { zoho_so_unverified: true }, { returning: "minimal" })
        .catch((e) => console.error("flag unverified SO failed:", e));
    }
    // No rates in FactoryOS (Arjun, 17-Nov-2026): pricing and billing are in
    // Zoho. Any orderRate sent by an old client is ignored.
    await addJobUpdate({
      jobId: job.id, stage: startStage,
      note: soInfo
        ? `Job raised on Zoho ${soInfo.number} (${soInfo.customer}${soInfo.date ? ", " + soInfo.date : ""})${linkedClientNote}`
        : `Job raised on Zoho ${soNumber} (not checked yet: Zoho was not reachable; the Zoho check page will verify it)`,
      updatedByEmail: session.email || "", updatedByName: session.name || (session.isAdmin ? "Admin" : ""),
    }).catch((e) => console.error("log job creation failed:", e));
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
