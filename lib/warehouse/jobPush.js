// FactoryOS → WarehouseOS push helpers.
// pushJobToWarehouse() wraps the Postgres RPC; getJobPushStatus() reads the
// running totals so the JobEditor can show "pushed N of M" in real time.

import { dbSelect, dbRPC } from "../db/supabase.js";

export async function pushJobToWarehouse({
  jobId,
  goodQty,
  rejectQty,
  rejectReason,
  unitCost,
  goodLocationCode,
  finalPush,
}, userEmail) {
  if (!jobId) throw new Error("Job id is required");
  const result = await dbRPC("push_job_to_warehouse", {
    p_job_id:             jobId,
    p_good_qty:           Number(goodQty || 0),
    p_reject_qty:         Number(rejectQty || 0),
    p_reject_reason:      rejectReason || null,
    p_unit_cost:          unitCost === "" || unitCost == null ? null : Number(unitCost),
    p_good_location_code: goodLocationCode || null,
    p_final_push:         !!finalPush,
    p_created_by:         userEmail || null,
  });
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Returns:
 *   { pushed_total, push_count, last_push_at, movements: [{movement_no, movement_date, good_qty, reject_qty}] }
 * for one job.
 */
export async function getJobPushStatus(jobId) {
  const movements = await dbSelect("inventory_movements", {
    select:
      "id,movement_no,movement_date,posted_at,inventory_movement_lines(qty,reject_reason,inventory_locations:to_location_id(code))",
    filter: {
      source_job_id:  `eq.${jobId}`,
      type:           `eq.inward`,
      reference_type: `eq.production`,
    },
    order: "movement_date.desc,posted_at.desc",
    limit: 100,
  });
  let pushedTotal = 0;
  const summary = movements.map((m) => {
    let good = 0, reject = 0;
    for (const ln of m.inventory_movement_lines || []) {
      const qty = Number(ln.qty || 0);
      if (ln.reject_reason) reject += qty;
      else good += qty;
    }
    pushedTotal += good + reject;
    return {
      movement_id:   m.id,
      movement_no:   m.movement_no,
      movement_date: m.movement_date,
      posted_at:     m.posted_at,
      good_qty:      good,
      reject_qty:    reject,
    };
  });
  return {
    pushed_total: pushedTotal,
    push_count:   summary.length,
    last_push_at: summary[0]?.posted_at || null,
    movements:    summary,
  };
}
