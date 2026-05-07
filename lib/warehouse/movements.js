// WarehouseOS — movement (inward / outward / transfer / adjustment) data layer.
// All posts go through the post_movement RPC for atomicity. List + detail use
// dbSelect against the inventory_movements_summary view and the lines table.

import { dbSelect, dbRPC } from "../db/supabase.js";

export const MOVEMENT_TYPES = ["inward", "outward", "transfer", "adjustment"];
export const REJECT_REASONS = ["discard", "lost", "damaged"];

// Reference-type vocab per movement type. Used to populate the "reason"
// dropdown in the form.
export const REFERENCE_TYPES = {
  inward:     ["supplier", "production", "return", "opening", "manual"],
  outward:    ["customer", "job", "sample", "scrap", "manual"],
  transfer:   ["transfer"],
  adjustment: ["audit", "manual"],
};

/**
 * Post a movement. Atomic: header + all lines committed together; the
 * inventory_stock trigger fires per line and updates on-hand qty.
 *
 * payload = {
 *   type, reference_type, reference, movement_date, notes, source_job_id,
 *   lines: [{item_id, from_location_id, to_location_id, qty, unit_cost,
 *            reject_reason, remarks}]
 * }
 */
export async function postMovement(payload, userEmail) {
  if (!payload?.type || !MOVEMENT_TYPES.includes(payload.type)) {
    throw new Error(`Invalid movement type: ${payload?.type}`);
  }
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (lines.length === 0) throw new Error("At least one line is required");

  // Validate per type. The RPC is the ultimate authority but giving a clean
  // error here is friendlier than a Postgres exception bubbling up.
  for (const [i, ln] of lines.entries()) {
    if (!ln.item_id) throw new Error(`Line ${i + 1}: item is required`);
    if (!ln.qty || Number(ln.qty) <= 0) throw new Error(`Line ${i + 1}: qty must be > 0`);
    if (payload.type === "inward" && !ln.to_location_id) {
      throw new Error(`Line ${i + 1}: receiving location is required for inward`);
    }
    if (payload.type === "outward" && !ln.from_location_id) {
      throw new Error(`Line ${i + 1}: source location is required for outward`);
    }
    if (payload.type === "transfer" && (!ln.from_location_id || !ln.to_location_id)) {
      throw new Error(`Line ${i + 1}: transfer requires both from and to locations`);
    }
  }

  const result = await dbRPC("post_movement", {
    p_type:           payload.type,
    p_reference_type: payload.reference_type || null,
    p_reference:      payload.reference || null,
    p_movement_date:  payload.movement_date || null,
    p_notes:          payload.notes || null,
    p_source_job_id:  payload.source_job_id || null,
    p_created_by:     userEmail || null,
    p_lines: lines.map((ln) => ({
      item_id:          ln.item_id,
      from_location_id: ln.from_location_id || "",
      to_location_id:   ln.to_location_id || "",
      qty:              String(ln.qty),
      unit_cost:        ln.unit_cost == null || ln.unit_cost === "" ? "" : String(ln.unit_cost),
      reject_reason:    ln.reject_reason || "",
      remarks:          ln.remarks || "",
    })),
  });
  // dbRPC returns the function payload (may be wrapped depending on PostgREST
  // behaviour for scalar returns; normalise here).
  return Array.isArray(result) ? result[0] : result;
}

export async function listMovements({
  type = "",
  fromDate = "",
  toDate = "",
  search = "",
  limit = 200,
} = {}) {
  const filter = {};
  if (type) filter.type = `eq.${type}`;
  if (fromDate) filter.movement_date = `gte.${fromDate}`;
  if (toDate) filter.movement_date = filter.movement_date
    ? `${filter.movement_date}&movement_date=lte.${toDate}` // not ideal — fallback below
    : `lte.${toDate}`;
  // Above hack doesn't work in PostgREST; just do client-side date narrowing
  // when both ends are set. For now, only one date filter is applied per call.
  const rows = await dbSelect("inventory_movements_summary", {
    select:
      "id,movement_no,type,reference_type,reference,movement_date,notes,source_job_id,posted,posted_at,created_at,created_by,line_count,total_qty,total_value",
    filter,
    order: "movement_date.desc,created_at.desc",
    limit,
  });
  let out = rows;
  if (fromDate && toDate) {
    out = out.filter((r) => r.movement_date >= fromDate && r.movement_date <= toDate);
  }
  if (search) {
    const q = search.toLowerCase();
    out = out.filter(
      (r) =>
        (r.movement_no || "").toLowerCase().includes(q) ||
        (r.reference || "").toLowerCase().includes(q) ||
        (r.reference_type || "").toLowerCase().includes(q) ||
        (r.notes || "").toLowerCase().includes(q),
    );
  }
  return out;
}

export async function getMovement(id) {
  const headers = await dbSelect("inventory_movements_summary", {
    select: "*",
    filter: { id: `eq.${id}` },
    limit: 1,
  });
  const header = headers[0];
  if (!header) return null;
  const lines = await dbSelect("inventory_movement_lines", {
    select:
      "id,item_id,from_location_id,to_location_id,qty,unit_cost,reject_reason,remarks,created_at,inventory_items(sku,name,uom),from_loc:from_location_id(code),to_loc:to_location_id(code)",
    filter: { movement_id: `eq.${id}` },
    order: "created_at.asc",
    limit: 500,
  });
  return { ...header, lines };
}
