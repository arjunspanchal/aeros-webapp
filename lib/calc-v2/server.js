// Server glue for calculator v2: rate book, paper catalogue, quote persistence.
// The pricing itself lives in lib/quote-engine (pure, tested). Nothing here is
// imported by client components.

import { dbSelect, dbInsert, dbUpdate } from "@/lib/db/supabase";
import { listMasterPapers } from "@/lib/paper-rm";
import { requireRole } from "@/lib/auth/session";
import { price, ENGINE_VERSION } from "@/lib/quote-engine/index.js";
import { buildRecords } from "./record.js";
import { DEFAULT_RATES, laneFor } from "@/lib/quote-engine/rates/defaults.js";

/** v2 is internal-only for now: calculator admins. */
export const canUseV2 = (session) => Boolean(session && requireRole(session, "calculator", "admin"));

/** calc_rates rows as the override map the engine takes. */
export async function loadRateOverrides() {
  const rows = await dbSelect("calc_rates", { select: "key,value,status,source,updated_by,updated_at" });
  const out = {};
  for (const r of rows) {
    if (!DEFAULT_RATES[r.key]) continue; // a key the engine no longer knows
    out[r.key] = { value: Number(r.value), status: r.status, source: r.source, updatedBy: r.updated_by, updatedAt: r.updated_at };
  }
  return out;
}

/** Every rate the engine knows, default merged with any override. */
export async function rateBook() {
  const overrides = await loadRateOverrides();
  return Object.entries(DEFAULT_RATES).map(([key, d]) => {
    const o = overrides[key];
    return {
      key, unit: d.unit, family: key.split(".")[0],
      value: o ? o.value : d.value, status: o ? o.status : d.status, source: o?.source ?? d.source,
      defaultValue: d.value, overridden: Boolean(o), updatedBy: o?.updatedBy ?? null, updatedAt: o?.updatedAt ?? null,
    };
  });
}

const BAG_PAPER_TYPES = new Set(["Brown Kraft", "Bleach Kraft White", "OGR", "MG"]);

/**
 * Bag papers from master_papers with the landed rate. A lane is added only for
 * mills whose rate is ex-mill (see PAPER_LANE_PER_KG); the rest are taken as
 * delivered. A row with no GSM (JK / BILT white kraft, for example) is one rate
 * for every GSM of that grade, so it stays in the list and the GSM is typed.
 */
export async function bagPapers() {
  const all = await listMasterPapers();
  return all
    .filter((p) => BAG_PAPER_TYPES.has(p.type) && p.effectiveRate != null)
    .map((p) => {
      const lane = laneFor(p.supplier || "");
      return {
        id: p.id, label: p.materialName, type: p.type, supplier: p.supplier || "", gsm: p.gsm ?? null, bf: p.bf ?? null,
        colour: p.type === "Bleach Kraft White" || /white|bleach/i.test(p.materialName || "") ? "white" : "brown",
        exMill: p.effectiveRate, lane, landed: p.effectiveRate + lane,
      };
    })
    .sort((a, b) => a.supplier.localeCompare(b.supplier) || (a.gsm ?? 0) - (b.gsm ?? 0) || (a.bf ?? 0) - (b.bf ?? 0));
}

export async function priceSpec(spec) {
  return price(spec, await loadRateOverrides());
}

// ── Saving ──────────────────────────────────────────────────────────────────

/**
 * Re-price on the server and save. Only the spec is taken from the request:
 * the browser's numbers are never trusted, and a spec the engine has blocked
 * (cannot be made, wrong paper for the destination) is refused.
 */
export async function saveQuote({ spec, customer, brand, notes }, session) {
  const result = await priceSpec(spec);
  if (!result.lines) return { ok: false, errors: result.errors ?? ["This spec cannot be priced."] };
  if (!result.ok) {
    const why = result.warnings.filter((w) => w.level === "block").map((w) => w.message);
    return { ok: false, errors: why.length ? why : ["This spec is blocked and cannot be saved."] };
  }

  const { quoteRef, quote, line } = buildRecords({
    spec, result, customer, brand, notes,
    by: session.name || session.email || "Admin",
    engineVersion: ENGINE_VERSION,
  });
  const row = await dbInsert("quotes_v2", quote);

  // The customer's quote memory: one quote_lines row per saved option, when a
  // customer is named (Arjun, 14-Nov-2026). An earlier calculator row for the
  // same customer, item, colours, basis and quantity is superseded, so only the
  // latest stays current. A failure here must not lose the quote.
  let lineWarning = null;
  if (line) {
    try {
      const earlier = await dbSelect("quote_lines", {
        select: "id,quote_ref",
        filter: {
          source: "eq.calculator", is_current: "eq.true", customer: `eq.${line.customer}`, item_key: `eq.${line.item_key}`,
          print_colours: `eq.${line.print_colours}`, price_basis: `eq.${line.price_basis}`,
          qty: line.qty === null ? "is.null" : `eq.${line.qty}`, notes: "like.Calculator v2*",
        },
      });
      await dbInsert("quote_lines", { ...line, supersedes_ref: earlier[0]?.quote_ref ?? null }, { returning: "minimal" });
      for (const e of earlier) {
        await dbUpdate("quote_lines", "id", e.id, { is_current: false, status: "superseded" }, { returning: "minimal" });
      }
    } catch (e) {
      lineWarning = `Quote saved, but the customer quote-memory row failed: ${e.message}`;
    }
  }

  return { ok: true, quoteRef, id: row?.id ?? null, result, saved: { rate: quote.selling_price_inr, basis: quote.payload.price_basis }, lineWarning };
}

export async function listQuotes(limit = 50) {
  const rows = await dbSelect("quotes_v2", {
    select: "id,quote_type,quote_ref,quote_date,generated_by,notes,mfg_cost_inr,selling_price_inr,order_qty,margin_pct,payload,created_at",
    filter: { "payload->>engine": "eq.v2" },
    order: "created_at.desc",
    limit,
  });
  return rows.map((r) => ({
    id: r.id, family: r.quote_type, quoteRef: r.quote_ref, date: r.quote_date, by: r.generated_by, notes: r.notes,
    cost: r.mfg_cost_inr, sell: r.selling_price_inr, qty: r.order_qty, marginPct: r.margin_pct,
    title: r.payload?.item ?? "", customer: r.payload?.customer ?? "", basis: r.payload?.price_basis ?? null, spec: r.payload?.spec ?? null,
  }));
}
