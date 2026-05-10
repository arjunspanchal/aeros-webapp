// WarehouseOS — Sample Dispatch data layer.
// CMs create a dispatch note (free-text customer block + line items); FE
// warehouse staff work the queue and mark dispatched with courier + AWB.
// Reads/writes go through Supabase REST via lib/db/supabase.js.

import { dbSelect, dbInsert, dbUpdate } from "../db/supabase.js";
import { ROLES } from "../factoryos/constants.js";

// Anyone internal can create a dispatch note — CMs (Account Manager) draft
// them, warehouse staff (FE/FM/Admin) work the queue. Customer role is
// excluded explicitly.
export function canManageSampleDispatch(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const role = session.modules?.factoryos;
  return (
    role === ROLES.ACCOUNT_MANAGER ||
    role === ROLES.FACTORY_MANAGER ||
    role === ROLES.FACTORY_EXECUTIVE
  );
}

export const SAMPLE_DISPATCH_STATUSES = ["pending", "dispatched", "cancelled"];

// 8-digit per-line order id, matches the CBX######## pattern in the legacy
// Excel sheet so warehouse + courier scans stay consistent.
export function generateOrderId() {
  const n = Math.floor(10000000 + Math.random() * 90000000);
  return `CBX${n}`;
}

function lineTotals(line) {
  const qty = Number(line.quantity || 0);
  const price = Number(line.price || 0);
  const gstPct = Number(line.gst_pct || 0);
  const totalExcl = +(qty * price).toFixed(2);
  const totalIncl = +(totalExcl * (1 + gstPct / 100)).toFixed(2);
  return { totalExcl, totalIncl };
}

function summarize(items) {
  let totalExcl = 0, totalIncl = 0, totalGst = 0;
  for (const ln of items || []) {
    const t = lineTotals(ln);
    totalExcl += t.totalExcl;
    totalIncl += t.totalIncl;
    totalGst += (t.totalIncl - t.totalExcl);
  }
  return {
    total_excl_gst: +totalExcl.toFixed(2),
    total_gst:      +totalGst.toFixed(2),
    total_incl_gst: +totalIncl.toFixed(2),
  };
}

function normalize(row) {
  if (!row) return null;
  const items = (row.sample_dispatch_items || [])
    .slice()
    .sort((a, b) => (a.sr_no || 0) - (b.sr_no || 0))
    .map((ln) => {
      const { totalExcl, totalIncl } = lineTotals(ln);
      return {
        id: ln.id,
        sr_no: ln.sr_no,
        order_id: ln.order_id,
        description: ln.description,
        quantity: Number(ln.quantity),
        price: Number(ln.price),
        gst_pct: Number(ln.gst_pct),
        master_product_id: ln.master_product_id || null,
        total_excl_gst: totalExcl,
        total_incl_gst: totalIncl,
      };
    });
  const totals = summarize(items);
  const { sample_dispatch_items: _omit, ...rest } = row;
  return { ...rest, items, ...totals };
}

const LIST_SELECT =
  "id,dispatch_no,dispatch_date,managed_by,customer_name,customer_contact," +
  "status,courier,awb,dispatched_at,created_at,created_by," +
  "sample_dispatch_items(id,sr_no,order_id,description,quantity,price,gst_pct)";

const DETAIL_SELECT =
  "id,dispatch_no,dispatch_date,managed_by,managed_by_user_id," +
  "customer_name,customer_contact,customer_billing_address," +
  "customer_delivery_address,customer_gstin,status,courier,awb," +
  "dispatched_at,dispatched_by_user_id,notes,created_at,updated_at,created_by," +
  "sample_dispatch_items(id,sr_no,order_id,description,quantity,price,gst_pct,master_product_id)";

export async function listDispatches({ status = "", limit = 200 } = {}) {
  const filter = { deleted_at: "is.null" };
  if (status) filter.status = `eq.${status}`;
  const rows = await dbSelect("sample_dispatches", {
    select: LIST_SELECT,
    filter,
    order: "dispatch_date.desc,created_at.desc",
    limit,
  });
  return rows.map(normalize);
}

export async function getDispatch(id) {
  const rows = await dbSelect("sample_dispatches", {
    select: DETAIL_SELECT,
    filter: { id: `eq.${id}`, deleted_at: "is.null" },
    limit: 1,
  });
  return normalize(rows[0]);
}

export async function createDispatch(payload, userEmail) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!payload?.customer_name?.trim()) throw new Error("Customer name is required");
  if (items.length === 0) throw new Error("At least one item is required");
  for (const [i, ln] of items.entries()) {
    if (!ln.description?.trim()) throw new Error(`Line ${i + 1}: description is required`);
    if (!(Number(ln.quantity) > 0)) throw new Error(`Line ${i + 1}: quantity must be > 0`);
  }

  const header = await dbInsert("sample_dispatches", {
    dispatch_date: payload.dispatch_date || new Date().toISOString().slice(0, 10),
    managed_by:    payload.managed_by || null,
    managed_by_user_id: payload.managed_by_user_id || null,
    customer_name: payload.customer_name.trim(),
    customer_contact:           payload.customer_contact || null,
    customer_billing_address:   payload.customer_billing_address || null,
    customer_delivery_address:  payload.customer_delivery_address || null,
    customer_gstin:             payload.customer_gstin || null,
    notes:        payload.notes || null,
    created_by:   userEmail || null,
  });

  const rows = items.map((ln, idx) => ({
    dispatch_id: header.id,
    sr_no:       idx + 1,
    order_id:    (ln.order_id || generateOrderId()).trim(),
    description: ln.description.trim(),
    quantity:    Number(ln.quantity),
    price:       Number(ln.price || 0),
    gst_pct:     Number(ln.gst_pct || 0),
    master_product_id: ln.master_product_id || null,
  }));
  await dbInsert("sample_dispatch_items", rows);
  return getDispatch(header.id);
}

export async function updateDispatchStatus(id, patch, userId) {
  const allowed = {};
  if (patch.status) {
    if (!SAMPLE_DISPATCH_STATUSES.includes(patch.status)) {
      throw new Error(`Invalid status: ${patch.status}`);
    }
    allowed.status = patch.status;
    if (patch.status === "dispatched") {
      allowed.dispatched_at = new Date().toISOString();
      if (userId) allowed.dispatched_by_user_id = userId;
    }
    if (patch.status === "pending") {
      allowed.dispatched_at = null;
      allowed.dispatched_by_user_id = null;
    }
  }
  if (patch.courier !== undefined) allowed.courier = patch.courier || null;
  if (patch.awb !== undefined)     allowed.awb = patch.awb || null;
  if (patch.notes !== undefined)   allowed.notes = patch.notes || null;
  if (Object.keys(allowed).length === 0) return getDispatch(id);
  await dbUpdate("sample_dispatches", "id", id, allowed);
  return getDispatch(id);
}

export async function softDeleteDispatch(id) {
  await dbUpdate("sample_dispatches", "id", id, {
    deleted_at: new Date().toISOString(),
  });
}

export function summarizeForDisplay(d) {
  return {
    line_count: d.items?.length || 0,
    total_qty: (d.items || []).reduce((s, ln) => s + Number(ln.quantity || 0), 0),
    total_excl_gst: d.total_excl_gst || 0,
    total_incl_gst: d.total_incl_gst || 0,
  };
}
