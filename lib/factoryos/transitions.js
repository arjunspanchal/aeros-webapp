// The one gate every stage change passes through (rebuild step 1, 17-Nov-2026).
//
// Before this, seven code paths wrote jobs.stage and only one logged it; any
// stage could be set from any stage with no data behind it. Now: moveStage()
// saves the step's fields, checks the rules in steps.js, writes the stage and
// always writes a timeline row signed with the person who did it.

import { dbSelect, dbInsert, dbUpdate, dbDelete, dbCount, findOne } from "@/lib/db/supabase";
import { ROLES } from "@/lib/auth/roles";
import { getJob, updateJob, addJobUpdate } from "./repo";
import { checkMove, TRANSPORT_MODES } from "./steps";

export function roleOf(session) {
  if (!session) return null;
  return session.isAdmin ? ROLES.ADMIN : session.modules?.factoryos || null;
}

async function jobPgId(jobPublicId) {
  const row = await findOne("jobs", jobPublicId, "id");
  return row?.id || null;
}

function normLot(r) {
  return {
    id: r.id,
    dispatchedOn: r.dispatched_on,
    qty: r.qty,
    cartons: r.cartons,
    transportMode: r.transport_mode,
    lrOrVehicleNumber: r.lr_or_vehicle_number,
    driverContact: r.driver_contact || "",
    zohoInvoiceNo: r.zoho_invoice_no,
    ewayBillNo: r.eway_bill_no || "",
    note: r.note || "",
    createdByEmail: r.created_by_email || null,
    createdAt: r.created_at,
  };
}

// Counts the rules need that are not on the job row itself.
export async function stepContext(jobPublicId) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return { pgId: null, inwardCount: 0, coaCount: 0, lots: [], dispatchedQty: 0 };
  const [inwardCount, coaCount, lotRows] = await Promise.all([
    dbCount("job_inwards", { job_id: `eq.${pgId}` }),
    dbCount("job_coas", { job_id: `eq.${pgId}` }),
    dbSelect("job_dispatches", { select: "*", filter: { job_id: `eq.${pgId}` }, order: "dispatched_on.asc,created_at.asc" }),
  ]);
  const lots = lotRows.map(normLot);
  return { pgId, inwardCount, coaCount, lots, dispatchedQty: lots.reduce((t, l) => t + (l.qty || 0), 0) };
}

const dateStr = (v) => (v ? String(v).slice(0, 10) : null);
const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/,/g, "")));

// Fields a step may save along with the move. Anything else is ignored here.
function splitStepFields(fields = {}) {
  const shim = {};
  const direct = {};
  const f = fields || {};
  if (f.productionDueDate !== undefined) shim.productionDueDate = dateStr(f.productionDueDate);
  if (f.paperType !== undefined) shim.paperType = String(f.paperType || "").trim();
  if (f.rmQtySheets !== undefined) shim.rmQtySheets = numOrNull(f.rmQtySheets);
  if (f.rmQtyKgs !== undefined) shim.rmQtyKgs = numOrNull(f.rmQtyKgs);
  if (f.coatingRequired !== undefined) shim.coatingRequired = !!f.coatingRequired;
  if (f.coatingVendorId !== undefined) shim.coatingVendorId = f.coatingVendorId || null;
  if (f.coatingSentOn !== undefined) shim.coatingSentOn = dateStr(f.coatingSentOn);
  if (f.coatingDueDate !== undefined) shim.coatingDueDate = dateStr(f.coatingDueDate);
  if (f.coatingReceivedOn !== undefined) shim.coatingReceivedOn = dateStr(f.coatingReceivedOn);
  if (f.printingType !== undefined) shim.printingType = f.printingType || null;
  if (f.printingVendor !== undefined) shim.printingVendor = f.printingVendor || null;
  if (f.printingDueDate !== undefined) shim.printingDueDate = dateStr(f.printingDueDate);
  if (f.producedQty !== undefined) shim.producedQty = numOrNull(f.producedQty);
  if (f.deliveredOn !== undefined) shim.deliveredOn = dateStr(f.deliveredOn);
  // Handover fields live on PG columns outside the shim's write map.
  if (f.fgQty !== undefined) direct.fg_qty = numOrNull(f.fgQty);
  if (f.fgCartons !== undefined) direct.fg_cartons = numOrNull(f.fgCartons);
  if (f.closeNote !== undefined) direct.close_note = String(f.closeNote || "").trim() || null;
  return { shim, direct };
}

// Save a step's fields without moving the stage. Used by the job screen so a
// half-filled step is kept. Returns the fresh job.
export async function saveStepFields(jobId, fields) {
  const { shim, direct } = splitStepFields(fields);
  if (Object.keys(direct).length) {
    const pgId = await jobPgId(jobId);
    if (pgId) await dbUpdate("jobs", "id", pgId, direct, { returning: "minimal" });
  }
  if (Object.keys(shim).length) return updateJob(jobId, shim);
  return getJob(jobId);
}

// Move a job to `to`. Returns { ok, job, error?, missing?, status }.
export async function moveStage({ session, jobId, to, fields = null, override = false, reason = "", note = "" }) {
  const role = roleOf(session);
  let job = await getJob(jobId);
  if (!job) return { ok: false, status: 404, error: "Job not found" };
  const from = job.stage;

  // Save what was filled in first, so a refused move never loses typing.
  if (fields && Object.keys(fields).length) {
    job = await saveStepFields(jobId, fields);
    job = (await getJob(jobId)) || job; // re-read: fg_* are written outside the shim
  }
  if (to === from) return { ok: true, status: 200, job };

  const ctx = await stepContext(jobId);
  const res = checkMove({ job, to, role, ctx, override, reason });
  if (!res.ok) return { ok: false, status: res.missing?.length ? 422 : 403, error: res.error, missing: res.missing || [], job };

  const today = new Date().toISOString().slice(0, 10);
  const direct = {};
  if (to === "Ready for Dispatch" && !job.closedAt) {
    direct.closed_at = new Date().toISOString();
    direct.closed_by_email = session?.email || null;
  }
  if (to === "Dispatched") {
    direct.dispatched_on = ctx.lots.length ? ctx.lots[ctx.lots.length - 1].dispatchedOn : today;
  }
  if (to === "Delivered" && !job.deliveredOn) direct.delivered_on = today;

  const updated = await updateJob(jobId, { stage: to });
  if (Object.keys(direct).length && ctx.pgId) {
    await dbUpdate("jobs", "id", ctx.pgId, direct, { returning: "minimal" });
  }

  const bits = [];
  if (res.overridden) bits.push(`Admin override (${from} → ${to}): ${String(reason).trim()}`);
  if (note && String(note).trim()) bits.push(String(note).trim());
  await addJobUpdate({
    jobId,
    stage: to,
    note: bits.join(" · "),
    updatedByEmail: session?.email || "",
    updatedByName: session?.name || (session?.isAdmin ? "Admin" : ""),
  });
  return { ok: true, status: 200, job: (await getJob(jobId)) || updated };
}

// ---------- Dispatch lots ----------
// What actually left the building, lot by lot, with the Zoho invoice it went
// on. Warehouse (or admin) records it; the job moves to Dispatched when the
// lots cover the order or the last lot is marked as completing it.

export async function listDispatches(jobId) {
  return (await stepContext(jobId)).lots;
}

export async function addDispatch({ session, jobId, body = {} }) {
  const job = await getJob(jobId);
  if (!job) return { ok: false, status: 404, error: "Job not found" };
  if (!["Ready for Dispatch", "Dispatched"].includes(job.stage)) {
    return { ok: false, status: 409, error: `This job is at ${job.stage}. It can be dispatched once the factory has handed it over (Ready for Dispatch).` };
  }
  const qty = Math.round(Number(String(body.qty ?? "").replace(/,/g, "")));
  const missing = [];
  if (!body.dispatchedOn) missing.push("dispatch date");
  if (!(qty > 0)) missing.push("quantity");
  if (!TRANSPORT_MODES.includes(body.transportMode)) missing.push("transport");
  if (!String(body.lrOrVehicleNumber || "").trim()) missing.push("LR or vehicle number");
  if (!String(body.zohoInvoiceNo || "").trim()) missing.push("Zoho invoice number");
  if (missing.length) return { ok: false, status: 422, error: `Fill these to record a dispatch: ${missing.join(", ")}.` };

  const pgId = await jobPgId(jobId);
  const cartons = body.cartons === "" || body.cartons == null ? null : Math.max(0, Math.round(Number(body.cartons) || 0));
  await dbInsert("job_dispatches", {
    job_id: pgId,
    dispatched_on: dateStr(body.dispatchedOn),
    qty,
    cartons,
    transport_mode: body.transportMode,
    lr_or_vehicle_number: String(body.lrOrVehicleNumber).trim(),
    driver_contact: String(body.driverContact || "").trim() || null,
    zoho_invoice_no: String(body.zohoInvoiceNo).trim(),
    eway_bill_no: String(body.ewayBillNo || "").trim() || null,
    note: String(body.note || "").trim() || null,
    created_by_email: session?.email || null,
  });

  const ctx = await stepContext(jobId);
  // Keep the job's own transport fields (what the customer view reads) and the
  // delivery-plan balance in step with the lots.
  await dbUpdate("jobs", "id", pgId, {
    transport_mode: body.transportMode,
    lr_or_vehicle_number: String(body.lrOrVehicleNumber).trim(),
    driver_contact: String(body.driverContact || "").trim() || null,
    received_qty: ctx.dispatchedQty,
  }, { returning: "minimal" });

  const target = Number(job.fgQty) > 0 ? Number(job.fgQty) : Number(job.qty) || 0;
  const complete = body.complete === true || (target > 0 && ctx.dispatchedQty >= target);
  const lotNote = `Dispatched ${qty.toLocaleString("en-IN")} pcs${cartons ? ` in ${cartons} cartons` : ""} by ${body.transportMode}`;
  if (complete && job.stage === "Ready for Dispatch") {
    const moved = await moveStage({ session, jobId, to: "Dispatched", note: lotNote });
    if (!moved.ok) return { ...moved, lots: ctx.lots };
    return { ok: true, status: 200, job: moved.job, lots: ctx.lots, dispatchedQty: ctx.dispatchedQty };
  }
  // Part lot: stage stays, but the timeline still shows what went.
  await addJobUpdate({
    jobId,
    stage: job.stage,
    note: `${lotNote} (part dispatch, ${ctx.dispatchedQty.toLocaleString("en-IN")} of ${target.toLocaleString("en-IN")} so far)`,
    updatedByEmail: session?.email || "",
    updatedByName: session?.name || (session?.isAdmin ? "Admin" : ""),
  });
  return { ok: true, status: 200, job: await getJob(jobId), lots: ctx.lots, dispatchedQty: ctx.dispatchedQty };
}

export async function deleteDispatch({ jobId, lotId }) {
  const pgId = await jobPgId(jobId);
  const rows = await dbSelect("job_dispatches", { select: "id,job_id", filter: { id: `eq.${lotId}` }, limit: 1 });
  if (!rows[0] || rows[0].job_id !== pgId) return { ok: false, status: 404, error: "Dispatch not found on this job" };
  await dbDelete("job_dispatches", "id", lotId);
  const ctx = await stepContext(jobId);
  await dbUpdate("jobs", "id", pgId, { received_qty: ctx.dispatchedQty }, { returning: "minimal" });
  return { ok: true, status: 200, lots: ctx.lots, dispatchedQty: ctx.dispatchedQty };
}

// Coaters and printers with what each can do (flexo / offset / pe_coating).
// PG ids, because jobs.coating_vendor_id is a foreign key to vendors.id.
export async function listOutsourcers() {
  const rows = await dbSelect("vendors", {
    select: "id,name,capabilities,active",
    filter: { type: "eq.Printing" },
    order: "name.asc",
    limit: 200,
  });
  return rows
    .filter((v) => v.active !== false)
    .map((v) => ({ id: v.id, name: v.name, capabilities: Array.isArray(v.capabilities) ? v.capabilities : [] }));
}

// The warehouse's two lists: jobs handed over and waiting to go, and jobs that
// have left but are not confirmed delivered. Driven by stage (not closed_at),
// so nothing the factory marks ready can be invisible to the warehouse.
export async function dispatchQueue() {
  const rows = await dbSelect("jobs", {
    select: "id,airtable_id,j_number,brand,item,city,qty,fg_qty,fg_cartons,stage,closed_at,updated_at,dispatched_on,production_due_date,urgent,close_note,client_id,zoho_so_no,clients(name)",
    filter: { stage: "in.(\"Ready for Dispatch\",\"Dispatched\")" },
    order: "updated_at.asc",
    limit: 2000,
  });
  if (!rows.length) return { ready: [], inTransit: [] };
  const lotRows = await dbSelect("job_dispatches", {
    select: "*", filter: { job_id: `in.(${rows.map((r) => r.id).join(",")})` }, order: "dispatched_on.asc,created_at.asc",
  });
  const lotsByJob = new Map();
  for (const l of lotRows) {
    if (!lotsByJob.has(l.job_id)) lotsByJob.set(l.job_id, []);
    lotsByJob.get(l.job_id).push(normLot(l));
  }
  const days = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null);
  const shape = (r) => {
    const lots = lotsByJob.get(r.id) || [];
    return {
      id: r.airtable_id || r.id,
      jNumber: r.j_number,
      zohoSoNo: r.zoho_so_no || "",
      clientName: r.clients?.name || "",
      brand: r.brand || "",
      item: r.item || "",
      city: r.city || "",
      qty: r.qty,
      fgQty: r.fg_qty != null ? Number(r.fg_qty) : null,
      fgCartons: r.fg_cartons,
      stage: r.stage,
      urgent: !!r.urgent,
      closeNote: r.close_note || "",
      productionDueDate: r.production_due_date,
      dispatchedOn: r.dispatched_on,
      waitingDays: days(r.stage === "Dispatched" ? (r.dispatched_on || r.updated_at) : (r.closed_at || r.updated_at)),
      lots,
      dispatchedQty: lots.reduce((t, l) => t + (l.qty || 0), 0),
    };
  };
  const all = rows.map(shape);
  return {
    ready: all.filter((j) => j.stage === "Ready for Dispatch").sort((a, b) => (b.waitingDays || 0) - (a.waitingDays || 0)),
    inTransit: all.filter((j) => j.stage === "Dispatched").sort((a, b) => (b.waitingDays || 0) - (a.waitingDays || 0)),
  };
}
