// Supabase-backed repo for the Payouts module — vendor payment tracker.
// Vendors come from the shared public.vendors directory (same list used by
// FactoryOS and the rest of the system) so adding a vendor here makes it
// available everywhere. Payout rows carry a vendor_name snapshot so the
// label survives even if the vendor record is later renamed or unlinked.

import { dbSelect, dbInsert, dbUpdate, dbDelete } from "@/lib/db/supabase";

const PAYOUT_SELECT =
  "id,vendor_id,vendor_name,amount,currency,due_date,status,note," +
  "paid_at,paid_by_email,created_by_email,created_at,updated_at," +
  "vendor:vendors(id,name,type,active)";

function normPayout(row) {
  return {
    id: row.id,
    vendorId: row.vendor_id || null,
    vendorName: row.vendor_name || row.vendor?.name || "—",
    vendorType: row.vendor?.type || "",
    amount: row.amount == null ? 0 : Number(row.amount),
    currency: row.currency || "INR",
    dueDate: row.due_date || null,
    status: row.status || "pending",
    note: row.note || "",
    paidAt: row.paid_at || null,
    paidByEmail: row.paid_by_email || "",
    createdByEmail: row.created_by_email || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

// Active vendors for the payout dropdown. Same shared directory as FactoryOS.
export async function listPayoutVendors() {
  const rows = await dbSelect("vendors", {
    select: "id,name,type,active",
    order: "name.asc",
    range: "0-999",
  });
  return rows
    .filter((r) => r.active !== false)
    .map((r) => ({ id: r.id, name: r.name || "", type: r.type || "" }));
}

// Add a vendor to the shared directory (keeps the list common across apps).
export async function createPayoutVendor({ name, type }) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Vendor name required");
  // De-dupe against an existing (case-insensitive) name so the shared list
  // doesn't accumulate "Blueline" / "blueline" duplicates.
  const existing = await dbSelect("vendors", {
    select: "id,name,type,active",
    filter: { name: `ilike.${clean}` },
    limit: 1,
  });
  if (existing[0]) {
    const v = existing[0];
    return { id: v.id, name: v.name || clean, type: v.type || "" };
  }
  const row = await dbInsert("vendors", {
    name: clean,
    type: type ? String(type).trim() : null,
    active: true,
  });
  return { id: row.id, name: row.name || clean, type: row.type || "" };
}

// List payouts, optionally bounded by due-date window and/or status.
export async function listPayouts({ from, to, status } = {}) {
  const filter = {};
  if (from) filter["due_date"] = `gte.${from}`;
  // PostgREST: a second predicate on the same column needs the `and` form.
  if (from && to) {
    filter["and"] = `(due_date.gte.${from},due_date.lte.${to})`;
    delete filter["due_date"];
  } else if (to) {
    filter["due_date"] = `lte.${to}`;
  }
  if (status) filter["status"] = `eq.${status}`;
  const rows = await dbSelect("payouts", {
    select: PAYOUT_SELECT,
    filter,
    order: "due_date.asc",
    range: "0-4999",
  });
  return rows.map(normPayout);
}

export async function createPayout({ vendorId, vendorName, amount, currency, dueDate, note, createdByEmail }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Valid amount required");
  if (!dueDate) throw new Error("Due date required");
  let name = String(vendorName || "").trim();
  // If a vendor was picked but no label passed, snapshot the name from the row.
  if (!name && vendorId) {
    const v = await dbSelect("vendors", { select: "name", filter: { id: `eq.${vendorId}` }, limit: 1 });
    name = v[0]?.name || "";
  }
  if (!name) throw new Error("Vendor required");
  const row = await dbInsert("payouts", {
    vendor_id: vendorId || null,
    vendor_name: name,
    amount: amt,
    currency: currency || "INR",
    due_date: dueDate,
    status: "pending",
    note: note ? String(note).trim() : null,
    created_by_email: createdByEmail || null,
  });
  return normPayout({ ...row, vendor: null });
}

// Editable fields on an existing payout (excludes status — see setPaid).
export async function updatePayout(id, { vendorId, vendorName, amount, dueDate, note }) {
  const patch = {};
  if (vendorId !== undefined) patch.vendor_id = vendorId || null;
  if (vendorName !== undefined) patch.vendor_name = String(vendorName || "").trim() || null;
  if (amount !== undefined) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) throw new Error("Valid amount required");
    patch.amount = amt;
  }
  if (dueDate !== undefined) {
    if (!dueDate) throw new Error("Due date required");
    patch.due_date = dueDate;
  }
  if (note !== undefined) patch.note = note ? String(note).trim() : null;
  if (!Object.keys(patch).length) throw new Error("Nothing to update");
  const row = await dbUpdate("payouts", "id", id, patch);
  return row ? normPayout(row) : null;
}

// Toggle paid / pending. Stamps who marked it and when on the paid edge;
// clears those when re-opened to pending.
export async function setPaid(id, { paid, email }) {
  const patch = paid
    ? { status: "paid", paid_at: new Date().toISOString(), paid_by_email: email || null }
    : { status: "pending", paid_at: null, paid_by_email: null };
  const row = await dbUpdate("payouts", "id", id, patch);
  return row ? normPayout(row) : null;
}

export async function deletePayout(id) {
  await dbDelete("payouts", "id", id);
}
