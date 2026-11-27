// Closing the dispatch loop (Arjun, 20-Nov-2026).
//
// Jobs were reaching Dispatched and staying there because "delivered" had to
// be pressed one job at a time. This lists them and marks several delivered in
// one go. It also lists jobs sitting at Ready for Dispatch, and lets an admin
// close the old ones that left long before dispatch was recorded in FactoryOS.
//
// Every change goes through moveStage, so the step rules, roles and the job
// timeline behave exactly as they do on the job page. No columns are added.

import { dbSelect, dbUpdate } from "@/lib/db/supabase";
import { moveStage, roleOf } from "@/lib/factoryos/transitions";
import { canMoveTo } from "@/lib/factoryos/steps";
import { ROLES } from "@/lib/auth/roles";

const IST_OFFSET = 5.5 * 3600000;
const todayIst = () => new Date(Date.now() + IST_OFFSET).toISOString().slice(0, 10);
const day = (v) => (v ? String(v).slice(0, 10) : null);
const daysSince = (d, today) => (d ? Math.max(0, Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${d}T12:00:00Z`)) / 86400000)) : null);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLS = "id,airtable_id,j_number,brand,item,qty,fg_qty,stage,order_date,created_at,updated_at,closed_at,dispatched_on,zoho_so_no,clients(name)";

export function canMarkDelivered(session) {
  return canMoveTo(roleOf(session), "Delivered");
}
export function canCloseOld(session) {
  return roleOf(session) === ROLES.ADMIN;
}

export async function closeoutLists() {
  const today = todayIst();
  const rows = await dbSelect("jobs", {
    select: COLS,
    filter: { stage: "in.(\"Ready for Dispatch\",\"Dispatched\")" },
    order: "order_date.asc.nullslast",
    limit: 2000,
  });
  if (!rows.length) return { today, dispatched: [], ready: [] };
  const lotRows = await dbSelect("job_dispatches", {
    select: "job_id,dispatched_on,qty,transport_mode,lr_or_vehicle_number,zoho_invoice_no",
    filter: { job_id: `in.(${rows.map((r) => r.id).join(",")})` },
    order: "dispatched_on.asc,created_at.asc",
    limit: 5000,
  }).catch(() => []);
  const lots = new Map();
  for (const l of lotRows) {
    if (!lots.has(l.job_id)) lots.set(l.job_id, []);
    lots.get(l.job_id).push(l);
  }
  const shape = (r) => {
    const mine = lots.get(r.id) || [];
    const last = mine[mine.length - 1] || null;
    // 1900-01-01 is the placeholder old imports carry for "no order date".
    const ordered = day(r.order_date) && day(r.order_date) > "2000-01-01" ? day(r.order_date) : day(r.created_at);
    const left = day(r.dispatched_on) || day(last?.dispatched_on);
    const handedOver = day(r.closed_at);
    return {
      id: r.airtable_id || r.id,
      jNumber: r.j_number,
      customer: r.clients?.name || "",
      brand: r.brand || "",
      item: r.item || "",
      qty: r.qty != null ? Number(r.qty) : null,
      stage: r.stage,
      soNo: r.zoho_so_no || "",
      orderedOn: ordered,
      leftOn: left,
      daysOut: daysSince(left, today),
      handedOverOn: handedOver,
      // No handover date on old jobs: fall back to how long ago it was ordered.
      waitingDays: handedOver ? daysSince(handedOver, today) : null,
      orderedDays: daysSince(ordered, today),
      lots: mine.length,
      sentQty: mine.reduce((t, l) => t + (Number(l.qty) || 0), 0),
      invoiceNo: last?.zoho_invoice_no || "",
      transport: last ? [last.transport_mode, last.lr_or_vehicle_number].filter(Boolean).join(" ") : "",
    };
  };
  // Oldest order first (by the date shown, which skips the 1900 placeholder).
  const all = rows.map(shape).sort((a, b) => String(a.orderedOn || "9999").localeCompare(String(b.orderedOn || "9999")) || String(a.jNumber).localeCompare(String(b.jNumber)));
  return {
    today,
    dispatched: all.filter((j) => j.stage === "Dispatched"),
    ready: all.filter((j) => j.stage === "Ready for Dispatch"),
  };
}

// Run `fn` over `items`, a few at a time.
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]).catch((e) => ({ ok: false, error: e.message || "Failed" }));
    }
  }));
  return out;
}

async function loadJobs(ids) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 100);
  if (!clean.length) return [];
  const uuids = clean.filter((x) => UUID.test(x));
  const others = clean.filter((x) => !UUID.test(x) && /^[A-Za-z0-9]+$/.test(x));
  const [a, b] = await Promise.all([
    uuids.length ? dbSelect("jobs", { select: "id,airtable_id,j_number,stage,dispatched_on", filter: { id: `in.(${uuids.join(",")})` } }) : [],
    others.length ? dbSelect("jobs", { select: "id,airtable_id,j_number,stage,dispatched_on", filter: { airtable_id: `in.(${others.join(",")})` } }) : [],
  ]);
  return [...a, ...b];
}

// When a job is closed from here, close its warehouse invoice records too, so
// the invoice does not sit under "In transit" for ever (audit, 27-Nov-2026).
// Only records that were loaded from the warehouse and are still open. The
// Zoho "delivery acknowledgment" tick is NOT sent from the bulk screen (one
// Zoho call per invoice would eat the daily limit); the record says so.
async function closeInvoiceRecords(jobPgId, deliveredOn, session) {
  const open = await dbSelect("zoho_invoice_dispatches", {
    select: "id,dispatched_on",
    filter: { job_id: `eq.${jobPgId}`, status: "eq.loaded", delivered_on: "is.null" },
    limit: 50,
  }).catch(() => []);
  for (const rec of open) {
    // Never record a delivery before the day the invoice left.
    const on = rec.dispatched_on && deliveredOn < String(rec.dispatched_on).slice(0, 10) ? String(rec.dispatched_on).slice(0, 10) : deliveredOn;
    await dbUpdate("zoho_invoice_dispatches", "id", rec.id, {
      delivered_on: on,
      delivered_by_email: session?.email || null,
      delivered_note: "Closed from the Mark delivered list",
      zoho_ack_synced: false,
      zoho_ack_error: "Not ticked in Zoho: closed from the Mark delivered list",
    }, { returning: "minimal" }).catch((e) => console.error("closeout: invoice record not closed", rec.id, e?.message));
  }
  return open.length;
}

function checkDeliveredOn(deliveredOn) {
  if (!isDate(deliveredOn)) return "Pick the delivery date.";
  if (deliveredOn > todayIst()) return "The delivery date cannot be in the future.";
  return "";
}

// Mark several Dispatched jobs delivered on one date.
export async function bulkDeliver({ session, ids, deliveredOn }) {
  if (!canMarkDelivered(session)) return { ok: false, status: 403, error: "Delivered is set by the warehouse, sales or an admin." };
  const bad = checkDeliveredOn(deliveredOn);
  if (bad) return { ok: false, status: 422, error: bad };
  const jobs = await loadJobs(ids);
  if (!jobs.length) return { ok: false, status: 422, error: "Tick at least one job." };

  const results = await pool(jobs, 4, async (r) => {
    const jNumber = r.j_number;
    // Checked here so a job that has moved on is never touched.
    if (r.stage !== "Dispatched") return { ok: false, jNumber, error: `is at ${r.stage}, not Dispatched` };
    const res = await moveStage({ session, jobId: r.airtable_id || r.id, to: "Delivered", fields: { deliveredOn }, note: "Marked delivered from the Mark delivered list" });
    if (!res.ok) return { ok: false, jNumber, error: res.error };
    await closeInvoiceRecords(r.id, deliveredOn, session);
    return { ok: true, jNumber };
  });
  return summarise(results);
}

// Admin only: close jobs that are still at Ready for Dispatch although the
// goods left long ago and no dispatch was ever recorded here.
export async function bulkCloseOld({ session, ids, deliveredOn, leftOn, reason }) {
  if (!canCloseOld(session)) return { ok: false, status: 403, error: "Only an admin can close a job without a dispatch record." };
  const bad = checkDeliveredOn(deliveredOn);
  if (bad) return { ok: false, status: 422, error: bad };
  if (leftOn && (!isDate(leftOn) || leftOn > deliveredOn)) return { ok: false, status: 422, error: "The date it left must be on or before the delivery date." };
  const why = String(reason || "").trim();
  if (why.length < 5) return { ok: false, status: 422, error: "Write the reason these jobs are being closed without a dispatch record." };
  const jobs = await loadJobs(ids);
  if (!jobs.length) return { ok: false, status: 422, error: "Tick at least one job." };

  const results = await pool(jobs, 4, async (r) => {
    const jNumber = r.j_number;
    if (r.stage !== "Ready for Dispatch") return { ok: false, jNumber, error: `is at ${r.stage}, not Ready for Dispatch` };
    const res = await moveStage({ session, jobId: r.airtable_id || r.id, to: "Delivered", fields: { deliveredOn }, override: true, reason: why });
    if (!res.ok) return { ok: false, jNumber, error: res.error };
    if (leftOn && !r.dispatched_on) await dbUpdate("jobs", "id", r.id, { dispatched_on: leftOn }, { returning: "minimal" });
    return { ok: true, jNumber };
  });
  return summarise(results);
}

function summarise(results) {
  const done = results.filter((r) => r.ok).map((r) => r.jNumber);
  const failed = results.filter((r) => !r.ok).map((r) => ({ jNumber: r.jNumber || "", error: r.error || "Failed" }));
  return { ok: true, status: 200, done, failed };
}
