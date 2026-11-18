// Warehouse Inward (18-Nov-2026 rebuild). Two senders, one screen:
//   • vendors      — every Zoho purchase order is "expected" until the
//                    warehouse receives against it (in one or more lots) or
//                    marks it as not coming to the warehouse.
//   • the factory  — every job the factory hands over (Ready for Dispatch) is
//                    "to receive" until the warehouse takes it in. The factory
//                    is treated like any other sender, so the two can sit on
//                    different sites later.
// Each receipt posts one inward stock movement to the chosen rack. Rejected
// quantity goes to the reject location. No rates or amounts.

import { dbSelect, dbInsert, dbUpdate, dbDelete } from "../db/supabase.js";
import { listPurchaseOrdersSince, getPurchaseOrderById, zohoConfigured, clearZohoListCache } from "../zoho/books.js";
import { postMovement, getMovement } from "./movements.js";
import { decorateLines, resolveLineItems, createWarehouseItem, quoteIn, jobItemSku } from "./zohoItems.js";
import { clampSince, zohoErrorText } from "./outward.js";
import { DEFAULT_WAREHOUSE } from "./access.js";
import { todayIST, daysSince } from "./dates.js";

export const INWARD_GO_LIVE = "2026-11-01";
export const NOT_TO_WAREHOUSE_REASONS = ["Delivered direct to a printer or vendor", "Delivered direct to the customer", "Service, no goods", "PO cancelled or replaced", "Other"];
const REJECT_LOCATION = "BWD-REJECT";

const num = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };
const intOrNull = (v) => { const n = Math.round(num(v)); return n > 0 ? n : null; };

function shapeReceipt(r) {
  return {
    id: r.id,
    source: r.source,
    status: r.status,
    poNumber: r.po_number || "",
    vendor: r.vendor || "",
    jNumber: r.jobs?.j_number || "",
    jobItem: r.jobs?.item || "",
    receivedOn: r.received_on,
    challanNo: r.challan_no || "",
    cartons: r.cartons,
    complete: !!r.complete,
    reason: r.reason || "",
    note: r.note || "",
    movementNo: r.inventory_movements?.movement_no || "",
    qty: (r.warehouse_receipt_lines || []).reduce((t, l) => t + Number(l.qty_received || 0), 0),
    rejected: (r.warehouse_receipt_lines || []).reduce((t, l) => t + Number(l.qty_rejected || 0), 0),
    createdByEmail: r.created_by_email || "",
    createdAt: r.created_at,
  };
}
const RECEIPT_COLS = "*,inventory_movements(movement_no),jobs(j_number,item),warehouse_receipt_lines(zoho_line_id,qty_received,qty_rejected)";

// ---------- The list ----------

export async function inwardQueue({ since } = {}) {
  const from = clampSince(since, INWARD_GO_LIVE);
  let pos = [];
  let error = "";
  if (!zohoConfigured()) error = "Zoho is not connected yet.";
  else {
    try { pos = await listPurchaseOrdersSince(from); }
    catch (e) { console.error("zoho po list failed:", e?.message || e); error = zohoErrorText(e, "purchase orders"); }
  }
  const poReceipts = pos.length
    ? await dbSelect("warehouse_receipts", {
        select: "zoho_po_id,status,complete,warehouse_receipt_lines(qty_received)",
        filter: { source: "eq.zoho_po", zoho_po_id: quoteIn(pos.map((p) => p.id)) },
        limit: 5000,
      })
    : [];
  const closed = new Set();
  const receivedSoFar = new Map();
  for (const r of poReceipts) {
    if (r.complete || r.status === "not_to_warehouse") closed.add(r.zoho_po_id);
    const q = (r.warehouse_receipt_lines || []).reduce((t, l) => t + Number(l.qty_received || 0), 0);
    receivedSoFar.set(r.zoho_po_id, (receivedSoFar.get(r.zoho_po_id) || 0) + q);
  }
  const t = todayIST();
  const expected = pos
    .filter((p) => !closed.has(p.id))
    .map((p) => ({
      ...p,
      receivedSoFar: receivedSoFar.get(p.id) || 0,
      overdueDays: p.expectedOn && p.expectedOn < t ? daysSince(p.expectedOn) : 0,
    }))
    .sort((a, b) => (a.expectedOn || "9999").localeCompare(b.expectedOn || "9999") || (a.number || "").localeCompare(b.number || ""));

  // Jobs the factory has handed over that the warehouse has not taken in.
  const jobRows = await dbSelect("jobs", {
    select: "id,airtable_id,j_number,item,brand,city,qty,fg_qty,fg_cartons,closed_at,updated_at,close_note,zoho_so_no,clients(name)",
    filter: { stage: "eq.Ready for Dispatch" },
    order: "updated_at.asc",
    limit: 500,
  }).catch(() => []);
  const jobReceipts = jobRows.length
    ? await dbSelect("warehouse_receipts", {
        select: "job_id,status,complete,warehouse_receipt_lines(qty_received)",
        filter: { source: "eq.factory_job", job_id: quoteIn(jobRows.map((j) => j.id)) },
        limit: 5000,
      })
    : [];
  const jobClosed = new Set();
  const jobGot = new Map();
  for (const r of jobReceipts) {
    if (r.complete || r.status === "not_to_warehouse") jobClosed.add(r.job_id);
    const q = (r.warehouse_receipt_lines || []).reduce((t2, l) => t2 + Number(l.qty_received || 0), 0);
    jobGot.set(r.job_id, (jobGot.get(r.job_id) || 0) + q);
  }
  const fromFactory = jobRows
    .filter((j) => !jobClosed.has(j.id))
    .map((j) => ({
      id: j.airtable_id || j.id,
      jNumber: j.j_number,
      item: j.item || "",
      brand: j.brand || j.clients?.name || "",
      qty: j.fg_qty != null ? Number(j.fg_qty) : j.qty,
      cartons: j.fg_cartons,
      note: j.close_note || "",
      soNumber: j.zoho_so_no || "",
      receivedSoFar: jobGot.get(j.id) || 0,
      waitingDays: daysSince(j.closed_at || j.updated_at) || 0,
    }));

  const recent = await dbSelect("warehouse_receipts", { select: RECEIPT_COLS, order: "created_at.desc", limit: 40 });
  return { since: from, goLive: INWARD_GO_LIVE, error, expected, fromFactory, recent: recent.map(shapeReceipt) };
}

// ---------- Vendor PO ----------

export async function poDetail(zohoPoId) {
  const po = await getPurchaseOrderById(zohoPoId);
  if (!po) return null;
  const [lines, receipts] = await Promise.all([
    decorateLines(po.lines),
    dbSelect("warehouse_receipts", { select: RECEIPT_COLS, filter: { source: "eq.zoho_po", zoho_po_id: `eq.${po.id}` }, order: "created_at.asc", limit: 200 }),
  ]);
  const got = new Map();
  for (const r of receipts) for (const l of r.warehouse_receipt_lines || []) {
    got.set(l.zoho_line_id, (got.get(l.zoho_line_id) || 0) + Number(l.qty_received || 0) + Number(l.qty_rejected || 0));
  }
  return {
    po: { ...po, lines: lines.map((l) => ({ ...l, receivedSoFar: got.get(l.lineId) || 0, balance: Math.max(0, l.qty - (got.get(l.lineId) || 0)) })) },
    receipts: receipts.map(shapeReceipt),
    closed: receipts.some((r) => r.complete || r.status === "not_to_warehouse"),
  };
}

async function rejectLocationId() {
  const rows = await dbSelect("inventory_locations", { select: "id", filter: { code: `eq.${REJECT_LOCATION}` }, limit: 1 });
  return rows[0]?.id || null;
}

export async function recordPoReceipt({ session, zohoPoId, body = {} }) {
  const detail = await poDetail(zohoPoId);
  if (!detail) return { ok: false, status: 404, error: "Zoho has no such purchase order" };
  const { po } = detail;
  if (detail.closed) return { ok: false, status: 409, error: `${po.number} is already closed here.` };
  const email = session?.email || null;
  const base = {
    warehouse: DEFAULT_WAREHOUSE, source: "zoho_po", zoho_po_id: po.id, po_number: po.number, po_date: po.date,
    vendor: po.vendor, note: String(body.note || "").trim() || null, created_by_email: email,
  };

  if (body.status === "not_to_warehouse") {
    const reason = String(body.reason || "").trim();
    if (!reason) return { ok: false, status: 422, error: "Say why this PO is not coming to the warehouse." };
    await dbInsert("warehouse_receipts", { ...base, status: "not_to_warehouse", reason, complete: true }, { returning: "minimal" });
    clearZohoListCache();
    return { ok: true, status: 200 };
  }
  if (body.status !== "received") return { ok: false, status: 400, error: "Unknown status" };

  const missing = [];
  const receivedOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.receivedOn || "")) ? body.receivedOn : null;
  if (!receivedOn) missing.push("received date");
  const choices = new Map((Array.isArray(body.lines) ? body.lines : []).map((c) => [String(c.lineId), c]));
  const goods = po.lines.filter((l) => l.goods && l.qty > 0);
  const active = goods.filter((l) => num(choices.get(l.lineId)?.qtyReceived) + num(choices.get(l.lineId)?.qtyRejected) > 0);
  if (!active.length && body.complete !== true) missing.push("a quantity received on at least one line");
  const check = await resolveLineItems({ lines: active, choices, email, sourceForNew: "Traded", commit: false });
  for (const name of check.missing) missing.push(`which warehouse item "${name}" is`);
  for (const l of active) {
    const c = choices.get(l.lineId) || {};
    const r = check.resolved.get(l.lineId);
    if (r && !r.notStock && num(c.qtyReceived) > 0 && !c.toLocationId) missing.push(`where "${l.name}" was put`);
  }
  if (missing.length) return { ok: false, status: 422, error: `Fill these first: ${missing.join(", ")}.` };

  const { resolved } = await resolveLineItems({ lines: active, choices, email, sourceForNew: "Traded", commit: true });
  const rejectLoc = active.some((l) => num(choices.get(l.lineId)?.qtyRejected) > 0) ? await rejectLocationId() : null;
  const moveLines = [];
  const receiptLines = [];
  let allIn = true;
  for (const l of goods) {
    const c = choices.get(l.lineId) || {};
    const r = resolved.get(l.lineId);
    const got = num(c.qtyReceived); const bad = num(c.qtyRejected);
    if (l.receivedSoFar + got + bad < l.qty) allIn = false;
    if (!(got + bad > 0)) continue;
    receiptLines.push({
      zoho_line_id: l.lineId, zoho_item_id: l.itemId, name: l.name, unit: l.unit, qty_ordered: l.qty,
      qty_received: got, qty_rejected: bad, inventory_item_id: r?.itemId || null, location_id: r?.itemId && got > 0 ? c.toLocationId : null,
    });
    if (r?.itemId && got > 0) moveLines.push({ item_id: r.itemId, to_location_id: c.toLocationId, qty: got, remarks: `${po.number} · ${l.name}`.slice(0, 200) });
    if (r?.itemId && bad > 0 && rejectLoc) moveLines.push({ item_id: r.itemId, to_location_id: rejectLoc, qty: bad, reject_reason: "damaged", remarks: `${po.number} · rejected on receipt` });
  }

  let movement = null;
  if (moveLines.length) {
    try {
      movement = await postMovement({
        type: "inward", reference_type: "supplier", reference: po.number, movement_date: receivedOn,
        notes: `Zoho PO ${po.number} · ${po.vendor}${body.challanNo ? ` · challan ${String(body.challanNo).trim()}` : ""}`,
        lines: moveLines,
      }, email);
    } catch (e) {
      return { ok: false, status: 400, error: `Stock could not be taken in: ${e.message}` };
    }
  }
  const complete = body.complete === true || (body.complete !== false && allIn);
  const receipt = await dbInsert("warehouse_receipts", {
    ...base, status: "received", received_on: receivedOn,
    challan_no: String(body.challanNo || "").trim() || null,
    vehicle_no: String(body.vehicleNo || "").trim() || null,
    cartons: intOrNull(body.cartons), complete, movement_id: movement?.id || null,
  });
  if (receiptLines.length) {
    await dbInsert("warehouse_receipt_lines", receiptLines.map((l) => ({ ...l, receipt_id: receipt.id })), { returning: "minimal" });
  }
  clearZohoListCache();
  return { ok: true, status: 200, movementNo: movement?.movement_no || null, complete };
}

// ---------- From the factory ----------

async function jobRow(publicId) {
  const rows = await dbSelect("jobs", {
    select: "id,airtable_id,j_number,item,brand,qty,fg_qty,fg_cartons,stage,master_sku,clients(name)",
    filter: /^[0-9a-f-]{36}$/i.test(publicId) ? { id: `eq.${publicId}` } : { airtable_id: `eq.${publicId}` },
    limit: 1,
  });
  return rows[0] || null;
}

async function jobItem(job, email) {
  const sku = jobItemSku(job.j_number);
  const found = await dbSelect("inventory_items", { select: "id,sku", filter: { sku: `eq.${sku}` }, limit: 1 });
  if (found[0]) return found[0];
  const brand = job.brand || job.clients?.name || "";
  return createWarehouseItem({
    sku, name: `${job.item || "Job goods"}${brand ? ` · ${brand}` : ""}`, unit: "pcs", source: "FG",
    industry: "Packaging", brandCustomer: brand || null, notes: `Goods from job ${job.j_number}`, email,
  });
}

export async function recordJobReceipt({ session, jobId, body = {} }) {
  const job = await jobRow(jobId);
  if (!job) return { ok: false, status: 404, error: "Job not found" };
  const prior = await dbSelect("warehouse_receipts", { select: "status,complete", filter: { source: "eq.factory_job", job_id: `eq.${job.id}` }, limit: 200 });
  if (prior.some((r) => r.complete || r.status === "not_to_warehouse")) return { ok: false, status: 409, error: `Job ${job.j_number} was already taken in.` };
  const email = session?.email || null;
  const base = { warehouse: DEFAULT_WAREHOUSE, source: "factory_job", job_id: job.id, note: String(body.note || "").trim() || null, created_by_email: email };

  if (body.status === "not_to_warehouse") {
    const reason = String(body.reason || "").trim();
    if (!reason) return { ok: false, status: 422, error: "Say why these goods are not coming to the warehouse." };
    await dbInsert("warehouse_receipts", { ...base, status: "not_to_warehouse", reason, complete: true }, { returning: "minimal" });
    return { ok: true, status: 200 };
  }
  if (body.status !== "received") return { ok: false, status: 400, error: "Unknown status" };

  const missing = [];
  const receivedOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.receivedOn || "")) ? body.receivedOn : null;
  const qty = Math.round(num(body.qty));
  if (!receivedOn) missing.push("received date");
  if (!(qty > 0)) missing.push("quantity received");
  if (!body.toLocationId) missing.push("where the goods were put");
  if (missing.length) return { ok: false, status: 422, error: `Fill these first: ${missing.join(", ")}.` };

  const item = await jobItem(job, email);
  let movement;
  try {
    movement = await postMovement({
      type: "inward", reference_type: "production", reference: job.j_number, movement_date: receivedOn,
      notes: `Received from the factory · job ${job.j_number}`, source_job_id: job.id,
      lines: [{ item_id: item.id, to_location_id: body.toLocationId, qty, remarks: `Job ${job.j_number}` }],
    }, email);
  } catch (e) {
    return { ok: false, status: 400, error: `Stock could not be taken in: ${e.message}` };
  }
  const receipt = await dbInsert("warehouse_receipts", {
    ...base, status: "received", received_on: receivedOn, cartons: intOrNull(body.cartons),
    complete: body.complete !== false, movement_id: movement.id,
  });
  await dbInsert("warehouse_receipt_lines", {
    receipt_id: receipt.id, name: job.item, unit: "pcs", qty_ordered: job.fg_qty ?? job.qty, qty_received: qty,
    inventory_item_id: item.id, location_id: body.toLocationId,
  }, { returning: "minimal" });
  return { ok: true, status: 200, movementNo: movement.movement_no, itemSku: item.sku };
}

// ---------- Admin undo ----------
// Takes the received stock back out of the racks it went into and removes the
// receipt, so the PO or job shows as expected again.
export async function undoReceipt({ session, receiptId }) {
  const rows = await dbSelect("warehouse_receipts", { select: "*", filter: { id: `eq.${receiptId}` }, limit: 1 });
  const r = rows[0];
  if (!r) return { ok: false, status: 404, error: "Receipt not found" };
  let reversal = null;
  if (r.movement_id) {
    const mv = await getMovement(r.movement_id);
    const lines = (mv?.lines || [])
      .filter((l) => l.to_location_id)
      .map((l) => ({ item_id: l.item_id, from_location_id: l.to_location_id, qty: Number(l.qty), remarks: `Undo ${mv.movement_no}` }));
    if (lines.length) {
      try {
        reversal = await postMovement({
          type: "outward", reference_type: "manual", reference: r.po_number || mv.reference,
          notes: `Undo of ${mv.movement_no} (receipt recorded by mistake)`, lines,
        }, session?.email);
      } catch (e) {
        return { ok: false, status: 400, error: `Could not take the stock back out: ${e.message}` };
      }
    }
  }
  await dbDelete("warehouse_receipts", "id", r.id);
  clearZohoListCache();
  return { ok: true, status: 200, reversalNo: reversal?.movement_no || null };
}
