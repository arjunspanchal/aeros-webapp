// Warehouse Outward — driven by Zoho invoices (18-Nov-2026 rebuild).
//
// Arjun: "Dispatched = invoiced in Zoho". Every Zoho invoice dated from the
// go-live date is "to load" until the warehouse records it:
//   • loaded              — transport / LR or vehicle / cartons. Lines taken
//                           off a rack post one outward stock movement. If the
//                           invoice belongs to a FactoryOS job (through its SO,
//                           or picked by hand), a dispatch lot goes on the job.
//   • not_from_warehouse  — went direct from a vendor, a service line, etc.
// A loaded invoice is then "in transit" until someone confirms delivery, which
// also ticks Delivery Acknowledgment on the invoice in Zoho.
//
// The warehouse's racks are the stock record; Zoho's stock figures are not
// used. No rates or amounts anywhere.

import { dbSelect, dbInsert, dbUpdate, dbDelete } from "../db/supabase.js";
import { listInvoicesSince, getInvoiceById, setInvoiceDelivered, salesOrderNumbersFor, zohoConfigured, isScopeError, clearZohoListCache } from "../zoho/books.js";
import { postMovement, getMovement } from "./movements.js";
import { addDispatch, moveStage, dispatchQueue } from "../factoryos/transitions.js";
import { TRANSPORT_MODES } from "../factoryos/steps.js";
import { decorateLines, resolveLineItems, stockFor, quoteIn, jobItemSku } from "./zohoItems.js";
import { DEFAULT_WAREHOUSE } from "./access.js";
import { daysSince } from "./dates.js";

// Invoices dated before this never show as "to load": history is not
// back-filled ("old data is no big deal", 18-Nov-2026).
export const OUTWARD_GO_LIVE = "2026-11-18";
const EARLIEST_SINCE = "2026-11-01";

export { TRANSPORT_MODES };
export const NOT_FROM_WAREHOUSE_REASONS = ["Sent direct from vendor", "Service or charge, no goods", "Customer collected earlier", "Invoice will be cancelled", "Other"];

// Zoho's "Mode of Transport" dropdown → the FactoryOS transport list.
export function mapTransport(zohoMode) {
  const m = String(zohoMode || "").trim().toLowerCase();
  if (!m) return "";
  if (m.includes("delhivery")) return "Delhivery";
  if (m.includes("tci")) return "TCI Express";
  if (m.includes("blue")) return "Bluedart";
  if (m.includes("pick") || m.includes("customer")) return "Customer pickup";
  if (m.includes("ftl") || m.includes("truck")) return "Full truck (FTL)";
  if (m.includes("porter") || m.includes("aeros") || m.includes("tempo") || m.includes("vehicle")) return "Direct Vehicle";
  return "Other";
}

export function clampSince(raw, goLive = OUTWARD_GO_LIVE) {
  const s = /^\d{4}-\d{2}-\d{2}$/.test(String(raw || "")) ? String(raw) : goLive;
  return s < EARLIEST_SINCE ? EARLIEST_SINCE : s;
}

export function zohoErrorText(e, what) {
  return isScopeError(e)
    ? `Zoho has not given the warehouse access to ${what} yet. The Zoho connection needs to be renewed with that permission.`
    : "Could not reach Zoho just now. Try again in a minute.";
}

function shapeJob(r) {
  return {
    pgId: r.id,
    id: r.airtable_id || r.id,
    jNumber: r.j_number,
    item: r.item || "",
    brand: r.brand || r.clients?.name || "",
    stage: r.stage,
    qty: r.fg_qty != null ? Number(r.fg_qty) : r.qty,
    canDispatch: ["Ready for Dispatch", "Dispatched"].includes(r.stage),
  };
}
const JOB_COLS = "id,airtable_id,j_number,item,brand,stage,qty,fg_qty,zoho_so_no,clients(name)";

async function jobsBySo(soNumbers) {
  const nums = [...new Set(soNumbers.filter(Boolean).map((s) => s.toUpperCase()))];
  const out = new Map();
  if (!nums.length) return out;
  const rows = await dbSelect("jobs", { select: JOB_COLS, filter: { zoho_so_no: quoteIn(nums) }, limit: 500 }).catch(() => []);
  for (const r of rows) out.set(String(r.zoho_so_no).toUpperCase(), shapeJob(r));
  return out;
}

function shapeRecord(r) {
  return {
    id: r.id,
    zohoInvoiceId: r.zoho_invoice_id,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    customer: r.customer || "",
    soNumber: r.so_number || "",
    status: r.status,
    dispatchedOn: r.dispatched_on,
    transportMode: r.transport_mode || "",
    lrOrVehicleNumber: r.lr_or_vehicle_number || "",
    driverContact: r.driver_contact || "",
    cartons: r.cartons,
    reason: r.reason || "",
    note: r.note || "",
    movementId: r.movement_id,
    movementNo: r.inventory_movements?.movement_no || "",
    jobPgId: r.job_id,
    jNumber: r.jobs?.j_number || "",
    jobPublicId: r.jobs ? r.jobs.airtable_id || r.jobs.id : null,
    deliveredOn: r.delivered_on,
    deliveredBy: r.delivered_by_email || "",
    zohoAckSynced: !!r.zoho_ack_synced,
    createdByEmail: r.created_by_email || "",
    createdAt: r.created_at,
    daysOut: r.status === "loaded" && !r.delivered_on ? daysSince(r.dispatched_on) : null,
  };
}
const RECORD_COLS = "*,inventory_movements(movement_no),jobs(id,airtable_id,j_number)";

// ---------- Outward: invoices to load ----------

export async function outwardQueue({ since } = {}) {
  const from = clampSince(since);
  let invoices = [];
  let error = "";
  if (!zohoConfigured()) error = "Zoho is not connected yet.";
  else {
    try { invoices = await listInvoicesSince(from); }
    catch (e) { console.error("zoho invoice list failed:", e?.message || e); error = zohoErrorText(e, "invoices"); }
  }
  const recorded = invoices.length
    ? await dbSelect("zoho_invoice_dispatches", { select: "zoho_invoice_id", filter: { zoho_invoice_id: quoteIn(invoices.map((i) => i.id)) }, limit: 2000 })
    : [];
  const doneIds = new Set(recorded.map((r) => r.zoho_invoice_id));
  let pendingRaw = invoices.filter((i) => !doneIds.has(i.id));
  // Oldest first get their SO looked up first, so the job shows on the card.
  const oldestFirst = [...pendingRaw].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const soMap = await salesOrderNumbersFor(oldestFirst.map((i) => i.id)).catch(() => new Map());
  pendingRaw = pendingRaw.map((i) => ({ ...i, soNumber: i.soNumber || soMap.get(i.id) || "" }));
  const jobs = await jobsBySo(pendingRaw.map((i) => i.soNumber));
  const pending = pendingRaw
    .map((i) => {
      const j = i.soNumber ? jobs.get(i.soNumber.toUpperCase()) : null;
      return { ...i, job: j ? { id: j.id, jNumber: j.jNumber, stage: j.stage } : null, waitingDays: daysSince(i.date) };
    })
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.number || "").localeCompare(b.number || ""));

  const [doneRows, queue] = await Promise.all([
    dbSelect("zoho_invoice_dispatches", { select: RECORD_COLS, order: "created_at.desc", limit: 40 }),
    dispatchQueue().catch(() => ({ ready: [], inTransit: [] })),
  ]);
  return { since: from, goLive: OUTWARD_GO_LIVE, error, pending, done: doneRows.map(shapeRecord), readyJobs: queue.ready };
}

// One invoice for the Load panel.
export async function invoiceDetail(zohoInvoiceId) {
  const invoice = await getInvoiceById(zohoInvoiceId);
  if (!invoice) return null;
  const [recordRows, jobs, lines] = await Promise.all([
    dbSelect("zoho_invoice_dispatches", { select: RECORD_COLS, filter: { zoho_invoice_id: `eq.${invoice.id}` }, limit: 1 }),
    jobsBySo([invoice.soNumber]),
    decorateLines(invoice.lines),
  ]);
  const job = invoice.soNumber ? jobs.get(invoice.soNumber.toUpperCase()) || null : null;
  // Jobs the factory has handed over, offered when the SO did not find one.
  let jobChoices = [];
  if (!job) {
    const rows = await dbSelect("jobs", { select: JOB_COLS, filter: { stage: "eq.Ready for Dispatch" }, order: "updated_at.asc", limit: 300 }).catch(() => []);
    const words = String(invoice.customer || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !["private", "limited", "foods", "india"].includes(w));
    const likely = (j) => (words.some((w) => `${j.brand} ${j.item}`.toLowerCase().replace(/\s+/g, "").includes(w)) ? 0 : 1);
    jobChoices = rows.map(shapeJob)
      .map((j) => ({ id: j.id, jNumber: j.jNumber, item: j.item, brand: j.brand, qty: j.qty }))
      .sort((a, b) => likely(a) - likely(b));
  }
  // Goods the warehouse received from that job, if any.
  let jobStock = null;
  if (job) {
    const rows = await dbSelect("inventory_items", { select: "id,sku,name,uom", filter: { sku: `eq.${jobItemSku(job.jNumber)}` }, limit: 1 });
    if (rows[0]) {
      const st = await stockFor([rows[0].id]);
      jobStock = { item: { id: rows[0].id, sku: rows[0].sku, name: rows[0].name, uom: rows[0].uom }, stock: st.get(rows[0].id) || [] };
    }
  }
  return {
    invoice: { ...invoice, lines },
    suggestedTransport: mapTransport(invoice.transport),
    job: job ? { id: job.id, jNumber: job.jNumber, item: job.item, stage: job.stage, qty: job.qty, canDispatch: job.canDispatch } : null,
    jobChoices,
    jobStock,
    record: recordRows[0] ? shapeRecord(recordRows[0]) : null,
  };
}

const intOrNull = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Math.round(Number(String(v).replace(/,/g, "")));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Record an invoice as loaded or not-from-warehouse. Zoho is re-read here so
// quantities always come from the invoice, never from the browser.
export async function recordInvoice({ session, zohoInvoiceId, body = {} }) {
  const detail = await invoiceDetail(zohoInvoiceId);
  if (!detail) return { ok: false, status: 404, error: "Zoho has no such invoice" };
  const { invoice } = detail;
  if (detail.record) return { ok: false, status: 409, error: `${invoice.number} was already recorded by ${detail.record.createdByEmail || "someone"}.` };
  if (invoice.status === "void") return { ok: false, status: 409, error: `${invoice.number} is void in Zoho.` };

  const email = session?.email || null;
  const base = {
    warehouse: DEFAULT_WAREHOUSE,
    zoho_invoice_id: invoice.id,
    invoice_number: invoice.number,
    invoice_date: invoice.date,
    customer: invoice.customer,
    zoho_customer_id: invoice.customerId,
    so_number: invoice.soNumber || null,
    note: String(body.note || "").trim() || null,
    created_by_email: email,
  };
  const insert = async (row) => {
    try { return await dbInsert("zoho_invoice_dispatches", row); }
    catch (e) {
      if (/duplicate|23505/.test(String(e?.message))) return null;
      throw e;
    }
  };

  if (body.status === "not_from_warehouse") {
    const reason = String(body.reason || "").trim();
    if (!reason) return { ok: false, status: 422, error: "Say why this invoice did not go from the warehouse." };
    const row = await insert({ ...base, status: "not_from_warehouse", reason });
    if (!row) return { ok: false, status: 409, error: `${invoice.number} was just recorded by someone else.` };
    clearZohoListCache();
    return { ok: true, status: 200 };
  }
  if (body.status !== "loaded") return { ok: false, status: 400, error: "Unknown status" };

  // ----- loaded -----
  const missing = [];
  if (!body.dispatchedOn) missing.push("dispatch date");
  if (!TRANSPORT_MODES.includes(body.transportMode)) missing.push("transport");
  if (!String(body.lrOrVehicleNumber || "").trim()) missing.push("LR or vehicle number");

  // The job this invoice ships: the SO's job, or one picked by hand.
  let job = detail.job;
  if (!job && body.jobId) {
    const picked = detail.jobChoices.find((j) => j.id === body.jobId);
    if (!picked) missing.push("a job that is ready for dispatch");
    else job = { ...picked, stage: "Ready for Dispatch", canDispatch: true };
  }
  const onJob = !!job?.canDispatch && body.recordOnJob !== false;
  const jobQty = onJob ? intOrNull(body.jobQty) : null;
  if (onJob && !(jobQty > 0)) missing.push(`quantity sent for job ${job.jNumber}`);

  const choices = new Map((Array.isArray(body.lines) ? body.lines : []).map((c) => [String(c.lineId), c]));
  const check = await resolveLineItems({ lines: invoice.lines, choices, email, commit: false });
  for (const name of check.missing) missing.push(`which warehouse item "${name}" is`);
  if (missing.length) return { ok: false, status: 422, error: `Fill these first: ${missing.join(", ")}.` };

  // Insert first: the unique invoice id stops a double tap posting stock twice.
  const jobPgId = onJob ? await jobPg(job.id) : null;
  const row = await insert({
    ...base,
    status: "loaded",
    dispatched_on: String(body.dispatchedOn).slice(0, 10),
    transport_mode: body.transportMode,
    lr_or_vehicle_number: String(body.lrOrVehicleNumber).trim(),
    driver_contact: String(body.driverContact || "").trim() || null,
    eway_bill_no: String(body.ewayBillNo || "").trim() || null,
    cartons: intOrNull(body.cartons),
    job_id: jobPgId,
  });
  if (!row) return { ok: false, status: 409, error: `${invoice.number} was just recorded by someone else.` };

  let movement = null;
  try {
    const { resolved } = await resolveLineItems({ lines: invoice.lines, choices, email, commit: true });
    const moveLines = [];
    for (const l of invoice.lines) {
      const r = resolved.get(l.lineId);
      const from = choices.get(l.lineId)?.fromLocationId;
      // "" = not off the racks this time (straight from production or a vendor).
      if (r?.itemId && from) moveLines.push({ item_id: r.itemId, from_location_id: from, qty: l.qty, remarks: `${invoice.number} · ${l.name}`.slice(0, 200) });
    }
    if (moveLines.length) {
      movement = await postMovement({
        type: "outward",
        reference_type: "customer",
        reference: invoice.number,
        movement_date: String(body.dispatchedOn).slice(0, 10),
        notes: `Zoho invoice ${invoice.number} · ${invoice.customer}${invoice.soNumber ? ` · ${invoice.soNumber}` : ""}`,
        source_job_id: jobPgId,
        lines: moveLines,
      }, email);
      await dbUpdate("zoho_invoice_dispatches", "id", row.id, { movement_id: movement.id }, { returning: "minimal" });
    }
  } catch (e) {
    await dbDelete("zoho_invoice_dispatches", "id", row.id).catch(() => {});
    return { ok: false, status: 400, error: `Stock could not be taken out: ${e.message}` };
  }

  const warnings = [];
  if (onJob) {
    const res = await addDispatch({
      session,
      jobId: job.id,
      body: {
        dispatchedOn: body.dispatchedOn, qty: jobQty, cartons: body.cartons,
        transportMode: body.transportMode, lrOrVehicleNumber: body.lrOrVehicleNumber,
        driverContact: body.driverContact, zohoInvoiceNo: invoice.number,
        ewayBillNo: body.ewayBillNo, note: body.note, complete: body.jobComplete === true,
      },
    }).catch((e) => ({ ok: false, error: e.message }));
    if (!res.ok) warnings.push(`Loaded, but job ${job.jNumber} was not updated: ${res.error} Record it on the job page.`);
  }
  clearZohoListCache();
  return { ok: true, status: 200, movementNo: movement?.movement_no || null, warnings };
}

async function jobPg(publicId) {
  const rows = await dbSelect("jobs", {
    select: "id",
    filter: /^[0-9a-f-]{36}$/i.test(publicId) ? { id: `eq.${publicId}` } : { airtable_id: `eq.${publicId}` },
    limit: 1,
  });
  return rows[0]?.id || null;
}

// Admin undo: puts stock back on the racks it came from and removes the record
// so the invoice shows as "to load" again. A dispatch lot already on a job
// stays there (remove it on the job page if it was wrong).
export async function undoInvoiceRecord({ session, recordId }) {
  const rows = await dbSelect("zoho_invoice_dispatches", { select: "*", filter: { id: `eq.${recordId}` }, limit: 1 });
  const r = rows[0];
  if (!r) return { ok: false, status: 404, error: "Record not found" };
  let reversal = null;
  if (r.movement_id) {
    const mv = await getMovement(r.movement_id);
    const lines = (mv?.lines || [])
      .filter((l) => l.from_location_id)
      .map((l) => ({ item_id: l.item_id, to_location_id: l.from_location_id, qty: Number(l.qty), remarks: `Undo ${r.invoice_number}` }));
    if (lines.length) {
      reversal = await postMovement({
        type: "inward", reference_type: "return", reference: r.invoice_number,
        notes: `Undo of ${mv.movement_no} (Zoho invoice ${r.invoice_number} recorded by mistake)`,
        lines,
      }, session?.email);
    }
  }
  await dbDelete("zoho_invoice_dispatches", "id", r.id);
  clearZohoListCache();
  return { ok: true, status: 200, reversalNo: reversal?.movement_no || null, jobLotKept: !!r.job_id };
}

// ---------- In transit → delivered ----------

export async function transitQueue() {
  const [rows, queue] = await Promise.all([
    dbSelect("zoho_invoice_dispatches", {
      select: RECORD_COLS,
      filter: { status: "eq.loaded", delivered_on: "is.null" },
      order: "dispatched_on.asc",
      limit: 500,
    }),
    dispatchQueue().catch(() => ({ ready: [], inTransit: [] })),
  ]);
  const invoices = rows.map(shapeRecord);
  const covered = new Set(invoices.map((r) => r.jobPublicId).filter(Boolean));
  // Jobs marked dispatched with no invoice record here (older ones, or
  // dispatched from the job page).
  const jobs = queue.inTransit.filter((j) => !covered.has(j.id));
  const delivered = await dbSelect("zoho_invoice_dispatches", {
    select: RECORD_COLS,
    filter: { status: "eq.loaded", delivered_on: "not.is.null" },
    order: "delivered_on.desc,created_at.desc",
    limit: 25,
  });
  return { invoices, jobs, delivered: delivered.map(shapeRecord) };
}

export async function confirmDelivery({ session, recordId, body = {} }) {
  const rows = await dbSelect("zoho_invoice_dispatches", { select: RECORD_COLS, filter: { id: `eq.${recordId}` }, limit: 1 });
  const r = rows[0];
  if (!r) return { ok: false, status: 404, error: "Record not found" };
  if (r.status !== "loaded") return { ok: false, status: 409, error: "This invoice did not go from the warehouse." };
  const on = /^\d{4}-\d{2}-\d{2}$/.test(String(body.deliveredOn || "")) ? body.deliveredOn : null;
  if (!on) return { ok: false, status: 422, error: "Give the delivery date." };
  if (r.dispatched_on && on < r.dispatched_on) return { ok: false, status: 422, error: "Delivery date is before the dispatch date." };

  // Zoho tick first, best effort: a failure never blocks the delivery.
  let synced = false; let ackError = null;
  try { await setInvoiceDelivered(r.zoho_invoice_id, true); synced = true; }
  catch (e) { ackError = isScopeError(e) ? "Zoho connection has no permission to update invoices" : String(e?.message || e).slice(0, 200); }

  await dbUpdate("zoho_invoice_dispatches", "id", r.id, {
    delivered_on: on,
    delivered_by_email: session?.email || null,
    delivered_note: String(body.note || "").trim() || null,
    zoho_ack_synced: synced,
    zoho_ack_error: ackError,
  }, { returning: "minimal" });

  const warnings = [];
  if (!synced) warnings.push("Saved here, but Zoho's Delivery Acknowledgment was not ticked.");
  if (r.jobs) {
    const jobId = r.jobs.airtable_id || r.jobs.id;
    const res = await moveStage({ session, jobId, to: "Delivered", fields: { deliveredOn: on } }).catch((e) => ({ ok: false, error: e.message }));
    // A job still partly dispatched stays where it is; that is not an error.
    if (!res.ok && !/Ready for Dispatch|cannot|can't|not allowed/i.test(String(res.error))) warnings.push(`Job ${r.jobs.j_number} was not marked delivered: ${res.error}`);
  }
  return { ok: true, status: 200, zohoSynced: synced, warnings };
}
