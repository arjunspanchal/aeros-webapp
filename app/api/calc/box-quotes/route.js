// Save / list / update box quotes against the unified quotes_v2 table.
//
// Cutover from the legacy `box_quotes` table — top-level columns shared with
// every other calculator (bag/cup/pp/box) live as real columns; box-specific
// fields are packed into the `payload` jsonb so quotes_v2 can stay narrow.
//
// Public-facing JSON shape returned to the form is unchanged from the legacy
// route so the existing UI doesn't need to know we moved.

import { dbSelect, dbInsert, dbUpdate, idFilterCol, publicId } from "@/lib/db/supabase";
import { getSession, requireRole } from "@/lib/auth/session";
import { BOX_TYPE_LABEL } from "@/lib/calc/box-calculator";

export const runtime = "nodejs";

const QUOTE_TYPE = "box";

// ---------- Serialisation ----------

// quotes_v2 row → the form-shaped object the existing UI expects. Box-specific
// fields are unpacked from the jsonb payload back to top-level keys.
function rowToQuote(row) {
  const p = row.payload || {};
  return {
    id: publicId(row),
    quoteRef: row.quote_ref || "",
    date: row.quote_date || "",
    boxType: p.box_type || "",
    plainPrinted: p.plain_printed || "",
    paperName: p.paper || "",
    gsm: p.gsm ?? null,
    openLength: p.open_length_mm ?? null,
    openWidth: p.open_width_mm ?? null,
    paperRate: p.paper_rate ?? null,
    qty: row.order_qty ?? null,
    wastagePct: p.wastage_pct ?? null,
    // The form still uses `profitPct` everywhere; that's the same number as
    // quotes_v2.margin_pct. Keep the alias so the UI doesn't have to change.
    profitPct: row.margin_pct ?? null,
    mfgCost: row.mfg_cost_inr ?? null,
    sellingPrice: row.selling_price_inr ?? null,
    orderTotal: row.order_total_inr ?? null,
    colours: p.colours ?? null,
    coveragePct: p.coverage_pct ?? null,
    punching: !!p.punching,
    clientEmail: row.client_email || "",
    generatedBy: row.generated_by || "",
    notes: row.notes || "",
  };
}

// Form body → quotes_v2 row. Top-level columns at the top, the rest in payload.
// Used by both POST (insert) and PATCH (update) — caller decides which subset
// to send.
function buildRow(body, session) {
  const today = new Date().toISOString().split("T")[0];
  return {
    quote_type: QUOTE_TYPE,
    quote_ref: body.quoteRef || `Auto ${today}`,
    quote_date: today,
    generated_by: requireRole(session, "calculator", "admin") ? "Admin" : "Client",
    client_email: requireRole(session, "calculator", "client")
      ? session.email
      : (body.clientEmail ? String(body.clientEmail).toLowerCase() : null),
    notes: body.notes || null,
    mfg_cost_inr: body.mfgCost !== undefined ? Number(body.mfgCost) : null,
    selling_price_inr: body.sellingPrice !== undefined ? Number(body.sellingPrice) : null,
    order_qty: body.qty ? Number(body.qty) : null,
    order_total_inr: body.orderTotal !== undefined ? Number(body.orderTotal) : null,
    // Box's "Profit %" maps to quotes_v2.margin_pct (the unified margin column).
    margin_pct: body.profitPct !== undefined ? Number(body.profitPct) : null,
    bag_spec_id: null,
    payload: {
      box_type: BOX_TYPE_LABEL[body.boxType] || body.boxType || null,
      plain_printed: body.printing ? "Printed" : "Plain",
      paper: body.paperName || null,
      gsm: body.gsm ? Number(body.gsm) : null,
      open_length_mm: Number(body.openLength) || null,
      open_width_mm: Number(body.openWidth) || null,
      paper_rate: body.paperRate ? Number(body.paperRate) : null,
      wastage_pct: body.wastagePct !== undefined ? Number(body.wastagePct) : null,
      colours: body.colours ? Number(body.colours) : null,
      coverage_pct: body.coverage ? Number(body.coverage) : null,
      punching: !!body.punching,
    },
    legacy_source: null, // null = native v2 row; rows imported from box_quotes carry the legacy id here
  };
}

// ---------- GET: list ----------

export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");

  // Single-quote fetch (used by the loader when ?quote=… is followed up with a
  // direct lookup; supports both Airtable record ids and PG uuids).
  if (idParam) {
    const rows = await dbSelect("quotes_v2", {
      select: "*",
      filter: { [idFilterCol(idParam)]: `eq.${idParam}`, quote_type: `eq.${QUOTE_TYPE}` },
      limit: 1,
    });
    const row = rows[0];
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    if (requireRole(session, "calculator", "client") && (row.client_email || "").toLowerCase() !== session.email.toLowerCase()) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json(rowToQuote(row));
  }

  // List view — filter to box quotes, scope to caller's email when client.
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

  // Make sure the caller owns this quote. Admin can edit any row; client can
  // only edit rows whose client_email matches their session.
  const filterCol = idFilterCol(id);
  const existing = (await dbSelect("quotes_v2", {
    select: "id,airtable_id,client_email,quote_type",
    filter: { [filterCol]: `eq.${id}`, quote_type: `eq.${QUOTE_TYPE}` },
    limit: 1,
  }))[0];
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (requireRole(session, "calculator", "client") && (existing.client_email || "").toLowerCase() !== session.email.toLowerCase()) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build the patch — same shape as insert, then strip the immutable fields
  // that PATCH should never touch (quote_type, generated_by, legacy_source).
  // quote_date stays as today on update — match the legacy save behaviour.
  const next = buildRow(body, session);
  delete next.quote_type;
  delete next.generated_by;
  delete next.legacy_source;

  const updated = await dbUpdate("quotes_v2", "id", existing.id, next);
  return Response.json(rowToQuote(updated));
}
