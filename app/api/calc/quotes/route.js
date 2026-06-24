// Save / list / update bag quotes against the unified quotes_v2 table.
//
// Cutover from legacy `quotes` (the unprefixed table — bag was first, never
// renamed). Pattern lifted from app/api/calc/pp-quotes/route.js (proven).
// Bag-specific quirks below.
//
// ⚠ bag_spec_id is a TYPED FK at the TOP LEVEL of quotes_v2 — Bag is the only
// calculator that populates it. On WRITE we set row.bag_spec_id from the
// form's `bagCodeId`; on READ we surface the same FK as `bagCode` (matching
// the legacy response field name) so the existing UI loader doesn't change.
// DO NOT pack bag_spec_id into payload.

import { dbSelect, dbInsert, dbUpdate, idFilterCol, publicId } from "@/lib/db/supabase";
import { getSession, requireRole } from "@/lib/auth/session";

export const runtime = "nodejs";

const QUOTE_TYPE = "bag";

// Form-internal bag-type codes → the display label that gets stored. The
// legacy route converted on write and returned the label as-is on read; the
// existing form code expects this asymmetry, so we preserve it.
const BAG_TYPE_OUT = {
  sos: "SOS",
  rope_handle: "Rope Handle",
  flat_handle: "Flat Handle",
  v_bottom_gusset: "V-Bottom",
};

// ---------- Serialisation ----------

// quotes_v2 row → form-shaped object the UI expects. Top-level columns
// (including the bag_spec_id FK) come straight from the row; the 18 jsonb
// keys are unpacked back to the camelCase names AdminCalculator/
// ClientCalculator already read.
function rowToQuote(row) {
  const p = row.payload || {};
  return {
    id: publicId(row),
    quoteRef: row.quote_ref || "",
    date: row.quote_date || "",
    // Top-level FK surfaced as `bagCode` to match the legacy response shape.
    bagCode: row.bag_spec_id || null,
    brand: p.brand || "",
    item: p.item || "",
    bagType: p.bag_type || "",
    plainPrinted: p.plain_printed || "",
    paperType: p.paper_type || "",
    mill: p.mill || "",
    paperId: p.paper_id || null,
    materialName: p.material_name || "",
    gsm: p.gsm ?? null,
    bf: p.bf ?? null,
    width: p.width_mm ?? null,
    gusset: p.gusset_mm ?? null,
    height: p.height_mm ?? null,
    paperRate: p.paper_rate ?? null,
    casePack: p.case_pack ?? null,
    orderQty: row.order_qty ?? null,
    wastagePct: p.wastage_pct ?? null,
    // Bag's "Profit %" maps to the unified margin_pct column (same alias as box/pp).
    profitPct: row.margin_pct ?? null,
    mfgCost: row.mfg_cost_inr ?? null,
    sellingPrice: row.selling_price_inr ?? null,
    costPerCase: p.cost_per_case_inr ?? null,
    orderTotal: row.order_total_inr ?? null,
    colours: p.colours ?? null,
    coveragePct: p.coverage_pct ?? null,
    handleCost: p.handle_cost ?? null,
    clientEmail: row.client_email || "",
    generatedBy: row.generated_by || "",
    notes: row.notes || "",
  };
}

// Two-tier role gating: client never sees mfg_cost_inr or margin_pct in the
// response. Admin gets the full breakdown. Per project spec — clients only
// see the margin-adjusted final price (sellingPrice / costPerCase / orderTotal).
function redactForClient(quote) {
  // Fresh object so the underlying row stays untouched if it's reused.
  const { mfgCost, profitPct, ...rest } = quote;
  void mfgCost; void profitPct;
  return rest;
}

const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

function buildRow(body, session) {
  const today = new Date().toISOString().split("T")[0];
  return {
    quote_type: QUOTE_TYPE,
    quote_ref: body.quoteRef || `Auto ${today}`,
    quote_date: today,
    generated_by: requireRole(session, "calculator", "admin") ? "Admin" : "Client",
    // Clients always pin client_email to themselves; admin can target any email.
    client_email: requireRole(session, "calculator", "client")
      ? session.email
      : (body.clientEmail ? String(body.clientEmail).toLowerCase() : null),
    notes: body.notes || null,
    mfg_cost_inr: body.mfgCost !== undefined ? Number(body.mfgCost) : null,
    selling_price_inr: body.sellingPrice !== undefined ? Number(body.sellingPrice) : null,
    order_qty: body.orderQty ? Number(body.orderQty) : null,
    order_total_inr: body.orderTotal !== undefined ? Number(body.orderTotal) : null,
    margin_pct: body.profitPct !== undefined ? Number(body.profitPct) : null,
    // Top-level typed FK — Bag is the only calc that populates this.
    bag_spec_id: body.bagCodeId || null,
    payload: {
      brand: body.brand || null,
      item: body.item || null,
      bag_type: BAG_TYPE_OUT[body.bagType] || body.bagType || null,
      plain_printed: body.printing ? "Printed" : "Plain",
      paper_type: body.paperType || null,
      mill: body.mill || null,
      paper_id: body.paperId || null,
      material_name: body.materialName || null,
      gsm: num(body.gsm),
      bf: num(body.bf),
      width_mm: num(body.width),
      gusset_mm: num(body.gusset),
      height_mm: num(body.height),
      paper_rate: num(body.paperRate),
      case_pack: num(body.casePack),
      wastage_pct: num(body.wastagePct),
      cost_per_case_inr: num(body.costPerCase),
      colours: num(body.colours),
      coverage_pct: num(body.coverage),
      handle_cost: num(body.handleCost),
    },
  };
}

// ---------- GET: list + single ----------

export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");
  const isClient = requireRole(session, "calculator", "client");
  const shape = (q) => (isClient ? redactForClient(q) : q);

  // Single-quote fetch — used by the loader. Cross-type filter so a stray UUID
  // can't pull a box/cup/pp row once all 5 calcs share quotes_v2.
  if (idParam) {
    const rows = await dbSelect("quotes_v2", {
      select: "*",
      filter: { [idFilterCol(idParam)]: `eq.${idParam}`, quote_type: `eq.${QUOTE_TYPE}` },
      limit: 1,
    });
    const row = rows[0];
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    if (
      isClient &&
      (row.client_email || "").toLowerCase() !== session.email.toLowerCase()
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json(shape(rowToQuote(row)));
  }

  // List view — every bag quote (native + backfilled). Scope to the caller's
  // own email when client; filter on quote_type, NOT legacy_source.
  const filter = { quote_type: `eq.${QUOTE_TYPE}` };
  if (isClient) {
    filter.client_email = `eq.${session.email.toLowerCase()}`;
  }
  const rows = await dbSelect("quotes_v2", {
    select: "*",
    filter,
    order: "quote_date.desc",
  });
  return Response.json(rows.map((r) => shape(rowToQuote(r))));
}

// ---------- POST: insert (covers Save and Save-as-new) ----------

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const row = buildRow(body, session);
  const created = await dbInsert("quotes_v2", row);
  const quote = rowToQuote(created);
  return Response.json(requireRole(session, "calculator", "client") ? redactForClient(quote) : quote);
}

// ---------- PATCH: update existing ----------

export async function PATCH(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  // Existing-row lookup — id AND quote_type='bag'. Pull client_email so we
  // can run the owns-the-row check below.
  const filterCol = idFilterCol(id);
  const existing = (await dbSelect("quotes_v2", {
    select: "id,airtable_id,client_email,quote_type",
    filter: { [filterCol]: `eq.${id}`, quote_type: `eq.${QUOTE_TYPE}` },
    limit: 1,
  }))[0];
  if (!existing) return Response.json({ error: "Quote not found" }, { status: 404 });

  if (
    requireRole(session, "calculator", "client") &&
    (existing.client_email || "").toLowerCase() !== session.email.toLowerCase()
  ) {
    return Response.json({ error: "You can only edit your own quotes" }, { status: 403 });
  }

  // Build the patch from the body, then strip immutable columns so PATCH
  // can never mutate quote_type / generated_by.
  const next = buildRow(body, session);
  delete next.quote_type;
  delete next.generated_by;

  const updated = await dbUpdate("quotes_v2", "id", existing.id, next);
  const quote = rowToQuote(updated);
  return Response.json(requireRole(session, "calculator", "client") ? redactForClient(quote) : quote);
}
