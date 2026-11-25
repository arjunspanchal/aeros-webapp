// Server glue for calculator v2: rate book, paper catalogue, quote persistence.
// The pricing itself lives in lib/quote-engine (pure, tested). Nothing here is
// imported by client components.

import { dbSelect, dbInsert, dbUpdate } from "@/lib/db/supabase";
import { listMasterPapers } from "@/lib/paper-rm";
import { requireRole } from "@/lib/auth/session";
import { price, ENGINE_VERSION } from "@/lib/quote-engine/index.js";
import { buildRecords, newQuoteRef } from "./record.js";
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

// ── Customers ───────────────────────────────────────────────────────────────

const lower = (s) => String(s || "").trim().toLowerCase();

/**
 * Everyone a quote can be made out to: the client records (FactoryOS / Zoho)
 * and every customer already in the quote memory. quote_lines keys a customer
 * by a short id (its cortex slug); a client record has its own uuid. A
 * customer may have either, both or (a new name) neither.
 */
export async function listCustomers() {
  const [clients, lines] = await Promise.all([
    dbSelect("clients", { select: "id,name,code", filter: { deleted_at: "is.null" }, order: "name.asc", range: "0-1999" }),
    dbSelect("quote_lines", { select: "customer,customer_id", filter: { customer: "not.is.null" }, range: "0-9999" }),
  ]);
  const byName = new Map();
  for (const c of clients) if (c.name) byName.set(lower(c.name), { name: c.name.trim(), clientId: c.id, slug: null, quoted: 0 });
  for (const l of lines) {
    const key = lower(l.customer);
    if (!key) continue;
    const c = byName.get(key) ?? { name: l.customer.trim(), clientId: null, slug: null, quoted: 0 };
    c.slug = c.slug ?? l.customer_id ?? null;
    c.quoted += 1;
    byName.set(key, c);
  }
  return [...byName.values()].sort((x, y) => x.name.localeCompare(y.name));
}

/** The known customer a typed name refers to, matched exactly (ignoring case), or the name as typed. */
export async function resolveCustomer(name) {
  const typed = String(name || "").trim();
  if (!typed) return { name: "", clientId: null, slug: null, known: false };
  const hit = (await listCustomers()).find((c) => lower(c.name) === lower(typed));
  return hit ? { name: hit.name, clientId: hit.clientId, slug: hit.slug, known: true } : { name: typed, clientId: null, slug: null, known: false };
}

const dimsKey = (s) => String(s || "").toLowerCase().replace(/[^0-9x.]/g, "");

/** Does an earlier quote line describe the same thing as this spec? */
function sameItem(row, spec) {
  if (spec.family === "bag") {
    const want = [spec.W, spec.G, spec.H].map((n) => Math.round(Number(n)));
    const got = dimsKey(row.dims_key).split("x").map((n) => Math.round(Number(n)));
    return got.length === 3 && got.every((n, i) => Math.abs(n - want[i]) <= 1);
  }
  if (spec.family === "cup") {
    const text = `${row.item_key} ${row.item_name}`.toLowerCase().replace(/[\s_-]+/g, "");
    const size = String(spec.size).toLowerCase().replace(/[\s_-]+/g, "");
    const wall = String(spec.wall).toUpperCase();
    const wallOk = wall === "TUB" ? /tub/.test(text) : wall === "DW" ? /dw|double/.test(text) : wall === "SW" ? /sw|single/.test(text) : /ripple/.test(text);
    return wallOk && text.includes(size);
  }
  return false; // boxes are one-offs: no dependable way to say two are the same item
}

/**
 * For each line of a quote, the most recent price this customer was quoted for
 * the same item (same size bag, or same size and wall of cup), preferring the
 * same number of print colours. Read-only.
 */
export async function customerHistory(customerName, specs) {
  const who = await resolveCustomer(customerName);
  if (!who.name) return { customer: who, lines: specs.map(() => null), recent: [] };
  const select = "quote_ref,quote_date,item_key,item_name,dims_key,print_colours,price_basis,currency,qty,rate,source";
  const base = { is_current: "eq.true", status: "neq.superseded" };
  const sets = await Promise.all([
    dbSelect("quote_lines", { select, filter: { ...base, customer: `eq.${who.name}` }, order: "quote_date.desc", limit: 400 }),
    who.slug ? dbSelect("quote_lines", { select, filter: { ...base, customer_id: `eq.${who.slug}` }, order: "quote_date.desc", limit: 400 }) : [],
  ]);
  const seen = new Set();
  const rows = sets.flat().filter((r) => {
    const k = [r.quote_ref, r.item_key, r.print_colours, r.price_basis, r.qty].join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((x, y) => String(y.quote_date).localeCompare(String(x.quote_date)));

  const lines = specs.map((spec) => {
    const colours = spec.family === "bag" ? (spec.print?.slab && spec.print.slab !== "none" ? spec.print?.colours ?? 1 : 0) : spec.print?.mode && spec.print.mode !== "none" ? spec.print?.colours ?? 1 : 0;
    const same = rows.filter((r) => r.currency === "INR" && sameItem(r, spec));
    const best = same.find((r) => (r.print_colours ?? 0) === colours) ?? null;
    return best ? { quoteRef: best.quote_ref, date: best.quote_date, item: best.item_name, qty: best.qty, rate: Number(best.rate), basis: best.price_basis, colours: best.print_colours } : null;
  });
  return { customer: who, lines, recent: rows.slice(0, 8).map((r) => ({ quoteRef: r.quote_ref, date: r.quote_date, item: r.item_name, qty: r.qty, rate: Number(r.rate), basis: r.price_basis, currency: r.currency })) };
}

export async function priceMany(specs) {
  const overrides = await loadRateOverrides();
  return specs.map((spec) => price(spec, overrides));
}

// ── Saving ──────────────────────────────────────────────────────────────────

export const MAX_LINES = 80;

/**
 * Re-price on the server and save a quote of one or more lines under one
 * reference. Only the specs are taken from the request: the browser's numbers
 * are never trusted. If any line cannot be priced, or is blocked (cannot be
 * made, wrong paper for the destination), nothing is saved.
 *
 * @param lines [{ spec, ref }]  ref = the customer's own name for the line
 */
export async function saveQuote({ lines, customer, brand, notes }, session) {
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, errors: ["There is nothing to save."] };
  if (lines.length > MAX_LINES) return { ok: false, errors: [`A quote can hold up to ${MAX_LINES} lines.`] };
  const results = await priceMany(lines.map((l) => l.spec));
  const label = (i) => (lines.length > 1 ? `Line ${i + 1}: ` : "");

  const problems = [];
  results.forEach((result, i) => {
    if (!result.lines) problems.push(`${label(i)}${result.errors?.[0] ?? "this spec cannot be priced."}`);
    else if (!result.ok) problems.push(`${label(i)}${result.warnings.find((w) => w.level === "block")?.message ?? "this spec is blocked."}`);
  });
  if (problems.length) return { ok: false, errors: problems };

  // A typed name that matches a known customer takes that customer's exact
  // name and ids, so one customer is not saved under three spellings.
  const who = await resolveCustomer(customer);
  customer = who.name;
  const now = new Date();
  const quoteRef = newQuoteRef(customer, now);
  const records = results.map((result, i) => buildRecords({
    spec: lines[i].spec, result, customer, customerSlug: who.slug, clientId: who.clientId, brand, notes, ref: String(lines[i].ref || "").trim(),
    by: session.name || session.email || "Admin", engineVersion: ENGINE_VERSION, now, quoteRef, lineNo: i + 1,
  }));

  // quote_lines allows one row per item, colours, basis and quantity in a quote.
  if (customer) {
    const seen = new Map();
    for (const [i, rec] of records.entries()) {
      if (seen.has(rec.key)) return { ok: false, errors: [`Lines ${seen.get(rec.key) + 1} and ${i + 1} are the same item at the same quantity. Remove one.`] };
      seen.set(rec.key, i);
    }
  }

  await dbInsert("quotes_v2", records.map((r) => r.quote), { returning: "minimal" });

  // The customer's quote memory: one quote_lines row per line, when a customer
  // is named (Arjun, 14-Nov-2026). An earlier calculator row for the same
  // customer, item, colours, basis and quantity is superseded, so only the
  // latest stays current. A failure here must not lose the quote.
  let lineWarning = null;
  if (customer) {
    try {
      for (const { line } of records) {
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
      }
    } catch (e) {
      lineWarning = `Quote saved, but the customer quote-memory rows failed: ${e.message}`;
    }
  }

  const first = records[0].quote;
  return {
    ok: true, quoteRef, count: records.length,
    saved: { rate: first.selling_price_inr, basis: first.payload.price_basis, total: records.reduce((s, r) => s + (r.quote.order_total_inr ?? 0), 0) },
    lineWarning,
  };
}

/** Saved calculator quotes, newest first, one entry per reference. */
export async function listQuotes(limit = 400) {
  const rows = await dbSelect("quotes_v2", {
    select: "quote_type,quote_ref,quote_date,generated_by,notes,selling_price_inr,order_qty,order_total_inr,payload->>customer,payload->>brand,payload->>item,payload->>line_no,created_at",
    filter: { "payload->>engine": "eq.v2" },
    order: "created_at.desc",
    limit,
  });
  const byRef = new Map();
  for (const r of rows) {
    const q = byRef.get(r.quote_ref) ?? { quoteRef: r.quote_ref, date: r.quote_date, by: r.generated_by, customer: r.customer || "", brand: r.brand || "", notes: r.notes || "", lines: 0, total: 0, items: [], families: new Set() };
    q.lines += 1;
    q.total += Number(r.order_total_inr ?? 0);
    q.families.add(r.quote_type);
    q.items.push({ lineNo: Number(r.line_no ?? 1), title: r.item, rate: Number(r.selling_price_inr), qty: r.order_qty });
    byRef.set(r.quote_ref, q);
  }
  return [...byRef.values()].map((q) => ({ ...q, families: [...q.families], items: q.items.sort((x, y) => x.lineNo - y.lineNo) }));
}

/** One saved quote with every line's spec, so it can be reopened and re-priced. */
export async function getQuote(quoteRef) {
  const rows = await dbSelect("quotes_v2", {
    select: "quote_ref,quote_date,generated_by,notes,selling_price_inr,order_qty,payload",
    filter: { quote_ref: `eq.${quoteRef}`, "payload->>engine": "eq.v2" },
    limit: MAX_LINES,
  });
  if (!rows.length) return null;
  const lines = rows
    .map((r) => ({
      lineNo: Number(r.payload?.line_no ?? 1), spec: r.payload?.spec, ref: r.payload?.customer_ref ?? "",
      savedRate: Number(r.selling_price_inr), savedBasis: r.payload?.price_basis ?? null,
    }))
    .filter((l) => l.spec?.family)
    .sort((x, y) => x.lineNo - y.lineNo);
  const first = rows[0];
  return { quoteRef, date: first.quote_date, by: first.generated_by, customer: first.payload?.customer ?? "", brand: first.payload?.brand === first.payload?.customer ? "" : first.payload?.brand ?? "", notes: first.notes ?? "", lines };
}
