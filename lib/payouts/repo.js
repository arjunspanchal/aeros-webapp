// Supabase-backed repo for the Payouts module — vendor payment tracker.
// Vendors come from the shared public.vendors directory (same list used by
// FactoryOS and the rest of the system) so adding a vendor here makes it
// available everywhere. Payout rows carry a vendor_name snapshot so the
// label survives even if the vendor record is later renamed or unlinked.

import { dbSelect, dbInsert, dbUpdate, dbDelete } from "@/lib/db/supabase";

const PAYOUT_SELECT =
  "id,vendor_id,vendor_name,amount,amount_paid,currency,due_date,status,note," +
  "paid_at,paid_by_email,created_by_email,created_at,updated_at," +
  "vendor:vendors(id,name,type,active)," +
  "payments:payout_payments(id,amount,paid_at,paid_by_email,note)";

function normPayout(row) {
  const amount = row.amount == null ? 0 : Number(row.amount);
  const amountPaid = row.amount_paid == null ? 0 : Number(row.amount_paid);
  const outstanding = Math.max(0, round2(amount - amountPaid));
  const payments = Array.isArray(row.payments)
    ? row.payments
        .map((p) => ({
          id: p.id,
          amount: Number(p.amount) || 0,
          paidAt: p.paid_at || null,
          paidByEmail: p.paid_by_email || "",
          note: p.note || "",
        }))
        .sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt)))
    : [];
  return {
    id: row.id,
    vendorId: row.vendor_id || null,
    vendorName: row.vendor_name || row.vendor?.name || "—",
    vendorType: row.vendor?.type || "",
    amount,
    amountPaid,
    outstanding,
    currency: row.currency || "INR",
    dueDate: row.due_date || null,
    status: row.status || "pending",
    note: row.note || "",
    paidAt: row.paid_at || null,
    paidByEmail: row.paid_by_email || "",
    createdByEmail: row.created_by_email || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    payments,
  };
}

// Money math in JS floats can drift (0.1+0.2); round to paise on every write.
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function statusFor(amount, amountPaid) {
  if (amountPaid <= 0) return "pending";
  if (amountPaid >= amount) return "paid";
  return "partial";
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
  // If the total amount moved, re-derive status against what's already been
  // paid (e.g. lowering the total below amount_paid flips it to fully paid).
  if (patch.amount !== undefined) {
    const cur = await getPayoutRow(id);
    const paidSoFar = cur ? Number(cur.amount_paid) || 0 : 0;
    patch.status = statusFor(patch.amount, paidSoFar);
    patch.paid_at = patch.status === "paid" ? (cur?.paid_at || new Date().toISOString()) : null;
  }
  const row = await dbUpdate("payouts", "id", id, patch);
  return row ? normPayout(row) : null;
}

async function getPayoutRow(id) {
  const rows = await dbSelect("payouts", {
    select: "id,amount,amount_paid,status,paid_at",
    filter: { id: `eq.${id}` },
    limit: 1,
  });
  return rows[0] || null;
}

// Record a payment (installment) against a payout. `amount` is what was just
// paid; it's capped at the outstanding balance so you can't overpay. Updates
// the running total + derived status, and returns the refreshed payout.
export async function recordPayment(id, { amount, email, note }) {
  const cur = await getPayoutRow(id);
  if (!cur) throw new Error("Payout not found");
  const total = Number(cur.amount) || 0;
  const already = Number(cur.amount_paid) || 0;
  const outstanding = round2(total - already);
  if (outstanding <= 0) throw new Error("This payout is already fully paid");
  let pay = round2(amount);
  if (!Number.isFinite(pay) || pay <= 0) throw new Error("Valid payment amount required");
  if (pay > outstanding) pay = outstanding; // cap — never overpay
  const newPaid = round2(already + pay);
  const status = statusFor(total, newPaid);

  await dbInsert("payout_payments", {
    payout_id: id,
    amount: pay,
    paid_by_email: email || null,
    note: note ? String(note).trim() : null,
  });
  await dbUpdate("payouts", "id", id, {
    amount_paid: newPaid,
    status,
    paid_at: status === "paid" ? new Date().toISOString() : null,
    paid_by_email: email || cur.paid_by_email || null,
  });
  return getPayout(id);
}

// Pay the full remaining balance in one shot (the "Mark paid" button).
export async function payInFull(id, { email }) {
  const cur = await getPayoutRow(id);
  if (!cur) throw new Error("Payout not found");
  const outstanding = round2((Number(cur.amount) || 0) - (Number(cur.amount_paid) || 0));
  if (outstanding <= 0) return getPayout(id); // already paid — no-op
  return recordPayment(id, { amount: outstanding, email, note: null });
}

// Undo all payments — wipe the ledger and reset to pending.
export async function resetPayments(id) {
  await dbDelete("payout_payments", "payout_id", id);
  await dbUpdate("payouts", "id", id, {
    amount_paid: 0,
    status: "pending",
    paid_at: null,
    paid_by_email: null,
  });
  return getPayout(id);
}

// Toggle full-paid / reset — kept for the existing { paid: bool } PATCH path.
export async function setPaid(id, { paid, email }) {
  return paid ? payInFull(id, { email }) : resetPayments(id);
}

async function getPayout(id) {
  const rows = await dbSelect("payouts", { select: PAYOUT_SELECT, filter: { id: `eq.${id}` }, limit: 1 });
  return rows[0] ? normPayout(rows[0]) : null;
}

export async function deletePayout(id) {
  await dbDelete("payouts", "id", id);
}
