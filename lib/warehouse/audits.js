// WarehouseOS — stock audits (cycle counts) data layer.
// All writes go through Postgres RPCs for atomicity.

import { dbSelect, dbUpdate, dbRPC } from "../db/supabase.js";

export const AUDIT_SCOPES = ["full", "category", "location", "item-list"];
export const AUDIT_STATUSES = ["counting", "review", "posted", "cancelled"];

export async function listAudits({ status = "" } = {}) {
  const filter = {};
  if (status) filter.status = `eq.${status}`;
  return dbSelect("inventory_audits_summary", {
    select:
      "id,audit_no,scope,scope_filter,status,scheduled_date,freeze_movements,audit_manager_email,notes,posted_at,posted_by,created_at,created_by,total_lines,counted_lines,variance_lines,abs_variance",
    filter,
    order: "scheduled_date.desc,created_at.desc",
    limit: 500,
  });
}

export async function getAudit(id) {
  const headers = await dbSelect("inventory_audits_summary", {
    select: "*",
    filter: { id: `eq.${id}` },
    limit: 1,
  });
  const header = headers[0];
  if (!header) return null;
  const lines = await dbSelect("inventory_audit_lines", {
    select:
      "id,item_id,location_id,system_qty,counted_qty,variance,counted_by,counted_at,remarks,inventory_items(sku,name,uom,category,brand_customer),inventory_locations(code,name)",
    filter: { audit_id: `eq.${id}` },
    order: "inventory_items(sku).asc",
    limit: 5000,
  });
  return { ...header, lines };
}

export async function createAudit(payload, userEmail) {
  if (!AUDIT_SCOPES.includes(payload.scope)) throw new Error(`Invalid scope: ${payload.scope}`);
  const result = await dbRPC("create_audit", {
    p_scope:               payload.scope,
    p_scope_filter:        payload.scope_filter || {},
    p_scheduled_date:      payload.scheduled_date || null,
    p_freeze_movements:    payload.freeze_movements !== false,
    p_audit_manager_email: payload.audit_manager_email || userEmail,
    p_notes:               payload.notes || null,
    p_created_by:          userEmail || null,
  });
  return Array.isArray(result) ? result[0] : result;
}

// Update one audit_line with a counted_qty + remarks.
export async function recordCount(lineId, { counted_qty, remarks }, userEmail) {
  if (counted_qty === "" || counted_qty == null) {
    // Clearing the count = setting back to NULL. variance is computed, will become NULL.
    return dbUpdate("inventory_audit_lines", "id", lineId, {
      counted_qty: null,
      counted_by: null,
      counted_at: null,
      remarks: remarks ?? null,
    });
  }
  const n = Number(counted_qty);
  if (!Number.isFinite(n) || n < 0) throw new Error("Counted qty must be ≥ 0");
  return dbUpdate("inventory_audit_lines", "id", lineId, {
    counted_qty: n,
    counted_by: userEmail || null,
    counted_at: new Date().toISOString(),
    remarks: remarks ?? null,
  });
}

// Add an ad-hoc line (counter found stock not in the snapshot).
export async function addLine(auditId, itemId, locationId) {
  const result = await dbRPC("add_audit_line", {
    p_audit_id:    auditId,
    p_item_id:     itemId,
    p_location_id: locationId,
  });
  return Array.isArray(result) ? result[0] : result;
}

export async function setStatus(id, status, userEmail) {
  if (!AUDIT_STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
  if (status === "posted") {
    throw new Error("Use postAudit() to transition to posted — that runs the adjustment movement");
  }
  return dbUpdate("inventory_audits", "id", id, {
    status,
    ...(status === "cancelled" ? { posted_by: userEmail || null, posted_at: new Date().toISOString() } : {}),
  });
}

export async function postAudit(id, userEmail) {
  const result = await dbRPC("post_audit", {
    p_audit_id:  id,
    p_posted_by: userEmail || null,
  });
  return Array.isArray(result) ? result[0] : result;
}
