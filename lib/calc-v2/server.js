// Server glue for calculator v2: rate book, paper catalogue, quote persistence.
// The pricing itself lives in lib/quote-engine (pure, tested). Nothing here is
// imported by client components.

import { dbSelect, dbInsert } from "@/lib/db/supabase";
import { listMasterPapers } from "@/lib/paper-rm";
import { requireRole } from "@/lib/auth/session";
import { price, ENGINE_VERSION } from "@/lib/quote-engine/index.js";
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

/** Bag papers from master_papers with the landed rate (ex-mill + lane). */
export async function bagPapers() {
  const all = await listMasterPapers();
  return all
    .filter((p) => BAG_PAPER_TYPES.has(p.type) && p.effectiveRate != null && p.gsm)
    .map((p) => {
      const lane = laneFor(p.supplier || "");
      return {
        id: p.id, label: p.materialName, type: p.type, supplier: p.supplier || "", gsm: p.gsm, bf: p.bf ?? null,
        colour: p.type === "Brown Kraft" || /brown|unbleach/i.test(p.materialName || "") ? "brown" : "white",
        exMill: p.effectiveRate, lane, landed: p.effectiveRate + lane,
      };
    })
    .sort((a, b) => a.supplier.localeCompare(b.supplier) || a.gsm - b.gsm || (a.bf ?? 0) - (b.bf ?? 0));
}

export async function priceSpec(spec) {
  return price(spec, await loadRateOverrides());
}

// ── Saving ──────────────────────────────────────────────────────────────────

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const today = () => new Date().toISOString().slice(0, 10);

function describe(spec, result) {
  if (spec.family === "bag") {
    const { W, G, H } = result.size;
    return {
      itemKey: `${spec.type}-bag-${W}x${G}x${H}-${spec.gsm}gsm-${slug(spec.paper?.colour || "kraft")}`,
      dims: `${W}x${G}x${H}`,
      material: `${spec.gsm}GSM-${String(spec.paper?.colour || "kraft").toUpperCase()}-KRAFT`,
      colours: spec.print?.slab && spec.print.slab !== "none" ? spec.print?.colours ?? 1 : 0,
    };
  }
  if (spec.family === "cup") {
    return {
      itemKey: `${slug(spec.wall)}-${slug(spec.size)}-${spec.gsm ?? 280}gsm`,
      dims: null, material: `${spec.gsm ?? 280}GSM`,
      colours: spec.print?.mode && spec.print.mode !== "none" ? spec.print?.colours ?? 1 : 0,
    };
  }
  const sh = result.geometry?.sheet;
  return {
    itemKey: `box-${slug(spec.name || "custom")}-${spec.board?.gsm}gsm`,
    dims: sh ? `${Math.round(sh.w)}x${Math.round(sh.h)}-sheet-${result.geometry.ups}up` : null,
    material: `${slug(spec.board?.label || "board")}-${spec.board?.gsm}`,
    colours: spec.print?.mode && spec.print.mode !== "none" ? spec.print?.colours ?? 1 : 0,
  };
}

/**
 * Re-price on the server and save. The browser's numbers are never trusted:
 * only the spec is taken from the request.
 */
export async function saveQuote({ spec, customer, brand, notes }, session) {
  const result = await priceSpec(spec);
  if (!result.lines) return { ok: false, errors: result.errors ?? ["This spec cannot be priced."] };

  const d = describe(spec, result);
  const date = today();
  const stamp = new Date().toISOString().slice(11, 16).replace(":", "");
  const quoteRef = `CALC-${date.replace(/-/g, "")}-${(slug(customer) || "internal").toUpperCase()}-${stamp}`;
  const qty = result.qty ?? spec.qty ?? null;
  const exportFob = spec.family === "bag" ? result.export?.fob : null;
  const rate = exportFob ?? result.sell;
  const round2 = (n) => Math.round(n * 100) / 100;

  const row = await dbInsert("quotes_v2", {
    quote_type: spec.family,
    quote_ref: quoteRef,
    quote_date: date,
    generated_by: session.name || session.email || "Admin",
    notes: notes || null,
    mfg_cost_inr: Number(result.cost.toFixed(4)),
    selling_price_inr: round2(rate),
    order_qty: qty,
    order_total_inr: qty ? round2(round2(rate) * qty) : null,
    margin_pct: result.marginPct,
    payload: {
      engine: "v2",
      engine_version: ENGINE_VERSION,
      item: result.title,
      brand: brand || customer || "",
      customer: customer || "",
      spec,
      result: {
        title: result.title, route: result.route, cost: result.cost, sell: result.sell, margin_mode: result.marginMode,
        lines: result.lines, one_time: result.oneTime, ladder: result.ladder, packing: result.packing,
        export: result.export, warnings: result.warnings,
      },
      rates_used: result.ratesUsed,
    },
  });

  // The customer's quote memory: one quote_lines row per saved option, when a
  // customer is named (Arjun, 14-Nov-2026). A failure here must not lose the quote.
  let lineWarning = null;
  if (customer) {
    try {
      const plates = result.oneTime?.find((o) => o.key === "plates")?.value ?? null;
      const assumed = result.ratesUsed.some((u) => u.status === "assumed" || u.status === "disputed");
      await dbInsert("quote_lines", {
        quote_ref: quoteRef, quote_date: date, line_no: "1", source: "calculator", is_current: true,
        customer, brand: brand || null,
        item_key: d.itemKey, item_name: result.title, print_colours: d.colours,
        material_key: d.material, dims_key: d.dims,
        price_basis: exportFob ? "FOB" : "EXW_BHIWANDI", currency: "INR",
        qty, rate: round2(rate), uom: "pc", cost: Number(result.cost.toFixed(4)), margin_pct: result.marginPct,
        plate_charge: plates, moq: result.moq ?? null, status: "quoted",
        confidence: assumed || result.warnings.length ? "low" : "high",
        notes: `Calculator v2 (${result.marginMode === "on_sell" ? "margin on sell" : "markup on cost"}). WORKING COSTING, not yet sent. quotes_v2 ${quoteRef}.`,
      }, { returning: "minimal" });
    } catch (e) {
      lineWarning = `Quote saved, but the customer quote-memory row failed: ${e.message}`;
    }
  }

  return { ok: true, quoteRef, id: row?.id ?? null, result, lineWarning };
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
    title: r.payload?.item ?? "", customer: r.payload?.customer ?? "", spec: r.payload?.spec ?? null,
  }));
}
