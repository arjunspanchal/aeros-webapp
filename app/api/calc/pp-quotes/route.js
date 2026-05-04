// Save / list / update PP item quotes against the unified quotes_v2 table.
//
// Cutover from the legacy `pp_quotes` table — pattern lifted verbatim from
// app/api/calc/box-quotes/route.js. PP-specific differences:
//   • quote_type = 'pp' (admin-only; no client side for PP).
//   • payload jsonb carries 22 thermoforming-specific keys.
//   • PP never collects client_email and quotes price per piece, not per
//     order — so client_email / order_qty / order_total_inr are left NULL
//     by omission from the inserted row (Postgres uses column defaults).
//   • bag_spec_id = null (PP never has one).
//   • margin_pct ← form's profitPct (same alias as box).
//
// Public-facing JSON shape returned to the form is unchanged so the existing
// AdminPpCalculator + quote-loader UI work without changes.

import { dbSelect, dbInsert, dbUpdate, idFilterCol, publicId } from "@/lib/db/supabase";
import { getSession, requireRole } from "@/lib/auth/session";

export const runtime = "nodejs";

const QUOTE_TYPE = "pp";

// ---------- Serialisation ----------

// quotes_v2 row → form-shaped object the UI expects. The 22 payload keys are
// unpacked back to the camelCase names AdminPpCalculator reads.
function rowToQuote(row) {
  const p = row.payload || {};
  return {
    id: publicId(row),
    quoteRef: row.quote_ref || "",
    date: row.quote_date || "",
    itemName: p.item_name || "",
    presetKey: p.preset_key || "",
    itemWeight: p.item_weight_g ?? null,
    cavities: p.cavities ?? null,
    cycleTime: p.cycle_time_s ?? null,
    shiftHrs: p.shift_hrs ?? null,
    shiftsPerDay: p.shifts_per_day ?? null,
    labourCostPerDay: p.labour_cost_per_day_inr ?? null,
    rmRate: p.rm_rate_inr ?? null,
    runnerWeightPerShot: p.runner_g_per_shot ?? null,
    regrindCapturePercent: p.regrind_pct ?? null,
    machinePowerKw: p.machine_power_kw ?? null,
    electricityRate: p.electricity_rate ?? null,
    moldCost: p.mold_cost_inr ?? null,
    moldLifeShots: p.mold_life_shots ?? null,
    rejectPercent: p.reject_pct ?? null,
    innerSleeveCost: p.inner_sleeve_cost_inr ?? null,
    innerPackingLabour: p.inner_packing_labour_inr ?? null,
    unitsPerSleeve: p.units_per_sleeve ?? null,
    cartonCost: p.carton_cost_inr ?? null,
    casePack: p.case_pack ?? null,
    spPerCase: p.sp_per_case_inr ?? null,
    // Form continues to use `profitPct`; that's the same number as
    // quotes_v2.margin_pct. Alias it here so AdminPpCalculator stays the same.
    profitPct: row.margin_pct ?? null,
    mfgCost: row.mfg_cost_inr ?? null,
    sellingPrice: row.selling_price_inr ?? null,
    generatedBy: row.generated_by || "",
    notes: row.notes || "",
  };
}

// Helper — Number() with `null` for empty/undefined so we don't silently
// store 0 when the form omits a field.
const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

// Form body → quotes_v2 row. Omits client_email / order_qty / order_total_inr
// entirely so Postgres leaves those columns NULL (per the cutover spec).
function buildRow(body, session) {
  const today = new Date().toISOString().split("T")[0];
  return {
    quote_type: QUOTE_TYPE,
    quote_ref: body.quoteRef || `PP ${today}`,
    quote_date: today,
    generated_by: requireRole(session, "calculator", "admin") ? "Admin" : "Client",
    notes: body.notes || null,
    mfg_cost_inr: body.mfgCost !== undefined ? Number(body.mfgCost) : null,
    selling_price_inr: body.sellingPrice !== undefined ? Number(body.sellingPrice) : null,
    margin_pct: body.profitPct !== undefined ? Number(body.profitPct) : null,
    bag_spec_id: null,
    payload: {
      item_name: body.itemName || null,
      preset_key: body.presetKey || null,
      item_weight_g: num(body.itemWeight),
      cavities: num(body.cavities),
      cycle_time_s: num(body.cycleTime),
      shift_hrs: num(body.shiftHrs),
      shifts_per_day: num(body.shiftsPerDay),
      labour_cost_per_day_inr: num(body.labourCostPerDay),
      rm_rate_inr: num(body.rmRate),
      runner_g_per_shot: num(body.runnerWeightPerShot),
      regrind_pct: num(body.regrindCapturePercent),
      machine_power_kw: num(body.machinePowerKw),
      electricity_rate: num(body.electricityRate),
      mold_cost_inr: num(body.moldCost),
      mold_life_shots: num(body.moldLifeShots),
      reject_pct: num(body.rejectPercent),
      inner_sleeve_cost_inr: num(body.innerSleeveCost),
      inner_packing_labour_inr: num(body.innerPackingLabour),
      units_per_sleeve: num(body.unitsPerSleeve),
      carton_cost_inr: num(body.cartonCost),
      case_pack: num(body.casePack),
      sp_per_case_inr: num(body.spPerCase),
    },
    legacy_source: null, // null = native v2 row; backfilled rows carry the legacy id here
  };
}

// ---------- GET: list + single ----------

export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "calculator", "admin")) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");

  // Single-quote fetch — used by the loader. Filter on quote_type as well so
  // a UUID lookup can't accidentally return a bag/box/cup row once all 5
  // calculators share quotes_v2.
  if (idParam) {
    const rows = await dbSelect("quotes_v2", {
      select: "*",
      filter: { [idFilterCol(idParam)]: `eq.${idParam}`, quote_type: `eq.${QUOTE_TYPE}` },
      limit: 1,
    });
    const row = rows[0];
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(rowToQuote(row));
  }

  // List view — every PP quote, native or backfilled. We filter on quote_type,
  // NOT legacy_source, so the list includes both shapes.
  const rows = await dbSelect("quotes_v2", {
    select: "*",
    filter: { quote_type: `eq.${QUOTE_TYPE}` },
    order: "quote_date.desc",
  });
  return Response.json(rows.map(rowToQuote));
}

// ---------- POST: insert (covers Save and Save-as-new) ----------

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "calculator", "admin")) return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const row = buildRow(body, session);
  const created = await dbInsert("quotes_v2", row);
  return Response.json(rowToQuote(created));
}

// ---------- PATCH: update existing ----------

export async function PATCH(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireRole(session, "calculator", "admin")) return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  // Ensure the row exists AND is a PP quote — same defensive cross-type guard
  // as the GET-by-id path.
  const filterCol = idFilterCol(id);
  const existing = (await dbSelect("quotes_v2", {
    select: "id,airtable_id,quote_type",
    filter: { [filterCol]: `eq.${id}`, quote_type: `eq.${QUOTE_TYPE}` },
    limit: 1,
  }))[0];
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  // Build the patch from the body, then strip the immutable columns so PATCH
  // can never mutate quote_type / generated_by / legacy_source.
  const next = buildRow(body, session);
  delete next.quote_type;
  delete next.generated_by;
  delete next.legacy_source;

  const updated = await dbUpdate("quotes_v2", "id", existing.id, next);
  return Response.json(rowToQuote(updated));
}
