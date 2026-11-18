import { getSession, requireManager, requireRole, requireAdminStrict } from "@/lib/auth/session";
import {
  getJob,
  updateJob,
  listJobUpdates,
  addJobUpdate,
  deleteJob,
  countUpdatesForJob,
  setJobDelivery,
  customerSafeJob,
  customerSafeUpdate,
  vendorSafeJob,
  getClient,
} from "@/lib/factoryos/repo";
import { getJobPushStatus } from "@/lib/warehouse/jobPush";
import { sessionCanSeeJob } from "@/lib/factoryos/jobAccess";
import { moveStage, roleOf } from "@/lib/factoryos/transitions";
import { STAGES, ROLES, canUpdateStage } from "@/lib/factoryos/constants";
import { routeAt } from "@/lib/factoryos/routes";
import { cleanFeatures } from "@/lib/factoryos/jobOptions";
import { getSalesOrderByNumber, normaliseSoNumber, zohoConfigured } from "@/lib/zoho/books";
import { dbSelect, dbUpdate } from "@/lib/db/supabase";

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
    // Outside parties get an allow-listed shape, never the raw job.
    const viewerRole = session.isAdmin ? "admin" : session.modules?.factoryos;
    if (viewerRole === "customer") {
      return Response.json({ job: customerSafeJob(job), updates: updates.map(customerSafeUpdate) });
    }
    if (viewerRole === "vendor") return Response.json({ job: vendorSafeJob(job), updates: [] });
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
      if (!STAGES.includes(body.stage)) return Response.json({ error: "Invalid stage" }, { status: 400 });
      if (isCustomer && !isCustomerDeliver && body.stage !== job.stage) {
        return Response.json({ error: "Not allowed" }, { status: 403 });
      }
      // The stage itself is written by moveStage() below, which checks the
      // step's required data and logs who moved it (rebuild step 1).
      stageChanged = body.stage !== job.stage;
    }

    // Customers can: mark Delivered (above), and toggle Urgent.
    if (isCustomer) {
      const allowedKeys = new Set(["stage", "note", "urgent"]);
      const extra = Object.keys(body).filter((k) => !allowedKeys.has(k));
      if (extra.length) return Response.json({ error: "Not allowed" }, { status: 403 });

      if (body.urgent !== undefined) patch.urgent = !!body.urgent;

      let updated = body.urgent !== undefined ? await updateJob(job.id, patch) : job;

      if (stageChanged) {
        const moved = await moveStage({
          session, jobId: job.id, to: "Delivered",
          fields: { deliveredOn: new Date().toISOString().slice(0, 10) },
          note: body.note || "Customer confirmed delivery",
        });
        if (!moved.ok) return Response.json({ error: moved.error }, { status: moved.status });
        updated = moved.job;
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
      return Response.json({ job: customerSafeJob(updated) });
    }
    // Sales and warehouse see every production detail but do not edit it
    // (Arjun, 17-Nov-2026). Sales: notes and flags. Warehouse: also transport.
    const callerRole = roleOf(session);
    if (callerRole === ROLES.ACCOUNT_MANAGER || callerRole === ROLES.WAREHOUSE) {
      const allowed = new Set(["stage", "note", "stepFields", "internalStatus", "actionPoints", "notes", "urgent"]);
      if (callerRole === ROLES.WAREHOUSE) for (const k of ["transportMode", "lrOrVehicleNumber", "driverContact"]) allowed.add(k);
      const blocked = Object.keys(body).filter((k) => !allowed.has(k) && body[k] !== undefined);
      if (blocked.length) {
        return Response.json({
          error: callerRole === ROLES.WAREHOUSE
            ? "Warehouse can record dispatch and delivery, not change production details."
            : "Sales can see production details but not change them. Ask the factory manager, or add a note.",
        }, { status: 403 });
      }
    }
    // Order basics (qty, brand, item, PO, city) — managers only; the forms
    // fix these at creation, the assistant may correct them (25-Oct-2026).
    const basics = ["qty", "brand", "item", "poNumber", "city", "customerManagerId", "extraFeatures"].filter((k) => body[k] !== undefined);
    if (basics.length) {
      if (!requireManager(session)) return Response.json({ error: "Not allowed to change order basics" }, { status: 403 });
      // Sales manager can be changed but never cleared (Arjun, 17-Nov-2026).
      if (body.customerManagerId !== undefined) {
        if (!body.customerManagerId) return Response.json({ error: "Every job needs a sales manager" }, { status: 400 });
        patch.customerManagerId = String(body.customerManagerId);
      }
      if (body.qty !== undefined) {
        const q = Number(body.qty);
        if (!Number.isFinite(q) || q < 0) return Response.json({ error: "Invalid quantity" }, { status: 400 });
        patch.qty = q;
      }
      for (const k of ["brand", "item", "poNumber", "city"]) if (body[k] !== undefined) patch[k] = String(body[k] ?? "").slice(0, 300);
      if (body.extraFeatures !== undefined) patch.extraFeatures = cleanFeatures(body.extraFeatures);
      // A job on a catalogue item always carries the catalogue (listing) name.
      // Only a custom item has a typed name. Extras go in "additional features".
      if (patch.item !== undefined && job.masterSku && !job.customItem && body.customItem !== true) {
        if (patch.item !== (job.masterProductName || job.item)) {
          return Response.json({ error: "This job is on a catalogue item, so it keeps the catalogue name. Use additional features for extras such as a flap, or change the catalogue item." }, { status: 400 });
        }
      }
    }
    if (body.internalStatus !== undefined) patch.internalStatus = body.internalStatus;
    if (body.actionPoints !== undefined) patch.actionPoints = body.actionPoints;
    if (body.notes !== undefined) patch.notes = body.notes;
    // Expected dispatch / estimated delivery are no longer set from FactoryOS
    // (17-Nov-2026: one date only, the production ready date). The columns stay
    // in the database for Cowork customer ops.
    // Delivery-plan fields live on PG columns outside the Airtable shim, so
    // they're written via setJobDelivery (not updateJob). Internal-only — the
    // customer branch already returned above.
    const deliveryPatch = {};
    if (body.receivedQty !== undefined) deliveryPatch.receivedQty = body.receivedQty;
    if (body.deliveryStatus !== undefined) deliveryPatch.deliveryStatus = body.deliveryStatus;
    if (body.deliveryRemarks !== undefined) deliveryPatch.deliveryRemarks = body.deliveryRemarks;
    // RM + production updates
    if (body.rmType !== undefined) patch.rmType = body.rmType;
    if (body.rmSupplier !== undefined) patch.rmSupplier = body.rmSupplier;
    if (body.rmMill !== undefined) patch.rmMill = body.rmMill;
    if (body.paperType !== undefined) patch.paperType = body.paperType;
    if (body.gsm !== undefined) patch.gsm = body.gsm;
    if (body.rmSizeMm !== undefined) patch.rmSizeMm = body.rmSizeMm;
    if (body.rmQtySheets !== undefined) patch.rmQtySheets = body.rmQtySheets;
    if (body.rmQtyKgs !== undefined) patch.rmQtyKgs = body.rmQtyKgs;
    if (body.rmDeliveryDate !== undefined) patch.rmDeliveryDate = body.rmDeliveryDate;
    if (body.printingType !== undefined) patch.printingType = body.printingType;
    if (body.conversionAt !== undefined) patch.conversionAt = routeAt(body.conversionAt);
    if (body.rmStockLineId !== undefined) {
      const v = String(body.rmStockLineId || "");
      patch.rmStockLineId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
    }
    if (body.packingAt !== undefined) patch.packingAt = routeAt(body.packingAt);
    if (body.printingVendor !== undefined) patch.printingVendor = body.printingVendor;
    if (body.printingDueDate !== undefined) patch.printingDueDate = body.printingDueDate;
    if (body.productionDueDate !== undefined) patch.productionDueDate = body.productionDueDate;
    // Coating step, production count and order links (rebuild step 1).
    if (body.coatingRequired !== undefined) patch.coatingRequired = !!body.coatingRequired;
    if (body.coatingVendorId !== undefined) patch.coatingVendorId = body.coatingVendorId || null;
    if (body.coatingSentOn !== undefined) patch.coatingSentOn = body.coatingSentOn || null;
    if (body.coatingDueDate !== undefined) patch.coatingDueDate = body.coatingDueDate || null;
    if (body.coatingReceivedOn !== undefined) patch.coatingReceivedOn = body.coatingReceivedOn || null;
    if (body.producedQty !== undefined) patch.producedQty = body.producedQty === "" || body.producedQty === null ? null : Number(body.producedQty);
    // Zoho SO link: managers only; a new number is checked live against Zoho;
    // removing it is admin-only. Every change goes on the timeline.
    let soNote = "";
    let soUnverified = null; // true = flag, false = clear, null = leave
    if (body.zohoSoNo !== undefined) {
      if (!requireManager(session)) return Response.json({ error: "Not allowed to change the Zoho SO number" }, { status: 403 });
      const next = normaliseSoNumber(body.zohoSoNo);
      const prev = job.zohoSoNo || "";
      if (next !== prev) {
        if (!next) {
          if (!requireAdminStrict(session)) return Response.json({ error: "Only an admin can remove the Zoho SO number." }, { status: 403 });
          soNote = `Zoho SO removed (was ${prev})`;
        } else {
          // Zoho unreachable → save it flagged unverified; the Zoho check page
          // re-checks it later (Arjun, 18-Nov-2026).
          let so = null;
          if (!zohoConfigured()) soUnverified = true;
          else {
            try { so = await getSalesOrderByNumber(next); }
            catch (e) { console.error("zoho SO check failed, saving unverified:", e?.message || e); soUnverified = true; }
            if (!soUnverified && !so) return Response.json({ error: `${next} is not in Zoho. Check the SO number.` }, { status: 400 });
            if (so && so.status === "void") return Response.json({ error: `${next} is void in Zoho.` }, { status: 400 });
          }
          const taken = await dbSelect("jobs", { select: "id,airtable_id,j_number", filter: { zoho_so_no: `ilike.${next}` }, limit: 5 }).catch(() => []);
          const other = (taken || []).find((t) => (t.airtable_id || t.id) !== job.id && t.id !== job.id);
          if (other) return Response.json({ error: `${next} already has job J# ${other.j_number}. One SO, one job.` }, { status: 400 });
          // A job's customer must match the SO's Zoho customer when it is linked.
          const client = (job.clientIds || [])[0] ? await getClient(job.clientIds[0]).catch(() => null) : null;
          if (so && client && client.zohoContactId && so.customerId && client.zohoContactId !== so.customerId) {
            return Response.json({ error: `${next} is for ${so.customer} in Zoho, but this job's customer is ${client.name}.` }, { status: 400 });
          }
          const who = so ? so.customer : "not checked yet: Zoho was not reachable";
          soNote = prev ? `Zoho SO changed ${prev} → ${next} (${who})` : `Linked to Zoho ${next} (${who})`;
        }
        patch.zohoSoNo = next;
        if (soUnverified !== true) soUnverified = false;
      }
    }
    if (body.channel !== undefined) patch.channel = ["app", "key_account", "export", "other"].includes(body.channel) ? body.channel : null;
    if (body.itemSize !== undefined) patch.itemSize = body.itemSize;
    if (body.customItem !== undefined) {
      if (!requireManager(session)) return Response.json({ error: "Not allowed" }, { status: 403 });
      patch.customItem = !!body.customItem;
      if (patch.customItem) { patch.masterSku = ""; patch.masterProductName = ""; }
    }
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
      // Picking a catalogue item renames the job to that item's listing name.
      if (body.masterSku && body.masterProductName) patch.item = String(body.masterProductName).slice(0, 300);
    }

    if (Object.keys(deliveryPatch).length > 0) {
      await setJobDelivery(job.id, deliveryPatch);
    }

    // A committed date that changes is never silent: it goes on the timeline.
    const dateNotes = soNote ? [soNote] : [];
    const fmtD = (v) => (v ? new Date(String(v).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }) : "none");
    for (const [key, label] of [["productionDueDate", "Production ready date"], ["printingDueDate", "Printing due date"], ["coatingDueDate", "Coating due date"]]) {
      if (patch[key] === undefined) continue;
      const before = job[key] ? String(job[key]).slice(0, 10) : "";
      const after = patch[key] ? String(patch[key]).slice(0, 10) : "";
      if (before && before !== after) dateNotes.push(`${label} changed ${fmtD(before)} → ${fmtD(after)}`);
    }

    let updated = Object.keys(patch).length > 0 ? await updateJob(job.id, patch) : job;
    if (soUnverified !== null) {
      const rowId = (await dbSelect("jobs", { select: "id", filter: { airtable_id: `eq.${job.id}` }, limit: 1 }).catch(() => []))[0]?.id || job.id;
      await dbUpdate("jobs", "id", rowId, { zoho_so_unverified: soUnverified }, { returning: "minimal" })
        .catch((e) => console.error("set zoho_so_unverified failed:", e));
    }
    const who = {
      updatedByEmail: session.email || "",
      updatedByName: session.name || (requireAdminStrict(session) ? "Admin" : ""),
    };
    const userNote = body.note && String(body.note).trim() ? String(body.note).trim() : "";

    if (stageChanged) {
      const moved = await moveStage({
        session, jobId: job.id, to: body.stage,
        fields: body.stepFields && typeof body.stepFields === "object" ? body.stepFields : null,
        override: body.override === true, reason: body.reason || "",
        note: [userNote, ...dateNotes].filter(Boolean).join(" · "),
      });
      if (!moved.ok) {
        // Other fields in this request are already saved; only the move is refused.
        return Response.json({ error: moved.error, missing: moved.missing || [], job: moved.job || updated }, { status: moved.status });
      }
      updated = moved.job;
    } else {
      if (body.stepFields && typeof body.stepFields === "object" && Object.keys(body.stepFields).length) {
        const kept = await moveStage({ session, jobId: job.id, to: job.stage, fields: body.stepFields });
        if (kept.job) updated = kept.job;
      }
      if (userNote || dateNotes.length) {
        await addJobUpdate({ jobId: job.id, stage: updated.stage || job.stage, note: [userNote, ...dateNotes].filter(Boolean).join(" · "), ...who });
      }
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
