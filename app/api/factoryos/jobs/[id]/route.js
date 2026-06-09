import { getSession, requireManager, requireRole, requireAdminStrict } from "@/lib/auth/session";
import {
  getJob,
  updateJob,
  listJobUpdates,
  addJobUpdate,
  deleteJob,
  countUpdatesForJob,
} from "@/lib/factoryos/repo";
import { getJobPushStatus } from "@/lib/warehouse/jobPush";
import { sessionCanSeeJob } from "@/lib/factoryos/jobAccess";
import { STAGES, ROLES, canUpdateStage } from "@/lib/factoryos/constants";

// Roles allowed to remove a job entirely. Account managers + customers can
// only update fields, never destroy the row + its timeline.
const DELETE_ALLOWED_ROLES = new Set([
  ROLES.ADMIN,
  ROLES.FACTORY_MANAGER,
  ROLES.FACTORY_EXECUTIVE,
]);

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const job = await getJob(params.id);
    if (!job) return Response.json({ error: "Not found" }, { status: 404 });
    if (!sessionCanSeeJob(session, job)) return Response.json({ error: "Forbidden" }, { status: 403 });
    const updates = await listJobUpdates(job.id);
    return Response.json({ job, updates });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const job = await getJob(params.id);
    if (!job) return Response.json({ error: "Not found" }, { status: 404 });
    if (!sessionCanSeeJob(session, job)) return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const patch = {};
    let stageChanged = false;
    const isCustomer = requireRole(session, "factoryos", "customer");

    // Customers have one very specific permission: mark a Dispatched job as Delivered.
    const isCustomerDeliver =
      isCustomer &&
      body.stage === "Delivered" &&
      job.stage === "Dispatched";

    if (body.stage !== undefined) {
      if (!canUpdateStage(session.modules?.factoryos) && !isCustomerDeliver) {
        return Response.json({ error: "Not allowed" }, { status: 403 });
      }
      if (!STAGES.includes(body.stage)) return Response.json({ error: "Invalid stage" }, { status: 400 });
      if (body.stage !== job.stage) {
        patch.stage = body.stage;
        stageChanged = true;
      }
    }

    // Customers can: mark Delivered (above), and toggle Urgent.
    if (isCustomer) {
      const allowedKeys = new Set(["stage", "note", "urgent"]);
      const extra = Object.keys(body).filter((k) => !allowedKeys.has(k));
      if (extra.length) return Response.json({ error: "Not allowed" }, { status: 403 });

      if (body.urgent !== undefined) patch.urgent = !!body.urgent;

      const willWrite = stageChanged || body.urgent !== undefined;
      const updated = willWrite ? await updateJob(job.id, patch) : job;

      if (stageChanged) {
        await addJobUpdate({
          jobId: job.id,
          stage: patch.stage,
          note: body.note || "Customer confirmed delivery",
          updatedByEmail: session.email || "",
          updatedByName: session.name || "",
        });
      } else if (body.urgent !== undefined) {
        // Log urgency toggles so managers see the signal in the timeline.
        await addJobUpdate({
          jobId: job.id,
          stage: job.stage,
          note: body.urgent ? "Customer marked order URGENT" : "Customer cleared urgent flag",
          updatedByEmail: session.email || "",
          updatedByName: session.name || "",
        });
      }
      return Response.json({ job: updated });
    }
    if (body.internalStatus !== undefined) patch.internalStatus = body.internalStatus;
    if (body.actionPoints !== undefined) patch.actionPoints = body.actionPoints;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.expectedDispatchDate !== undefined) patch.expectedDispatchDate = body.expectedDispatchDate;
    if (body.estimatedDeliveryDate !== undefined) patch.estimatedDeliveryDate = body.estimatedDeliveryDate;
    // RM + production updates
    if (body.rmType !== undefined) patch.rmType = body.rmType;
    if (body.rmSupplier !== undefined) patch.rmSupplier = body.rmSupplier;
    if (body.paperType !== undefined) patch.paperType = body.paperType;
    if (body.gsm !== undefined) patch.gsm = body.gsm;
    if (body.rmSizeMm !== undefined) patch.rmSizeMm = body.rmSizeMm;
    if (body.rmQtySheets !== undefined) patch.rmQtySheets = body.rmQtySheets;
    if (body.rmQtyKgs !== undefined) patch.rmQtyKgs = body.rmQtyKgs;
    if (body.rmDeliveryDate !== undefined) patch.rmDeliveryDate = body.rmDeliveryDate;
    if (body.printingType !== undefined) patch.printingType = body.printingType;
    if (body.printingVendor !== undefined) patch.printingVendor = body.printingVendor;
    if (body.printingDueDate !== undefined) patch.printingDueDate = body.printingDueDate;
    if (body.productionDueDate !== undefined) patch.productionDueDate = body.productionDueDate;
    if (body.itemSize !== undefined) patch.itemSize = body.itemSize;
    if (body.urgent !== undefined) patch.urgent = !!body.urgent;
    if (body.transportMode !== undefined) patch.transportMode = body.transportMode;
    if (body.lrOrVehicleNumber !== undefined) patch.lrOrVehicleNumber = body.lrOrVehicleNumber;
    if (body.driverContact !== undefined) patch.driverContact = body.driverContact;
    // Master-product mapping: only admin + factory manager can remap a job to a different SKU.
    // Account managers can see it read-only but shouldn't be able to overwrite mapping.
    if (body.masterSku !== undefined || body.masterProductName !== undefined) {
      if (!requireManager(session)) {
        return Response.json({ error: "Not allowed to change master product mapping" }, { status: 403 });
      }
      // Detect whether the request would actually CHANGE the mapping vs
      // submit the existing value back. We only block real changes; no-op
      // resaves stay legal so a stale-tab "Save" doesn't surprise the user.
      const newSku  = body.masterSku  !== undefined ? String(body.masterSku  || "") : job.masterSku  || "";
      const newName = body.masterProductName !== undefined ? String(body.masterProductName || "") : job.masterProductName || "";
      const mappingChanged =
        (body.masterSku  !== undefined && newSku  !== (job.masterSku  || "")) ||
        (body.masterProductName !== undefined && newName !== (job.masterProductName || ""));

      // Once a job has at least one warehouse push, the FG ledger has
      // already booked stock against the current master SKU (or its
      // brand-derived variant — push_job_to_warehouse synthesises one
      // from masterSku + brand). Allowing a remap after that point would
      // split future pushes onto a different SKU while the past pushes
      // stay tied to the original, silently fragmenting FG inventory for
      // one physical job. Audit finding C5.
      if (mappingChanged) {
        const status = await getJobPushStatus(job.id).catch(() => null);
        if (status && status.push_count > 0) {
          return Response.json({
            error:
              `Cannot remap master product after warehouse push (${status.push_count} push${status.push_count === 1 ? "" : "es"} already booked against the current SKU). ` +
              `Delete the job and create a new one — or contact an admin if a controlled fix is needed.`,
            code: "master_mapping_locked",
            pushCount: status.push_count,
          }, { status: 409 });
        }
      }

      if (body.masterSku !== undefined) patch.masterSku = body.masterSku;
      if (body.masterProductName !== undefined) patch.masterProductName = body.masterProductName;
    }

    const updated = Object.keys(patch).length > 0 ? await updateJob(job.id, patch) : job;

    if (stageChanged || (body.note && body.note.trim())) {
      await addJobUpdate({
        jobId: job.id,
        stage: patch.stage || job.stage,
        note: body.note || "",
        updatedByEmail: session.email || "",
        updatedByName: session.name || (requireAdminStrict(session) ? "Admin" : ""),
      });
    }
    return Response.json({ job: updated });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE /api/factoryos/jobs/[id]
//   ?count=updates → preview only: returns { jobId, updateCount } without
//                    deleting anything (UI uses this for the confirm dialog).
//   no query        → cascade-delete the job + its timeline rows.
//
// Restricted to admin / factory manager / factory executive — AMs and
// customers can edit fields but can't destroy the row.
export async function DELETE(req, { params }) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  // DELETE_ALLOWED_ROLES is admin/FM/FE. Hub admin passes via isAdmin shortcut;
  // otherwise membership of session.modules.factoryos in the set.
  if (!session.isAdmin && !DELETE_ALLOWED_ROLES.has(session.modules?.factoryos)) {
    return Response.json(
      { error: "Only admin, factory manager or factory executive can delete a job" },
      { status: 403 },
    );
  }
  try {
    const job = await getJob(params.id);
    if (!job) return Response.json({ error: "Not found" }, { status: 404 });

    const url = new URL(req.url);
    if (url.searchParams.get("count") === "updates") {
      const updateCount = await countUpdatesForJob(job.id);
      return Response.json({ jobId: job.id, updateCount });
    }

    const { deletedUpdates } = await deleteJob(job.id);
    return Response.json({ ok: true, jobId: job.id, deletedUpdates });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
