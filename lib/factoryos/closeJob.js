// Close a job on the factory side and hand finished goods to the warehouse.
// v1 handover register (Arjun, 01-Oct-2026): the factory records the pcs it
// produced; the warehouse team sees a dump of everything handed over and
// marks it dispatched when it leaves. No ledger, no bin locations.

import { dbSelect, dbUpdate, findOne } from "@/lib/db/supabase";
import { num, int, str } from "@/lib/db/shapes";

async function jobPgId(jobPublicId) {
  const row = await findOne("jobs", jobPublicId, "id");
  return row?.id || null;
}

export async function closeJob(jobPublicId, { fgQty, fgCartons, note, email } = {}) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) throw new Error("Job not found");
  const qty = num(fgQty);
  if (!(qty > 0)) throw new Error("Enter the finished quantity handed to the warehouse");
  const cur = await findOne("jobs", pgId, "stage,closed_at");
  const patch = {
    closed_at: new Date().toISOString(),
    closed_by_email: str(email),
    fg_qty: qty,
    fg_cartons: int(fgCartons),
    close_note: str(note),
  };
  // Closing implies the goods are ready; don't pull a dispatched job back.
  if (!["Ready for Dispatch", "Dispatched", "Delivered"].includes(cur?.stage)) patch.stage = "Ready for Dispatch";
  await dbUpdate("jobs", "id", pgId, patch, { returning: "minimal" });
  return true;
}

export async function reopenJob(jobPublicId) {
  const pgId = await jobPgId(jobPublicId);
  if (!pgId) return false;
  await dbUpdate("jobs", "id", pgId, { closed_at: null, closed_by_email: null, fg_qty: null, fg_cartons: null, close_note: null }, { returning: "minimal" });
  return true;
}

// Everything the factory has handed over, newest first. `awaiting` = not yet
// dispatched by the warehouse.
export async function listFactoryFg({ awaitingOnly = false } = {}) {
  const filter = { closed_at: "not.is.null" };
  if (awaitingOnly) filter.stage = "not.in.(\"Dispatched\",\"Delivered\")";
  const rows = await dbSelect("jobs", {
    select: "id,airtable_id,j_number,item,brand,master_sku,qty,fg_qty,fg_cartons,close_note,closed_at,closed_by_email,stage,expected_dispatch_date,clients(name)",
    filter,
    order: "closed_at.desc",
    range: "0-9999",
  });
  return rows.map((r) => ({
    id: r.airtable_id || r.id,
    jNumber: r.j_number,
    item: r.item,
    brand: r.brand || "",
    masterSku: r.master_sku || "",
    customer: r.clients?.name || "",
    orderedQty: r.qty == null ? null : Number(r.qty),
    fgQty: r.fg_qty == null ? null : Number(r.fg_qty),
    fgCartons: r.fg_cartons,
    note: r.close_note || "",
    closedAt: r.closed_at,
    closedBy: r.closed_by_email || "",
    stage: r.stage,
    expectedDispatchDate: r.expected_dispatch_date,
  }));
}
