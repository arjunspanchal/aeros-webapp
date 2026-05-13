// Save / list / update Express Ship quotes against quotes_v2.
//
// Pattern lifted from app/api/calc/import-quotes/route.js. Express-Ship
// specifics:
//   • quote_type = 'express_ship' (internal-only).
//   • payload jsonb carries every form input (origin, dispatch, DHL rate,
//     master snapshot, qty + mode, duty overrides) AND the computed result
//     snapshot so reopened quotes show the same numbers without recomputing.
//   • mfg_cost_inr ← totalLandedInr; selling_price_inr ← totalSellingInr.
//   • order_qty ← qtyPcs; order_total_inr ← totalSellingInr.
//   • bag_spec_id / client_email left NULL (internal calc, no client gate).

import { dbSelect, dbInsert, dbUpdate, publicId } from "@/lib/db/supabase";
import { getSession } from "@/lib/auth/session";
import { isInternalRole } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

const QUOTE_TYPE = "express_ship";

function gate(session) {
  if (!session) return [401, "Unauthorized"];
  if (!session.isAdmin && !isInternalRole(session.modules?.factoryos)) {
    return [403, "Forbidden"];
  }
  return null;
}

function rowToQuote(row) {
  const p = row.payload || {};
  return {
    id: publicId(row),
    createdAt: row.created_at,
    quoteRef: row.quote_ref || "",
    date: row.quote_date || "",
    generatedBy: row.generated_by || "",
    notes: row.notes || "",

    // Inputs — flat, camelCase to match the client form.
    origin: p.origin || "IN",
    originPostcode: p.origin_postcode || "",
    destinationZip: p.destination_zip || "",
    dispatchDate: p.dispatch_date || "",
    fxRate: p.fx_rate ?? null,
    dhlRate: p.dhl_rate ?? null,
    dhlRateCurrency: p.dhl_rate_currency || "INR",
    dhlRateUnit: p.dhl_rate_unit || "perKg",
    fuelPct: p.fuel_pct ?? null,

    productId: p.product_id || null,
    productSnapshot: p.product_snapshot || null,

    qtyMode: p.qty_mode || "pcs",
    qtyPcs: p.qty_pcs ?? null,
    palletsRequested: p.pallets_requested ?? null,

    exFactoryInrPerUnit: p.ex_factory_inr_per_unit ?? null,
    marginPct: row.margin_pct ?? null,

    htsus: p.htsus || "",
    mfnPctOverride: p.mfn_pct_override ?? null,
    section301PctOverride: p.section_301_pct_override ?? null,
    section122Mode: p.section_122_mode || "auto",

    // Result snapshot — the UI displays this when a quote is reloaded so
    // the numbers don't drift if duty tables change later.
    resultSnapshot: p.result_snapshot || null,

    totalLandedInr: row.mfg_cost_inr ?? null,
    totalSellingInr: row.selling_price_inr ?? null,
    qtyTotal: row.order_qty ?? null,
  };
}

const numOrNull = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

function buildRow(body) {
  const today = new Date().toISOString().split("T")[0];
  const productSnapshot = body.productSnapshot && typeof body.productSnapshot === "object"
    ? body.productSnapshot
    : null;
  const sku = productSnapshot?.sku || body.sku || "";
  return {
    quote_type: QUOTE_TYPE,
    quote_ref: body.quoteRef || `EXP ${today}${sku ? ` — ${sku}` : ""}`,
    quote_date: today,
    generated_by: body.generatedBy || "Internal",
    notes: body.notes || null,
    mfg_cost_inr: numOrNull(body.totalLandedInr),
    selling_price_inr: numOrNull(body.totalSellingInr),
    order_qty: numOrNull(body.qtyPcs ?? body.qtyTotal),
    order_total_inr: numOrNull(body.totalSellingInr),
    margin_pct: numOrNull(body.marginPct),
    bag_spec_id: null,
    payload: {
      origin: body.origin || "IN",
      origin_postcode: body.originPostcode || null,
      destination_zip: body.destinationZip || null,
      dispatch_date: body.dispatchDate || null,
      fx_rate: numOrNull(body.fxRate),
      dhl_rate: numOrNull(body.dhlRate),
      dhl_rate_currency: body.dhlRateCurrency || "INR",
      dhl_rate_unit: body.dhlRateUnit || "perKg",
      fuel_pct: numOrNull(body.fuelPct),
      product_id: body.productId || null,
      product_snapshot: productSnapshot,
      qty_mode: body.qtyMode || "pcs",
      qty_pcs: numOrNull(body.qtyPcs),
      pallets_requested: numOrNull(body.palletsRequested),
      ex_factory_inr_per_unit: numOrNull(body.exFactoryInrPerUnit),
      htsus: body.htsus || null,
      mfn_pct_override: numOrNull(body.mfnPctOverride),
      section_301_pct_override: numOrNull(body.section301PctOverride),
      section_122_mode: body.section122Mode || "auto",
      result_snapshot: body.resultSnapshot || null,
    },
  };
}

export async function GET(req) {
  const session = getSession();
  const g = gate(session);
  if (g) return new Response(g[1], { status: g[0] });

  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");

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

  const rows = await dbSelect("quotes_v2", {
    select: "*",
    filter: { quote_type: `eq.${QUOTE_TYPE}` },
    order: "quote_date.desc,created_at.desc",
  });
  return Response.json(rows.map(rowToQuote));
}

export async function POST(req) {
  const session = getSession();
  const g = gate(session);
  if (g) return new Response(g[1], { status: g[0] });

  const body = await req.json().catch(() => ({}));
  const row = buildRow(body);
  row.generated_by = session.isAdmin ? "Admin" : "Internal";
  const created = await dbInsert("quotes_v2", row);
  return Response.json(rowToQuote(created));
}

export async function PATCH(req) {
  const session = getSession();
  const g = gate(session);
  if (g) return new Response(g[1], { status: g[0] });

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const existing = (
    await dbSelect("quotes_v2", {
      select: "id,quote_type",
      filter: { id: `eq.${id}`, quote_type: `eq.${QUOTE_TYPE}` },
      limit: 1,
    })
  )[0];
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const next = buildRow(body);
  delete next.quote_type;
  delete next.generated_by;
  const updated = await dbUpdate("quotes_v2", "id", existing.id, next);
  return Response.json(rowToQuote(updated));
}
