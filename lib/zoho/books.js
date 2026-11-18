// Zoho Books client for FactoryOS and its Warehouse unit.
//
// Server-only. Uses the Self Client refresh token set by scripts/zoho-connect.sh
// (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID,
// ZOHO_ACCOUNTS_URL, ZOHO_API_URL). What it can do depends on the scopes that
// token was generated with:
//   ZohoBooks.salesorders.READ     — SO lookup on jobs (18-Nov-2026)
//   ZohoBooks.invoices.READ        — Warehouse Outward (invoices to load)
//   ZohoBooks.purchaseorders.READ  — Warehouse Inward (POs expected)
//   ZohoBooks.invoices.UPDATE      — optional: tick "Delivery Acknowledgment"
// The only write in this file is that one tick (setInvoiceDelivered).
//
// No rates or amounts ever leave this module (no rates in FactoryOS,
// 17-Nov-2026): only numbers, dates, parties, status and item names /
// quantities. Import this from server code (routes, server pages) only.

import { dbSelect, dbInsert } from "../db/supabase.js";

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";
const API = process.env.ZOHO_API_URL || "https://www.zohoapis.in";
const ORG = process.env.ZOHO_ORG_ID || "60004253439";

export function zohoConfigured() {
  return !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);
}

// Access tokens last an hour and Zoho allows only a handful of refreshes every
// ten minutes. Every server function (and every dev reload) has its own
// memory, so the token is kept in three places: this instance, then the
// zoho_token_cache table shared by all of them, then a fresh one from Zoho.
const g = globalThis;
g.__aerosZohoToken ||= { token: null, expiresAt: 0, pending: null };
let tokenCache = g.__aerosZohoToken;
const TOKEN_ROW = "books";
const fresh = (expiresAt) => Date.now() < expiresAt - 120_000;

function resetToken() {
  g.__aerosZohoToken = { token: null, expiresAt: 0, pending: null };
  tokenCache = g.__aerosZohoToken;
}

async function accessToken({ force = false } = {}) {
  if (!zohoConfigured()) throw new Error("Zoho is not connected (missing ZOHO_* settings)");
  if (!force && tokenCache.token && fresh(tokenCache.expiresAt)) return tokenCache.token;
  if (tokenCache.pending) return tokenCache.pending;
  tokenCache.pending = (async () => {
    if (!force) {
      const rows = await dbSelect("zoho_token_cache", { select: "access_token,expires_at", filter: { id: `eq.${TOKEN_ROW}` }, limit: 1 }).catch(() => []);
      const at = rows[0] ? Date.parse(rows[0].expires_at) : 0;
      if (rows[0]?.access_token && fresh(at)) {
        tokenCache.token = rows[0].access_token; tokenCache.expiresAt = at;
        return tokenCache.token;
      }
    }
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    });
    const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: "POST", body: params, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error(`Zoho sign-in failed: ${data.error_description || data.error || res.status}`);
    tokenCache.token = data.access_token;
    tokenCache.expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    await dbInsert("zoho_token_cache", {
      id: TOKEN_ROW, access_token: tokenCache.token,
      expires_at: new Date(tokenCache.expiresAt).toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "id", returning: "minimal" }).catch(() => {});
    return tokenCache.token;
  })();
  try { return await tokenCache.pending; } finally { tokenCache.pending = null; }
}

// A 401 is an expired token (get a new one and retry) or a missing permission
// (code 57). A missing permission is normally final, but right after the
// connection is renewed with wider access the shared token is still the old
// one, so try a new token for that too, at most once every ten minutes so a
// truly missing permission cannot use up Zoho's sign-in allowance.
async function renewAfter401(code) {
  if (code === 57) {
    if (Date.now() - (g.__aerosZohoScopeRetryAt || 0) < 600_000) return false;
    g.__aerosZohoScopeRetryAt = Date.now();
  }
  resetToken();
  try { await accessToken({ force: true }); return true; } catch { return false; }
}

async function zohoGet(path, query = {}) {
  const url = new URL(`${API}/books/v3${path}`);
  url.searchParams.set("organization_id", ORG);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const run = async () => fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}` }, cache: "no-store" });
  let res = await run();
  if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}));
    if (await renewAfter401(body.code)) res = await run();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.code !== undefined && data.code !== 0)) {
    const err = new Error(`Zoho: ${data.message || res.status}`);
    err.status = res.status; err.code = data.code;
    throw err;
  }
  return data;
}

// Writes (only the delivery tick uses this). Body is sent as JSON.
async function zohoSend(method, path, body) {
  const url = new URL(`${API}/books/v3${path}`);
  url.searchParams.set("organization_id", ORG);
  const run = async () => fetch(url, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let res = await run();
  if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}));
    if (await renewAfter401(body.code)) res = await run();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.code !== undefined && data.code !== 0)) {
    const err = new Error(`Zoho: ${data.message || res.status}`);
    err.status = res.status; err.code = data.code;
    throw err;
  }
  return data;
}

// Lists are re-read on every warehouse screen; hold each for a short while so
// a busy morning does not burn through Zoho's API allowance.
const listCache = new Map(); // key → { at, value }
const LIST_TTL = 45_000;
async function cachedList(key, load) {
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < LIST_TTL) return hit.value;
  const value = await load();
  listCache.set(key, { at: Date.now(), value });
  return value;
}
export function clearZohoListCache() { listCache.clear(); }

// True when Zoho refused because the token lacks the scope for that call.
export function isScopeError(e) {
  return /not authorized|unauthori[sz]ed|scope|code 57/i.test(String(e?.message || "")) || e?.code === 57;
}

// "14612", "so 14612", "SO-14612" → "SO-14612". Anything else is kept as
// typed (older series such as 2122/PI/Jul/07), trimmed and upper-cased.
export function normaliseSoNumber(raw) {
  const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  const m = s.match(/^(?:SO-?)?(\d{3,6})$/);
  return m ? `SO-${m[1]}` : s.slice(0, 60);
}

// The only shape that leaves this module.
function safeSo(so, lines = null) {
  return {
    id: String(so.salesorder_id),
    number: so.salesorder_number,
    date: so.date || null,
    customer: so.customer_name || "",
    customerId: so.customer_id ? String(so.customer_id) : null,
    reference: so.reference_number || "",
    status: so.order_status || so.status || "",          // open / closed / void / draft
    invoiced: so.invoiced_status || "",
    shipped: so.shipped_status || "",
    salesperson: so.salesperson_name || "",
    lines: lines
      ? lines.map((l) => ({
          id: l.line_item_id ? String(l.line_item_id) : "",
          name: l.name || "",
          sku: l.sku || "",
          qty: Number(l.quantity) || 0,
          invoiced: Number(l.quantity_invoiced) || 0,
          cancelled: Number(l.quantity_cancelled) || 0,
          unit: l.unit || "",
        }))
      : undefined,
  };
}

// Ten minutes: an SO's customer and number never change, and Zoho allows only
// 5,000 calls a day for the whole org (limit hit on 18-Nov-2026).
const soCache = new Map(); // number → { at, value }
const SO_TTL = 600_000;

// Look one SO up by its number. Returns null when Zoho has no such SO.
export async function getSalesOrderByNumber(raw) {
  const number = normaliseSoNumber(raw);
  if (!number) return null;
  const hit = soCache.get(number);
  if (hit && Date.now() - hit.at < SO_TTL) return hit.value;
  const list = await zohoGet("/salesorders", { salesorder_number: number, per_page: 5 });
  const match = (list.salesorders || []).find((s) => String(s.salesorder_number).toUpperCase() === number);
  let value = null;
  if (match) {
    const detail = await zohoGet(`/salesorders/${match.salesorder_id}`);
    value = safeSo(detail.salesorder || match, (detail.salesorder || {}).line_items || []);
  }
  soCache.set(number, { at: Date.now(), value });
  return value;
}

// Open SOs dated on/after `since` (YYYY-MM-DD), newest first, without lines.
export async function listOpenSalesOrders({ since, max = 400 } = {}) {
  const out = [];
  for (let page = 1; page <= 10 && out.length < max; page++) {
    const data = await zohoGet("/salesorders", {
      filter_by: "Status.Open", date_start: since, per_page: 200, page, sort_column: "date", sort_order: "D",
    });
    for (const s of data.salesorders || []) out.push(safeSo(s));
    if (!data.page_context?.has_more_page) break;
  }
  return out.slice(0, max);
}

// Every SO (any status but void) dated on/after `since`, newest first, without
// lines. Used by the "new SOs with no job" check.
export async function listSalesOrdersSince(since, { max = 400 } = {}) {
  const out = [];
  for (let page = 1; page <= 10 && out.length < max; page++) {
    const data = await zohoGet("/salesorders", {
      date_start: since, per_page: 200, page, sort_column: "date", sort_order: "D",
    });
    let older = false;
    for (const s of data.salesorders || []) {
      const so = safeSo(s);
      if (so.date && so.date < since) { older = true; continue; } // belt and braces
      if (so.status !== "void") out.push(so);
    }
    if (older || !data.page_context?.has_more_page) break;
  }
  return out.slice(0, max);
}

// ---------- Invoices (WarehouseOS dispatch, 18-Nov-2026) ----------
// Needs scope ZohoBooks.invoices.READ on the same Self Client. Same rule as
// SOs: no rates, amounts, taxes or balances leave this module.

const cf = (inv, key) => {
  const v = inv?.[`${key}_unformatted`] ?? inv?.[key] ?? inv?.custom_field_hash?.[key];
  return v === undefined || v === null ? "" : String(v).trim();
};

function safeInvoice(inv, lines = null) {
  const boxes = Number(cf(inv, "cf_box_qty"));
  return {
    id: String(inv.invoice_id),
    number: inv.invoice_number,
    date: inv.date || null,
    customer: inv.customer_name || "",
    customerId: inv.customer_id ? String(inv.customer_id) : null,
    reference: inv.reference_number || "",
    soNumber: inv.salesorder_number || (inv.salesorders || [])[0]?.salesorder_number || "",
    status: inv.status || "",                          // draft / sent / overdue / paid / void …
    cartons: Number.isFinite(boxes) && boxes > 0 ? boxes : null,
    transport: cf(inv, "cf_mode_of_transport"),
    handledBy: cf(inv, "cf_customer_of"),
    salesperson: inv.salesperson_name || "",
    city: inv.shipping_address?.city || "",
    ewayBillNo: inv.eway_bill_details?.eway_bill_number || "",
    vehicleNo: inv.eway_bill_details?.vehicle_number || "",
    createdAt: inv.created_time || null,
    lines: lines
      ? lines.map((l) => ({
          lineId: String(l.line_item_id),
          itemId: l.item_id ? String(l.item_id) : null,
          name: l.name || "",
          sku: l.sku || "",
          description: l.description || "",
          qty: Number(l.quantity) || 0,
          unit: l.unit || "",
          goods: l.product_type !== "service",
          boxes: Number((l.item_custom_fields || []).find((f) => f.api_name === "cf_no_of_boxes")?.value) || null,
        }))
      : undefined,
  };
}

// Every non-void invoice dated on/after `since` (YYYY-MM-DD), newest first,
// without lines. Drafts are included: goods often load before the invoice is
// final, and the card marks them.
export async function listInvoicesSince(since, { max = 600 } = {}) {
  return cachedList(`inv:${since}:${max}`, () => loadInvoicesSince(since, max));
}

async function loadInvoicesSince(since, max) {
  const out = [];
  for (let page = 1; page <= 10 && out.length < max; page++) {
    const data = await zohoGet("/invoices", {
      date_start: since, per_page: 200, page, sort_column: "date", sort_order: "D",
    });
    let older = false;
    for (const inv of data.invoices || []) {
      const s = safeInvoice(inv);
      if (s.date && s.date < since) { older = true; continue; }
      if (s.status !== "void") out.push(s);
    }
    if (older || !data.page_context?.has_more_page) break;
  }
  return out.slice(0, max);
}

// One invoice with its lines, by Zoho invoice id. Null when Zoho has none.
export async function getInvoiceById(id) {
  if (!/^\d{6,25}$/.test(String(id || ""))) return null;
  try {
    const data = await zohoGet(`/invoices/${id}`);
    return data.invoice ? safeInvoice(data.invoice, data.invoice.line_items || []) : null;
  } catch (e) {
    if (/not exist|invalid|404/i.test(String(e?.message))) return null;
    throw e;
  }
}

// Tick (or untick) the invoice's "Delivery Acknowledgment" box in Zoho when the
// warehouse confirms delivery. Needs ZohoBooks.invoices.UPDATE; callers treat a
// failure as "not synced yet", never as a failed delivery.
export async function setInvoiceDelivered(id, delivered = true) {
  if (!/^\d{6,25}$/.test(String(id || ""))) throw new Error("Bad invoice id");
  const detail = await zohoGet(`/invoices/${id}`);
  const field = (detail.invoice?.custom_fields || []).find((f) => f.api_name === "cf_delivery_acknowledgment");
  if (!field) throw new Error("Zoho invoice has no Delivery Acknowledgment field");
  const body = [{ customfield_id: field.customfield_id, value: !!delivered }];
  try {
    await zohoSend("PUT", `/invoice/${id}/customfields`, body);
  } catch (e) {
    if (isScopeError(e)) throw e;
    await zohoSend("PUT", `/invoices/${id}/customfields`, body);
  }
  return true;
}

// ---------- Purchase orders (Warehouse Inward, 18-Nov-2026) ----------
// Needs scope ZohoBooks.purchaseorders.READ.

const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : null);

function safePo(po, lines = null) {
  const boxes = Number(cf(po, "cf_of_boxes"));
  const address = po.delivery_address?.address || po.delivery_address?.address1 || "";
  return {
    id: String(po.purchaseorder_id),
    number: po.purchaseorder_number,
    date: po.date || null,
    vendor: po.vendor_name || "",
    vendorId: po.vendor_id ? String(po.vendor_id) : null,
    reference: po.reference_number || "",
    status: po.order_status || po.status || "",       // draft / approved / open / billed / cancelled …
    // A ready date before the PO date is a typing slip in Zoho; skip it.
    expectedOn: [isoDate(cf(po, "cf_expection_production_ready_")), isoDate(po.delivery_date)].find((d) => d && (!po.date || d >= po.date)) || null,
    cartons: Number.isFinite(boxes) && boxes > 0 ? boxes : null,
    transport: cf(po, "cf_mode_of_transport"),
    deliverTo: String(address).split("\n")[0].trim(),
    lines: lines
      ? lines.map((l) => ({
          lineId: String(l.line_item_id),
          itemId: l.item_id ? String(l.item_id) : null,
          name: l.name || "",
          sku: l.sku || "",
          description: l.description || "",
          qty: Number(l.quantity) || 0,
          unit: l.unit || "",
          goods: l.product_type !== "service",
          boxes: Number((l.item_custom_fields || []).find((f) => f.api_name === "cf_no_of_boxes")?.value) || null,
        }))
      : undefined,
  };
}

// Every PO dated on/after `since` that is not cancelled, newest first, no lines.
// Drafts are included: at Aeros most POs are never moved past draft in Zoho.
export async function listPurchaseOrdersSince(since, { max = 400 } = {}) {
  return cachedList(`po:${since}:${max}`, async () => {
    const out = [];
    for (let page = 1; page <= 10 && out.length < max; page++) {
      const data = await zohoGet("/purchaseorders", {
        date_start: since, per_page: 200, page, sort_column: "date", sort_order: "D",
      });
      let older = false;
      for (const po of data.purchaseorders || []) {
        const s = safePo(po);
        if (s.date && s.date < since) { older = true; continue; }
        if (!/cancel/i.test(s.status)) out.push(s);
      }
      if (older || !data.page_context?.has_more_page) break;
    }
    return out.slice(0, max);
  });
}

// One PO with its lines, by Zoho id. Null when Zoho has none.
export async function getPurchaseOrderById(id) {
  if (!/^\d{6,25}$/.test(String(id || ""))) return null;
  try {
    const data = await zohoGet(`/purchaseorders/${id}`);
    return data.purchaseorder ? safePo(data.purchaseorder, data.purchaseorder.line_items || []) : null;
  } catch (e) {
    if (/not exist|invalid|404/i.test(String(e?.message))) return null;
    throw e;
  }
}

// The invoice list does not say which sales order an invoice belongs to; only
// the invoice itself does. Look it up once per invoice and remember it, a few
// at a time so a long list cannot flood Zoho.
const soByInvoice = new Map(); // invoice id → SO number ("" when none)
export async function salesOrderNumbersFor(invoiceIds, { max = 40 } = {}) {
  const todo = invoiceIds.filter((id) => !soByInvoice.has(id)).slice(0, max);
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(todo.slice(i, i + 5).map(async (id) => {
      try {
        const data = await zohoGet(`/invoices/${id}`);
        const inv = data.invoice || {};
        soByInvoice.set(id, inv.salesorder_number || (inv.salesorders || [])[0]?.salesorder_number || "");
      } catch { /* leave unknown; the Load panel still reads it */ }
    }));
  }
  return new Map(invoiceIds.filter((id) => soByInvoice.has(id)).map((id) => [id, soByInvoice.get(id)]));
}
