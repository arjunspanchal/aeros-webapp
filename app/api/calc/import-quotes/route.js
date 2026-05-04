// Save / list / update Import Calculator quotes against the unified
// quotes_v2 table.
//
// Cutover from the legacy `import_quotes` table — pattern lifted verbatim
// from app/api/calc/pp-quotes/route.js. Import-specific differences:
//   • quote_type = 'import' (admin-only).
//   • payload jsonb carries 20 import-shipment keys (incl. the variable
//     `items` array — same data the legacy `items_json` column held).
//   • Import quotes don't fit the per-piece × qty shape, so order_qty /
//     order_total_inr are left NULL by omission. client_email is NULL too
//     (Internal-only calc; vendor lives in payload.vendor_id / vendor_name).
//   • bag_spec_id = null (Import never has one).
//   • mfg_cost_inr ← form's totalLandedINR.
//     selling_price_inr ← form's totalFinalSellingINR.
//
// Public-facing JSON shape returned to the form is unchanged so the existing
// ImportCalc + quote-loader UI work without changes.

import { dbSelect, dbInsert, dbUpdate, publicId } from "@/lib/db/supabase";
import { getSession, requireRole } from "@/lib/auth/session";

export const runtime = "nodejs";

const QUOTE_TYPE = "import";

// ---------- Serialisation ----------

// quotes_v2 row → form-shaped object the UI expects. The 20 payload keys are
// unpacked back to the camelCase names ImportCalc reads.
function rowToQuote(row) {
  const p = row.payload || {};
  return {
    id: publicId(row),
    createdAt: row.created_at,
    quoteRef: row.quote_ref || "",
    date: row.quote_date || "",
    vendorId: p.vendor_id || "",
    vendorName: p.vendor_name || "",
    shipmentType: p.shipment_type || "",
    fobCurrency: p.fob_currency || "",
    fxRate: p.fx_rate ?? null,
    freightCurrency: p.freight_currency || "",
    dutyPct: p.duty_pct ?? null,
    // Form continues to use `marginPct`; that's the same number as
    // quotes_v2.margin_pct. Surface it from the column, not the payload.
    marginPct: row.margin_pct ?? null,
    outputGstPct: p.output_gst_pct ?? null,
    freightAmount: p.freight_amount ?? null,
    freightMode: p.freight_mode || "",
    inlandAmount: p.inland_amount ?? null,
    inlandMode: p.inland_mode || "",
    unofficialAmount: p.unofficial_amount ?? null,
    unofficialMode: p.unofficial_mode || "",
    handlingAmount: p.handling_amount ?? null,
    handlingMode: p.handling_mode || "",
    lclRate: p.lcl_rate ?? null,
    lclCbm: p.lcl_cbm ?? null,
    items: Array.isArray(p.items) ? p.items : [],
    itemsCount: p.items_count ?? null,
    totalLandedINR: row.mfg_cost_inr ?? null,
    totalFinalSellingINR: row.selling_price_inr ?? null,
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
    quote_ref:
      body.quoteRef ||
      `IMP ${today}${body.vendorName ? ` — ${body.vendorName}` : ""}`,
    quote_date: today,
    generated_by: requireRole(session, "calculator", "admin") ? "Admin" : "Internal",
    notes: body.notes || null,
    mfg_cost_inr: body.totalLandedINR !== undefined ? Number(body.totalLandedINR) : null,
    selling_price_inr: body.totalFinalSellingINR !== undefined ? Number(body.totalFinalSellingINR) : null,
    margin_pct: body.marginPct !== undefined ? Number(body.marginPct) : null,
    bag_spec_id: null,
    payload: {
      vendor_id: body.vendorId || null,
      vendor_name: body.vendorName || null,
      shipment_type: body.shipmentType || null,
      fob_currency: body.fobCurrency || null,
      fx_rate: num(body.fxRate),
      freight_currency: body.freightCurrency || null,
      duty_pct: num(body.dutyPct),
      output_gst_pct: num(body.outputGstPct),
      freight_amount: num(body.freightAmount),
      freight_mode: body.freightMode || null,
      inland_amount: num(body.inlandAmount),
      inland_mode: body.inlandMode || null,
      unofficial_amount: num(body.unofficialAmount),
      unofficial_mode: body.unofficialMode || null,
      handling_amount: num(body.handlingAmount),
      handling_mode: body.handlingMode || null,
      lcl_rate: num(body.lclRate),
      lcl_cbm: num(body.lclCbm),
      items_count: num(body.itemsCount),
      items: Array.isArray(body.items) ? body.items : [],
    },
    legacy_source: null, // null = native v2 row; backfilled rows carry 'import_quotes' here
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
  // a UUID lookup can't accidentally return a bag/box/cup/pp row.
  if (idParam) {
    const rows = await dbSelect("quotes_v2", {
      select: "*",
      filter: { id: `eq.${idParam}`, quote_type: `eq.${QUOTE_TYPE}` },
      limit: 1,
    });
    const row = rows[0];
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(rowToQuote(row));
  }

  // List view — every Import quote, native or backfilled. Filter on quote_type,
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

  // Ensure the row exists AND is an Import quote — same defensive cross-type
  // guard as the GET-by-id path. quotes_v2 is uuid-only (no airtable_id
  // column), so we always filter on `id` regardless of what idFilterCol
  // would return for legacy rec-prefix strings.
  const existing = (await dbSelect("quotes_v2", {
    select: "id,quote_type",
    filter: { id: `eq.${id}`, quote_type: `eq.${QUOTE_TYPE}` },
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
