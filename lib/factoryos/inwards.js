// Inward receipts on a job — printed stock (or finished goods) arriving back
// from the printing vendor. One row per delivery; partial deliveries add up
// against the job's ordered quantity.

import { dbSelect, dbInsert, dbDelete, findOne } from "@/lib/db/supabase";
import { num, str, dateOnly } from "@/lib/db/shapes";

export const INWARD_UNITS = ["pcs", "sheets", "kg"];

async function jobPgId(jobPublicId) {
  const row = await findOne("jobs", jobPublicId, "id");
  return row?.id || null;
}

function norm(r) {
  return {
    id: r.id,
    receivedOn: r.received_on,
    qty: Number(r.qty) || 0,
    unit: r.unit || "pcs",
    damagedQty: Number(r.damaged_qty) || 0,
    fromVendor: r.from_vendor || "",
    challanNo: r.challan_no || "",
    notes: r.notes || "",
    receivedByEmail: r.received_by_email || null,
    createdAt: r.created_at,
  };
}

export async function listJobInwards(jobPublicId) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return [];
  const rows = await dbSelect("job_inwards", {
    select: "*", filter: { job_id: `eq.${pgId}` }, order: "received_on.desc,created_at.desc",
  });
  return rows.map(norm);
}

export async function addJobInward(jobPublicId, body, { email, vendor } = {}) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) throw new Error("Job not found");
  const qty = num(body?.qty);
  if (!(qty >= 0)) throw new Error("Quantity received is required");
  const unit = INWARD_UNITS.includes(body?.unit) ? body.unit : "pcs";
  const damaged = Math.max(0, num(body?.damagedQty) || 0);
  const row = await dbInsert("job_inwards", {
    job_id: pgId,
    received_on: dateOnly(body?.receivedOn) || new Date().toISOString().slice(0, 10),
    qty,
    unit,
    damaged_qty: damaged,
    from_vendor: str(body?.fromVendor) || str(vendor),
    challan_no: str(body?.challanNo),
    notes: str(body?.notes),
    received_by_email: str(email),
  });
  return norm(row);
}

export async function deleteJobInward(jobPublicId, inwardId) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return false;
  // Scope the delete to this job so an id from another job can't be removed.
  const rows = await dbSelect("job_inwards", { select: "id", filter: { id: `eq.${inwardId}`, job_id: `eq.${pgId}` }, limit: 1 });
  if (!rows[0]) return false;
  await dbDelete("job_inwards", "id", inwardId);
  return true;
}

// Received vs ordered, in the dominant unit. Good = received − damaged.
export function inwardTotals(inwards = [], orderedQty = null) {
  const byUnit = {};
  for (const i of inwards) {
    const u = (byUnit[i.unit] ||= { received: 0, damaged: 0 });
    u.received += i.qty;
    u.damaged += i.damagedQty;
  }
  const units = Object.keys(byUnit);
  const unit = units.includes("pcs") ? "pcs" : units[0] || "pcs";
  const t = byUnit[unit] || { received: 0, damaged: 0 };
  const good = t.received - t.damaged;
  const ordered = Number(orderedQty);
  return {
    unit, received: t.received, damaged: t.damaged, good,
    ordered: Number.isFinite(ordered) ? ordered : null,
    short: Number.isFinite(ordered) && unit === "pcs" ? Math.max(0, ordered - good) : null,
    mixedUnits: units.length > 1,
  };
}
