// WarehouseOS — Vehicle Dispatch (outbound freight) data layer.
// The invoice team logs each outbound vehicle: invoice + e-way bill, the
// customer (from the clients master), the transporter (a shared-directory
// vendor of type 'Transport'), vehicle size, box count, gross weight, the
// lane, and the lump-sum freight quote. ₹/box and ₹/kg are derived here so
// they can never drift from the stored freight on an edit.
//
// Reads/writes go through Supabase REST via lib/db/supabase.js.

import { dbSelect, dbInsert, dbUpdate } from "../db/supabase.js";
import { ROLES } from "../factoryos/constants.js";

// Account Managers raise the dispatch; warehouse staff (FE/FM/Admin) also
// work it. Same internal set as Sample Dispatch — customers are excluded.
export function canManageVehicleDispatch(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const role = session.modules?.factoryos;
  return (
    role === ROLES.ACCOUNT_MANAGER ||
    role === ROLES.FACTORY_MANAGER ||
    role === ROLES.FACTORY_EXECUTIVE
  );
}

// Vendor directory `type` used to flag a transporter. Kept as a constant so
// the picker filter and the inline "add transporter" insert agree.
export const TRANSPORT_VENDOR_TYPE = "Transport";

// Status workflow. The team moves a vehicle pending → dispatched → delivered;
// cancelled is an off-ramp. Timestamps for dispatched/delivered are stamped
// by updateVehicleDispatchStatus, not entered by hand.
export const VEHICLE_DISPATCH_STATUSES = ["pending", "dispatched", "delivered", "cancelled"];

// Seeded vehicle-size list — a fixed dropdown for clean reporting. Editable:
// add/trim entries here as the fleet changes (no migration needed).
export const VEHICLE_SIZES = [
  "Tata 407",
  "14 ft",
  "17 ft",
  "19 ft",
  "20 ft",
  "22 ft",
  "24 ft",
  "32 ft SXL",
  "32 ft MXL",
  "20 ft Container",
  "40 ft Container",
];

const SELECT =
  "id,dispatch_no,dispatch_date,invoice_no,eway_bill_no,client_id,customer_name," +
  "vehicle_size,vehicle_number,transporter_vendor_id,transporter_name," +
  "driver_name,driver_phone,status,dispatched_at,delivered_at," +
  "box_count,total_weight_kg,from_city,to_city,approx_kms,freight_lumpsum_inr," +
  "notes,created_at,updated_at,created_by";

// Attach the two derived freight metrics. Guarded against divide-by-zero so
// a record saved before boxes/weight are known just shows null (→ "—" in UI).
function normalize(row) {
  if (!row) return null;
  const freight = row.freight_lumpsum_inr != null ? Number(row.freight_lumpsum_inr) : null;
  const boxes = Number(row.box_count) || 0;
  const kg = Number(row.total_weight_kg) || 0;
  return {
    ...row,
    box_count: row.box_count != null ? Number(row.box_count) : null,
    total_weight_kg: row.total_weight_kg != null ? Number(row.total_weight_kg) : null,
    approx_kms: row.approx_kms != null ? Number(row.approx_kms) : null,
    freight_lumpsum_inr: freight,
    inr_per_box: freight != null && boxes > 0 ? +(freight / boxes).toFixed(2) : null,
    inr_per_kg:  freight != null && kg > 0    ? +(freight / kg).toFixed(2)    : null,
  };
}

export async function listVehicleDispatches({ limit = 500 } = {}) {
  const rows = await dbSelect("vehicle_dispatches", {
    select: SELECT,
    filter: { deleted_at: "is.null" },
    order: "dispatch_date.desc,created_at.desc",
    limit,
  });
  return rows.map(normalize);
}

export async function getVehicleDispatch(id) {
  const rows = await dbSelect("vehicle_dispatches", {
    select: SELECT,
    filter: { id: `eq.${id}`, deleted_at: "is.null" },
    limit: 1,
  });
  return normalize(rows[0]);
}

// Clamp/parse a value that may be "" from a form field into a number-or-null.
function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildPayload(payload) {
  return {
    dispatch_date: payload.dispatch_date || new Date().toISOString().slice(0, 10),
    invoice_no:    payload.invoice_no?.trim() || null,
    eway_bill_no:  payload.eway_bill_no?.trim() || null,
    client_id:     payload.client_id || null,
    customer_name: payload.customer_name.trim(),
    vehicle_size:  payload.vehicle_size?.trim() || null,
    vehicle_number: payload.vehicle_number?.trim() || null,
    transporter_vendor_id: payload.transporter_vendor_id || null,
    transporter_name:      payload.transporter_name?.trim() || null,
    driver_name:      payload.driver_name?.trim() || null,
    driver_phone:     payload.driver_phone?.trim() || null,
    box_count:        numOrNull(payload.box_count),
    total_weight_kg:  numOrNull(payload.total_weight_kg),
    from_city:        payload.from_city?.trim() || null,
    to_city:          payload.to_city?.trim() || null,
    approx_kms:       numOrNull(payload.approx_kms),
    freight_lumpsum_inr: numOrNull(payload.freight_lumpsum_inr),
    notes:            payload.notes?.trim() || null,
  };
}

function validate(payload) {
  if (!payload?.customer_name?.trim()) throw new Error("Customer name is required");
  const boxes = numOrNull(payload.box_count);
  if (boxes != null && boxes < 0) throw new Error("Box count cannot be negative");
  const kg = numOrNull(payload.total_weight_kg);
  if (kg != null && kg < 0) throw new Error("Weight cannot be negative");
  const freight = numOrNull(payload.freight_lumpsum_inr);
  if (freight != null && freight < 0) throw new Error("Freight cannot be negative");
}

export async function createVehicleDispatch(payload, userEmail) {
  validate(payload);
  const row = await dbInsert("vehicle_dispatches", {
    ...buildPayload(payload),
    created_by: userEmail || null,
  });
  return getVehicleDispatch(row.id);
}

export async function updateVehicleDispatch(id, payload) {
  validate(payload);
  await dbUpdate("vehicle_dispatches", "id", id, buildPayload(payload));
  return getVehicleDispatch(id);
}

// Light status flip from the detail page buttons — kept separate from the
// full edit so a one-tap "Mark delivered" doesn't have to round-trip the
// whole form. Stamps dispatched_at / delivered_at on the way up and clears
// them on the way back down so the timestamps always match the status.
export async function updateVehicleDispatchStatus(id, status) {
  if (!VEHICLE_DISPATCH_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const cur = await getVehicleDispatch(id);
  if (!cur) throw new Error("Not found");

  const now = new Date().toISOString();
  const patch = { status };
  if (status === "dispatched") {
    patch.dispatched_at = cur.dispatched_at || now;
    patch.delivered_at = null;
  } else if (status === "delivered") {
    // Delivering directly from pending still records a dispatch time so the
    // transit window isn't left blank.
    patch.dispatched_at = cur.dispatched_at || now;
    patch.delivered_at = cur.delivered_at || now;
  } else if (status === "pending") {
    patch.dispatched_at = null;
    patch.delivered_at = null;
  }
  // 'cancelled' leaves any existing timestamps untouched.

  await dbUpdate("vehicle_dispatches", "id", id, patch);
  return getVehicleDispatch(id);
}

export async function softDeleteVehicleDispatch(id) {
  await dbUpdate("vehicle_dispatches", "id", id, {
    deleted_at: new Date().toISOString(),
  });
}

// ---------- Pickers ----------

// Customers for the "pull customer" dropdown — the clients master, active
// (non-deleted) only, name-sorted.
export async function listDispatchClients() {
  const rows = await dbSelect("clients", {
    select: "id,name,code",
    filter: { deleted_at: "is.null" },
    order: "name.asc",
    range: "0-999",
  });
  return rows.map((r) => ({ id: r.id, name: r.name || "", code: r.code || "" }));
}

// Transporters = vendors flagged type 'Transport'. We don't hard-filter on
// active here so a temporarily-inactive transporter still resolves on an
// existing record; the picker can show all of them.
export async function listTransporters() {
  const rows = await dbSelect("vendors", {
    select: "id,name,type,active",
    filter: { type: `eq.${TRANSPORT_VENDOR_TYPE}` },
    order: "name.asc",
    range: "0-999",
  });
  return rows
    .filter((r) => r.active !== false)
    .map((r) => ({ id: r.id, name: r.name || "" }));
}

// Add a transporter to the shared vendor directory (type 'Transport'),
// de-duped case-insensitively against an existing name so the list doesn't
// accumulate near-duplicates. Mirrors lib/payouts/repo.js createPayoutVendor.
export async function createTransporter({ name }) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Transporter name required");
  const existing = await dbSelect("vendors", {
    select: "id,name,type,active",
    filter: { name: `ilike.${clean}` },
    limit: 1,
  });
  if (existing[0]) {
    const v = existing[0];
    return { id: v.id, name: v.name || clean };
  }
  const row = await dbInsert("vendors", {
    name: clean,
    type: TRANSPORT_VENDOR_TYPE,
    active: true,
  });
  return { id: row.id, name: row.name || clean };
}
