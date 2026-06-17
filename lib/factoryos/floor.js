// Shop-floor production capture — data layer.
//
// Two concerns live here:
//   1. RM rolls (rm_rolls) — serial-numbered rolls that get registered when
//      stock is received, then picked + consumed during a production run.
//   2. Production runs (production_runs) — the operator's machine session:
//      start → pause/resume → finish, capturing machine, RM roll, SKU,
//      speed, photo, and on finish the good/waste pcs + kg consumed.
//
// New columns (added in migration rm_rolls_and_production_run_capture) are
// read/written via direct Supabase calls rather than the Airtable shim —
// the shim's production_runs shape predates these fields, and the warehouse
// module already establishes the direct-dbSelect pattern for newer tables.

import { dbSelect, dbInsert, dbUpdate, findOne } from "../db/supabase.js";

// Machine line categories the operator picks from. Kept here so the page,
// the API validation, and any reporting share one list.
export const MACHINE_CATEGORIES = [
  { key: "paper_bag",  label: "Paper Bag"  },
  { key: "food_box",   label: "Food Box"   },
  { key: "paper_tub",  label: "Paper Tub"  },
  { key: "paper_cup",  label: "Paper Cup"  },
];
const CATEGORY_KEYS = new Set(MACHINE_CATEGORIES.map((c) => c.key));

export function isMachineCategory(v) {
  return CATEGORY_KEYS.has(v);
}

// ---------------------------------------------------------------------------
// RM rolls
// ---------------------------------------------------------------------------

function normRoll(row) {
  if (!row) return null;
  const rm = row.raw_materials || null;
  return {
    id: row.id,
    serial: row.serial || "",
    rawMaterialId: row.raw_material_id || null,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : 0,
    remainingKg: row.remaining_kg != null ? Number(row.remaining_kg) : 0,
    status: row.status || "in_stock",
    location: row.location || "",
    photoPath: row.photo_path || null,
    notes: row.notes || "",
    receivedAt: row.received_at || null,
    // Denormalised paper-line label for the operator's roll picker.
    paperName: rm?.name || rm?.master_rm_name || "",
    paperType: rm?.paper_type || "",
    gsm: rm?.gsm != null ? Number(rm.gsm) : null,
    supplier: rm?.supplier || rm?.mill || "",
  };
}

const ROLL_SELECT =
  "id,serial,raw_material_id,weight_kg,remaining_kg,status,location,photo_path,notes,received_at," +
  "raw_materials(name,master_rm_name,paper_type,gsm,supplier,mill)";

// Rolls available to start a run — in stock (or already in use, so a paused
// run's roll still resolves) with weight left.
export async function listRollsInStock() {
  const rows = await dbSelect("rm_rolls", {
    select: ROLL_SELECT,
    filter: { status: "in.(in_stock,in_use)" },
    order: "received_at.desc",
    range: "0-999",
  });
  return rows.map(normRoll).filter((r) => r.remainingKg > 0 || r.status === "in_use");
}

export async function listAllRolls() {
  const rows = await dbSelect("rm_rolls", {
    select: ROLL_SELECT,
    order: "received_at.desc",
    range: "0-1999",
  });
  return rows.map(normRoll);
}

export async function getRoll(id) {
  const rows = await dbSelect("rm_rolls", { select: ROLL_SELECT, filter: { id: `eq.${id}` }, limit: 1 });
  return normRoll(rows[0]);
}

// Build the next auto serial for a stock line that has no real serials, e.g.
// "JOD-BK120-0007". Prefix derived from supplier + paper + gsm; sequence is
// the count of existing rolls on that line + 1. Best-effort uniqueness —
// the DB unique index on lower(serial) is the real guard (caller retries).
function autoSerialPrefix(rm) {
  const part = (s, n) => String(s || "").replace(/[^A-Za-z0-9]/g, "").slice(0, n).toUpperCase();
  const sup = part(rm?.supplier || rm?.mill, 3) || "RM";
  const typ = part(rm?.paper_type, 2);
  const gsm = rm?.gsm != null ? String(rm.gsm) : "";
  return [sup, `${typ}${gsm}`].filter(Boolean).join("-");
}

export async function nextAutoSerial(rawMaterialId) {
  const rmRow = rawMaterialId ? await findOne("raw_materials", rawMaterialId, "name,master_rm_name,paper_type,gsm,supplier,mill") : null;
  const prefix = autoSerialPrefix(rmRow);
  const existing = await dbSelect("rm_rolls", {
    select: "id",
    filter: rawMaterialId ? { raw_material_id: `eq.${rawMaterialId}` } : {},
    range: "0-9999",
  });
  const seq = String(existing.length + 1).padStart(4, "0");
  return `${prefix}-${seq}`;
}

// Register one roll. If serial is blank, auto-generate from the stock line.
export async function registerRoll({ rawMaterialId, serial, weightKg, location, notes }) {
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0) throw new Error("Roll weight (kg) must be a positive number");
  let finalSerial = String(serial || "").trim();
  if (!finalSerial) finalSerial = await nextAutoSerial(rawMaterialId);
  const row = await dbInsert("rm_rolls", {
    serial: finalSerial,
    raw_material_id: rawMaterialId || null,
    weight_kg: w,
    remaining_kg: w,
    status: "in_stock",
    location: location || null,
    notes: notes || null,
  });
  return normRoll(Array.isArray(row) ? row[0] : row);
}

// Bulk register — array of { rawMaterialId, serial?, weightKg, location?, notes? }.
// Serials are resolved sequentially so auto-numbering doesn't collide.
export async function bulkRegisterRolls(rolls) {
  const out = [];
  for (const r of rolls) {
    out.push(await registerRoll(r));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Production runs
// ---------------------------------------------------------------------------

function generateRunId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `PR-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function normRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id || "",
    machineCategory: row.machine_category || null,
    status: row.status || "planned",
    startTime: row.start_time || null,
    endTime: row.end_time || null,
    operatorName: row.operator_name || "",
    rmRollId: row.rm_roll_id || null,
    skuId: row.sku_id || null,
    skuSnapshot: row.sku_snapshot || "",
    machineSpeed: row.machine_speed != null ? Number(row.machine_speed) : null,
    speedUnit: row.speed_unit || "",
    photoPath: row.photo_path || null,
    pausedMs: row.paused_ms != null ? Number(row.paused_ms) : 0,
    pauseLog: Array.isArray(row.pause_log) ? row.pause_log : [],
    outputPcs: row.output_pcs != null ? Number(row.output_pcs) : null,
    wastePcs: row.waste_pcs != null ? Number(row.waste_pcs) : null,
    consumedKg: row.consumed_kg != null ? Number(row.consumed_kg) : null,
    notes: row.notes || "",
    createdAt: row.created_at || null,
  };
}

const RUN_SELECT =
  "id,run_id,machine_category,status,start_time,end_time,operator_name,rm_roll_id,sku_id," +
  "sku_snapshot,machine_speed,speed_unit,photo_path,paused_ms,pause_log,output_pcs,waste_pcs," +
  "consumed_kg,notes,created_at";

export async function getRunById(id) {
  const rows = await dbSelect("production_runs", { select: RUN_SELECT, filter: { id: `eq.${id}` }, limit: 1 });
  return normRun(rows[0]);
}

// SKUs recently run on a given line — quick-pick chips for the operator.
export async function recentSkusForCategory(category, limit = 6) {
  if (!isMachineCategory(category)) return [];
  const rows = await dbSelect("production_runs", {
    select: "sku_id,sku_snapshot,created_at",
    filter: { machine_category: `eq.${category}` },
    order: "created_at.desc",
    range: "0-99",
  });
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r.sku_id || seen.has(r.sku_id)) continue;
    seen.add(r.sku_id);
    out.push({ skuId: r.sku_id, skuSnapshot: r.sku_snapshot || "" });
    if (out.length >= limit) break;
  }
  return out;
}

// Start a run. Records everything the operator entered + a server timestamp,
// and flips the chosen roll to in_use so it can't be double-picked.
export async function startRun({
  machineCategory, operatorName, rmRollId, skuId, skuSnapshot,
  machineSpeed, speedUnit, photoPath,
}) {
  if (!isMachineCategory(machineCategory)) throw new Error("Pick a machine line");
  if (!operatorName) throw new Error("Pick the operator");
  if (!rmRollId) throw new Error("Pick the RM roll");
  if (!skuId) throw new Error("Pick the SKU being made");

  const roll = await getRoll(rmRollId);
  if (!roll) throw new Error("Roll not found");
  if (roll.status === "consumed" || roll.remainingKg <= 0) throw new Error("That roll is already fully consumed");

  const now = new Date().toISOString();
  const inserted = await dbInsert("production_runs", {
    run_id: generateRunId(),
    machine_category: machineCategory,
    status: "running",
    start_time: now,
    operator_name: operatorName,
    rm_roll_id: rmRollId,
    sku_id: skuId,
    sku_snapshot: skuSnapshot || "",
    machine_speed: Number.isFinite(Number(machineSpeed)) ? Number(machineSpeed) : null,
    speed_unit: speedUnit || "pcs/min",
    photo_path: photoPath || null,
    paused_ms: 0,
    pause_log: [],
  });
  await dbUpdate("rm_rolls", "id", rmRollId, { status: "in_use", updated_at: now }, { returning: "minimal" });
  return normRun(Array.isArray(inserted) ? inserted[0] : inserted);
}

export async function pauseRun(runId) {
  const run = await getRunById(runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "running") throw new Error("Run is not running");
  const now = new Date().toISOString();
  const log = [...run.pauseLog, { pausedAt: now, resumedAt: null }];
  const updated = await dbUpdate("production_runs", "id", runId,
    { status: "paused", pause_log: log, updated_at: now });
  return normRun(updated);
}

export async function resumeRun(runId) {
  const run = await getRunById(runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "paused") throw new Error("Run is not paused");
  const now = Date.now();
  const log = run.pauseLog.slice();
  const open = log[log.length - 1];
  let addMs = 0;
  if (open && !open.resumedAt) {
    open.resumedAt = new Date(now).toISOString();
    addMs = Math.max(0, now - new Date(open.pausedAt).getTime());
  }
  const updated = await dbUpdate("production_runs", "id", runId, {
    status: "running",
    pause_log: log,
    paused_ms: (run.pausedMs || 0) + addMs,
    updated_at: new Date(now).toISOString(),
  });
  return normRun(updated);
}

// Finish a run: capture good/waste pcs + kg consumed, then draw the consumed
// kg down from the roll (and its parent RM stock line). Roll → consumed when
// it hits zero. Closes any still-open pause interval first.
export async function finishRun({ runId, goodPcs, wastePcs, consumedKg }) {
  const run = await getRunById(runId);
  if (!run) throw new Error("Run not found");
  if (run.status === "finished") throw new Error("Run already finished");

  const good = Number(goodPcs);
  const waste = Number(wastePcs);
  const consumed = Number(consumedKg);
  if (!Number.isFinite(good) || good < 0) throw new Error("Good pieces must be 0 or more");
  if (!Number.isFinite(consumed) || consumed < 0) throw new Error("Consumed kg must be 0 or more");

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Close an open pause interval so paused_ms is accurate even if they hit
  // Finish from the paused screen.
  let pausedMs = run.pausedMs || 0;
  const log = run.pauseLog.slice();
  const open = log[log.length - 1];
  if (open && !open.resumedAt) {
    open.resumedAt = nowIso;
    pausedMs += Math.max(0, nowMs - new Date(open.pausedAt).getTime());
  }

  // Draw down the roll. Guard against over-consume (cap at remaining).
  if (run.rmRollId && consumed > 0) {
    const roll = await getRoll(run.rmRollId);
    if (roll) {
      const take = Math.min(consumed, roll.remainingKg);
      const newRemaining = Number(Math.max(0, roll.remainingKg - take).toFixed(3));
      await dbUpdate("rm_rolls", "id", run.rmRollId, {
        remaining_kg: newRemaining,
        status: newRemaining <= 0 ? "consumed" : "in_use",
        updated_at: nowIso,
      }, { returning: "minimal" });

      // Mirror the draw-down onto the parent RM stock line's kg total.
      if (roll.rawMaterialId) {
        const rm = await findOne("raw_materials", roll.rawMaterialId, "id,qty_kgs");
        if (rm) {
          const newKgs = Number(Math.max(0, Number(rm.qty_kgs || 0) - take).toFixed(3));
          await dbUpdate("raw_materials", "id", roll.rawMaterialId,
            { qty_kgs: newKgs, updated_at: nowIso }, { returning: "minimal" });
        }
      }
    }
  }

  const updated = await dbUpdate("production_runs", "id", runId, {
    status: "finished",
    end_time: nowIso,
    output_pcs: good,
    waste_pcs: Number.isFinite(waste) ? waste : null,
    consumed_kg: consumed,
    paused_ms: pausedMs,
    pause_log: log,
    updated_at: nowIso,
  });
  return normRun(updated);
}
