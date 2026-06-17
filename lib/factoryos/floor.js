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

// Feed profiles — what an individual machine consumes. Each machine row carries
// a feed_profile key; the operator gets one slot per feed. kind="roll" → pick a
// serial RM roll (decrements on finish); kind="sku" → record a semi-finished
// SKU + qty (the DW machine fed with single-wall cups; no stock draw-down yet).
// Feed kinds:
//   roll    → pick a serial RM roll; decrements on finish (bag/SW/tub/DW paper)
//   sku     → record a semi-finished SKU + qty (DW single-wall cups; no draw-down)
//   stockkg → pick an RM stock LINE (die-cut fan paper spec) + enter kg loaded;
//             decrements that stock line on finish (clam / food box)
export const FEED_PROFILES = {
  bag:         { feeds: [{ role: "bag_roll",  label: "Bag roll",          kind: "roll" }] },
  wall_bottom: { feeds: [{ role: "wall_fan",  label: "Inner wall fan",    kind: "roll" },
                         { role: "bottom",    label: "Bottom",            kind: "roll" }] },
  dw:          { feeds: [{ role: "sw_cups",   label: "Single-wall cups",  kind: "sku"  },
                         { role: "outer_fan", label: "Outer wall fan",    kind: "roll" }] },
  fan:         { feeds: [{ role: "fan",       label: "Die-cut fan",       kind: "stockkg" }] },
  generic:     { feeds: [{ role: "material",  label: "Material",          kind: "roll" }] },
};

export function feedsForProfile(profile) {
  return (FEED_PROFILES[profile] || FEED_PROFILES.generic).feeds;
}

// ---------------------------------------------------------------------------
// Machines
// ---------------------------------------------------------------------------

function normMachine(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    type: row.type || null,           // machine line category key
    status: row.status || "active",
    location: row.location || "",
    feedProfile: row.feed_profile || "generic",
    feeds: feedsForProfile(row.feed_profile),
    notes: row.notes || "",
  };
}

// Active machines, optionally scoped to one line category. Used by the floor
// page (operator picks the specific machine) and admin views.
export async function listMachines({ category = "" } = {}) {
  const filter = { active: "eq.true" };
  if (category) filter.type = `eq.${category}`;
  const rows = await dbSelect("machines", {
    select: "id,name,type,status,location,feed_profile,notes,active",
    filter,
    order: "name.asc",
    range: "0-499",
  });
  return rows.map(normMachine);
}

export async function getMachine(id) {
  const rows = await dbSelect("machines", {
    select: "id,name,type,status,location,feed_profile,notes,active",
    filter: { id: `eq.${id}` },
    limit: 1,
  });
  return normMachine(rows[0]);
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

// RM stock lines (raw_materials) for the clam fan feed — the operator picks the
// fan paper spec here and enters kg loaded; that kg draws this line down.
export async function listRmStockLines() {
  const rows = await dbSelect("raw_materials", {
    select: "id,name,master_rm_name,paper_type,gsm,bf,supplier,mill,qty_kgs",
    filter: { active: "eq.true" },
    order: "name.asc",
    range: "0-999",
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name || r.master_rm_name || "",
    paperType: r.paper_type || "",
    gsm: r.gsm != null ? Number(r.gsm) : null,
    bf: r.bf != null ? Number(r.bf) : null,
    supplier: r.supplier || r.mill || "",
    qtyKgs: r.qty_kgs != null ? Number(r.qty_kgs) : 0,
  }));
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
    machineId: row.machine_id || null,
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
  "id,run_id,machine_category,machine_id,status,start_time,end_time,operator_name,rm_roll_id,sku_id," +
  "sku_snapshot,machine_speed,speed_unit,photo_path,paused_ms,pause_log,output_pcs,waste_pcs," +
  "consumed_kg,notes,created_at";

export async function getRunById(id) {
  const rows = await dbSelect("production_runs", { select: RUN_SELECT, filter: { id: `eq.${id}` }, limit: 1 });
  return normRun(rows[0]);
}

function normFeed(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    roleLabel: row.role_label || row.role,
    rmRollId: row.rm_roll_id || null,
    rawMaterialId: row.raw_material_id || null,
    skuId: row.sku_id || null,
    skuSnapshot: row.sku_snapshot || "",
    qtyPcs: row.qty_pcs != null ? Number(row.qty_pcs) : null,
    consumedKg: row.consumed_kg != null ? Number(row.consumed_kg) : null,
  };
}

export async function getRunFeeds(runId) {
  const rows = await dbSelect("production_run_feeds", {
    select: "id,role,role_label,rm_roll_id,raw_material_id,sku_id,sku_snapshot,qty_pcs,consumed_kg",
    filter: { run_id: `eq.${runId}` },
    order: "created_at.asc",
  });
  return rows.map(normFeed);
}

// Decrement a roll by `take` kg, mirror onto its parent RM stock line, and flip
// the roll to consumed at zero. Shared by finishRun for every paper feed.
async function drawDownRoll(rmRollId, take, nowIso) {
  if (!rmRollId || !(take > 0)) return;
  const roll = await getRoll(rmRollId);
  if (!roll) return;
  const t = Math.min(take, roll.remainingKg);
  const newRemaining = Number(Math.max(0, roll.remainingKg - t).toFixed(3));
  await dbUpdate("rm_rolls", "id", rmRollId, {
    remaining_kg: newRemaining,
    status: newRemaining <= 0 ? "consumed" : "in_use",
    updated_at: nowIso,
  }, { returning: "minimal" });
  if (roll.rawMaterialId) {
    const rm = await findOne("raw_materials", roll.rawMaterialId, "id,qty_kgs");
    if (rm) {
      const newKgs = Number(Math.max(0, Number(rm.qty_kgs || 0) - t).toFixed(3));
      await dbUpdate("raw_materials", "id", roll.rawMaterialId,
        { qty_kgs: newKgs, updated_at: nowIso }, { returning: "minimal" });
    }
  }
}

// Decrement an RM stock line directly by `take` kg (clam fan feed — no serial
// roll, the operator picked the stock line + entered kg loaded).
async function drawDownStockLine(rawMaterialId, take, nowIso) {
  if (!rawMaterialId || !(take > 0)) return;
  const rm = await findOne("raw_materials", rawMaterialId, "id,qty_kgs");
  if (!rm) return;
  const newKgs = Number(Math.max(0, Number(rm.qty_kgs || 0) - take).toFixed(3));
  await dbUpdate("raw_materials", "id", rawMaterialId,
    { qty_kgs: newKgs, updated_at: nowIso }, { returning: "minimal" });
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

// Start a run. `feeds` is one entry per machine feed slot:
//   { role, roleLabel, kind:"roll", rmRollId }      — paper roll feed
//   { role, roleLabel, kind:"sku",  skuId, skuSnapshot, qtyPcs } — semi-finished
// The first roll feed is mirrored onto production_runs.rm_roll_id so the
// existing admin run list keeps showing a roll. All feeds also land in
// production_run_feeds. Roll feeds are flipped to in_use.
export async function startRun({
  machineCategory, machineId, operatorName, skuId, skuSnapshot,
  machineSpeed, speedUnit, photoPath, feeds = [],
}) {
  if (!isMachineCategory(machineCategory)) throw new Error("Pick a machine line");
  if (!operatorName) throw new Error("Operator not identified");
  if (!skuId) throw new Error("Pick the SKU being made");
  if (!Array.isArray(feeds) || feeds.length === 0) throw new Error("Pick the material feed(s)");

  // Validate roll feeds up front.
  const rollFeeds = feeds.filter((f) => f.kind === "roll" && f.rmRollId);
  for (const f of rollFeeds) {
    const roll = await getRoll(f.rmRollId);
    if (!roll) throw new Error(`Roll for "${f.roleLabel || f.role}" not found`);
    if (roll.status === "consumed" || roll.remainingKg <= 0) {
      throw new Error(`Roll for "${f.roleLabel || f.role}" is already fully consumed`);
    }
  }
  // Every slot must be filled appropriately for its kind.
  for (const f of feeds) {
    if (f.kind === "roll" && !f.rmRollId) throw new Error(`Pick a roll for "${f.roleLabel || f.role}"`);
    if (f.kind === "sku" && !f.skuId) throw new Error(`Pick the item for "${f.roleLabel || f.role}"`);
    if (f.kind === "stockkg" && !f.rawMaterialId) throw new Error(`Pick the paper for "${f.roleLabel || f.role}"`);
  }

  const now = new Date().toISOString();
  const primaryRoll = rollFeeds[0]?.rmRollId || null;
  const inserted = await dbInsert("production_runs", {
    run_id: generateRunId(),
    machine_category: machineCategory,
    machine_id: machineId || null,
    status: "running",
    start_time: now,
    operator_name: operatorName,
    rm_roll_id: primaryRoll,
    sku_id: skuId,
    sku_snapshot: skuSnapshot || "",
    machine_speed: Number.isFinite(Number(machineSpeed)) ? Number(machineSpeed) : null,
    speed_unit: speedUnit || "pcs/min",
    photo_path: photoPath || null,
    paused_ms: 0,
    pause_log: [],
  });
  const run = normRun(Array.isArray(inserted) ? inserted[0] : inserted);

  // Feed rows. For stockkg (clam fan) the loaded kg is captured now and stored
  // as the provisional consumed_kg; finish can adjust before drawing it down.
  const feedRows = feeds.map((f) => ({
    run_id: run.id,
    role: f.role,
    role_label: f.roleLabel || f.role,
    rm_roll_id: f.kind === "roll" ? f.rmRollId : null,
    raw_material_id: f.kind === "stockkg" ? (f.rawMaterialId || null) : null,
    sku_id: f.kind === "sku" ? (f.skuId || null) : null,
    sku_snapshot: (f.kind === "sku" || f.kind === "stockkg") ? (f.skuSnapshot || "") : null,
    qty_pcs: f.kind === "sku" && f.qtyPcs != null ? Number(f.qtyPcs) : null,
    consumed_kg: f.kind === "stockkg" && f.loadedKg != null ? Number(f.loadedKg) : null,
  }));
  if (feedRows.length) await dbInsert("production_run_feeds", feedRows, { returning: "minimal" });

  // Reserve the rolls.
  for (const f of rollFeeds) {
    await dbUpdate("rm_rolls", "id", f.rmRollId, { status: "in_use", updated_at: now }, { returning: "minimal" });
  }
  return run;
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

// Finish a run: good/waste pcs + per-feed consumed kg. Each roll feed draws
// down its roll (and parent RM line); the sw_cups feed just records the count.
// `feedConsumption` maps feed-row id → { consumedKg, qtyPcs }. Closes any open
// pause interval first.
export async function finishRun({ runId, goodPcs, wastePcs, feedConsumption = {} }) {
  const run = await getRunById(runId);
  if (!run) throw new Error("Run not found");
  if (run.status === "finished") throw new Error("Run already finished");

  const good = Number(goodPcs);
  const waste = Number(wastePcs);
  if (!Number.isFinite(good) || good < 0) throw new Error("Good pieces must be 0 or more");

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Close an open pause interval.
  let pausedMs = run.pausedMs || 0;
  const log = run.pauseLog.slice();
  const open = log[log.length - 1];
  if (open && !open.resumedAt) {
    open.resumedAt = nowIso;
    pausedMs += Math.max(0, nowMs - new Date(open.pausedAt).getTime());
  }

  // Walk this run's feeds; decrement roll feeds, stamp each feed row.
  const feeds = await getRunFeeds(runId);
  let totalConsumed = 0;
  for (const f of feeds) {
    const entry = feedConsumption[f.id] || {};
    if (f.rmRollId) {
      const kg = Number(entry.consumedKg);
      const take = Number.isFinite(kg) && kg > 0 ? kg : 0;
      if (take > 0) {
        await drawDownRoll(f.rmRollId, take, nowIso);
        totalConsumed += take;
      }
      await dbUpdate("production_run_feeds", "id", f.id,
        { consumed_kg: take }, { returning: "minimal" });
    } else if (f.rawMaterialId) {
      // Clam die-cut fan: kg drawn from the chosen RM stock line. Default to the
      // kg captured at load (f.consumedKg) if finish didn't override it.
      const kg = entry.consumedKg != null && entry.consumedKg !== "" ? Number(entry.consumedKg) : Number(f.consumedKg);
      const take = Number.isFinite(kg) && kg > 0 ? kg : 0;
      if (take > 0) {
        await drawDownStockLine(f.rawMaterialId, take, nowIso);
        totalConsumed += take;
      }
      await dbUpdate("production_run_feeds", "id", f.id,
        { consumed_kg: take }, { returning: "minimal" });
    } else if (f.skuId) {
      // Semi-finished (DW single-wall cups): record the qty fed, no draw-down.
      const q = Number(entry.qtyPcs);
      await dbUpdate("production_run_feeds", "id", f.id,
        { qty_pcs: Number.isFinite(q) && q >= 0 ? q : f.qtyPcs }, { returning: "minimal" });
    }
  }

  const updated = await dbUpdate("production_runs", "id", runId, {
    status: "finished",
    end_time: nowIso,
    output_pcs: good,
    waste_pcs: Number.isFinite(waste) ? waste : null,
    consumed_kg: Number(totalConsumed.toFixed(3)),
    paused_ms: pausedMs,
    pause_log: log,
    updated_at: nowIso,
  });
  return normRun(updated);
}
