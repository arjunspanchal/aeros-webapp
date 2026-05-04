// Save / list / update cup quotes against the unified quotes_v2 table.
//
// Cutover from legacy `cup_quotes` — pattern lifted from
// app/api/calc/pp-quotes/route.js (in production). Cup-specific differences:
//   • quote_type='cup'.
//   • Cup is admin + client (not admin-only). Role gating preserved:
//       — clients can only list / read / patch rows whose client_email
//         matches their session;
//       — admins can target any row and write any clientEmail in the body.
//   • margin_pct is already named margin_pct on the form (unlike box/pp/bag
//     which had profit_pct), so no aliasing.
//   • bag_spec_id = null. order_qty + order_total_inr are included — Cup
//     quotes are per-case.
//
// Public-facing JSON shape returned to the form is unchanged so the existing
// AdminCupCalculator + ClientCupCalculator + history loader keep working.

import { dbSelect, dbInsert, dbUpdate, idFilterCol, publicId } from "@/lib/db/supabase";
import { getSession, requireRole } from "@/lib/auth/session";

export const runtime = "nodejs";

const QUOTE_TYPE = "cup";

// ---------- Serialisation ----------

function rowToQuote(row) {
  const p = row.payload || {};
  return {
    id: publicId(row),
    quoteRef: row.quote_ref || "",
    date: row.quote_date || "",
    wallType: p.wall_type || "",
    size: p.size_label || "",
    sku: p.sku || "",
    innerGsm: p.inner_gsm ?? null,
    outerGsm: p.outer_gsm ?? null,
    innerCoating: p.inner_coating || "",
    swRate: p.sidewall_rate_inr_kg ?? null,
    btRate: p.bottom_rate_inr_kg ?? null,
    ofRate: p.outer_rate_inr_kg ?? null,
    printMethod: p.print_method || "",
    outerPrintMethod: p.outer_print_method || "",
    plainPrinted: p.plain_printed || "",
    colours: p.colours ?? null,
    coveragePct: p.coverage_pct ?? null,
    casePack: p.case_pack ?? null,
    orderQty: row.order_qty ?? null,
    // Form already uses `marginPct`; column is the same name. Direct passthrough.
    marginPct: row.margin_pct ?? null,
    mfgCost: row.mfg_cost_inr ?? null,
    sellingPrice: row.selling_price_inr ?? null,
    costPerCase: p.cost_per_case_inr ?? null,
    orderTotal: row.order_total_inr ?? null,
    cupWeightG: p.cup_weight_g ?? null,
    oneTimeTotal: p.one_time_plate_die_inr ?? null,
    clientEmail: row.client_email || "",
    generatedBy: row.generated_by || "",
    notes: row.notes || "",
  };
}

const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

function buildRow(body, session) {
  const today = new Date().toISOString().split("T")[0];
  return {
    quote_type: QUOTE_TYPE,
    quote_ref: body.quoteRef || `Cup ${today}`,
    quote_date: today,
    generated_by: requireRole(session, "calculator", "admin") ? "Admin" : "Client",
    // Clients always pin client_email to themselves; admins can target any
    // address (or leave it null for an internal quote).
    client_email: requireRole(session, "calculator", "client")
      ? session.email
      : (body.clientEmail ? String(body.clientEmail).toLowerCase() : null),
    notes: body.notes || null,
    mfg_cost_inr: body.mfgCost !== undefined ? Number(body.mfgCost) : null,
    selling_price_inr: body.sellingPrice !== undefined ? Number(body.sellingPrice) : null,
    order_qty: body.orderQty ? Number(body.orderQty) : null,
    order_total_inr: body.orderTotal !== undefined ? Number(body.orderTotal) : null,
    margin_pct: body.marginPct !== undefined ? Number(body.marginPct) : null,
    bag_spec_id: null,
    payload: {
      wall_type: body.wallType || null,
      size_label: body.size || null,
      sku: body.sku || null,
      inner_gsm: num(body.innerGsm),
      outer_gsm: num(body.outerGsm),
      inner_coating: body.innerCoating || null,
      plain_printed: body.printing ? "Printed" : "Plain",
      colours: num(body.colours),
      coverage_pct: num(body.coverage),
      case_pack: num(body.casePack),
      cup_weight_g: num(body.cupWeightG),
      one_time_plate_die_inr: num(body.oneTimeTotal),
      sidewall_rate_inr_kg: num(body.swRate),
      bottom_rate_inr_kg: num(body.btRate),
      outer_rate_inr_kg: num(body.ofRate),
      print_method: body.printMethod || null,
      outer_print_method: body.outerPrintMethod || null,
      cost_per_case_inr: num(body.costPerCase),
    },
    legacy_source: null, // null = native v2 row; backfilled rows carry the legacy id here
  };
}

// ---------- GET: list + single ----------

export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");

  // Single-quote fetch — used by the loader. Filter on quote_type as well so
  // a stray UUID lookup can't return a bag/box/pp row once all 5 calculators
  // share quotes_v2.
  if (idParam) {
    const rows = await dbSelect("quotes_v2", {
      select: "*",
      filter: { [idFilterCol(idParam)]: `eq.${idParam}`, quote_type: `eq.${QUOTE_TYPE}` },
      limit: 1,
    });
    const row = rows[0];
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    if (
      requireRole(session, "calculator", "client") &&
      (row.client_email || "").toLowerCase() !== session.email.toLowerCase()
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json(rowToQuote(row));
  }

  // List view — every cup quote, native or backfilled. Scope to the caller's
  // own email when client. Filter on quote_type, NOT legacy_source, so both
  // shapes show up.
  const filter = { quote_type: `eq.${QUOTE_TYPE}` };
  if (requireRole(session, "calculator", "client")) {
    filter.client_email = `eq.${session.email.toLowerCase()}`;
  }
  const rows = await dbSelect("quotes_v2", {
    select: "*",
    filter,
    order: "quote_date.desc",
  });
  return Response.json(rows.map(rowToQuote));
}

// ---------- POST: insert (covers Save and Save-as-new) ----------

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const row = buildRow(body, session);
  const created = await dbInsert("quotes_v2", row);
  return Response.json(rowToQuote(created));
}

// ---------- PATCH: update existing ----------

export async function PATCH(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  // Existing-row lookup — id AND quote_type='cup' so a bag/box/pp UUID
  // can't sneak in. We also pull client_email so we can run the owns-the-row
  // check below.
  const filterCol = idFilterCol(id);
  const existing = (await dbSelect("quotes_v2", {
    select: "id,airtable_id,client_email,quote_type",
    filter: { [filterCol]: `eq.${id}`, quote_type: `eq.${QUOTE_TYPE}` },
    limit: 1,
  }))[0];
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  // Admin can edit any cup quote; client can only edit rows whose client_email
  // matches their session.
  if (
    requireRole(session, "calculator", "client") &&
    (existing.client_email || "").toLowerCase() !== session.email.toLowerCase()
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build patch from body, then strip immutable columns so PATCH can never
  // mutate quote_type / generated_by / legacy_source.
  const next = buildRow(body, session);
  delete next.quote_type;
  delete next.generated_by;
  delete next.legacy_source;

  const updated = await dbUpdate("quotes_v2", "id", existing.id, next);
  return Response.json(rowToQuote(updated));
}
