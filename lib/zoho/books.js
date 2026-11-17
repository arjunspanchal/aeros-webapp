// Zoho Books — READ-ONLY reader for sales orders (Arjun, 18-Nov-2026:
// "connect zoho api with factory OS where it can read SO numbers").
//
// Server-only. Uses a Self Client refresh token with the single scope
// ZohoBooks.salesorders.READ, so this code cannot create, change or close
// anything in Zoho. Credentials live in env (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET,
// ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID, ZOHO_ACCOUNTS_URL, ZOHO_API_URL), set by
// scripts/zoho-connect.sh.
//
// No rates or amounts ever leave this module (no rates in FactoryOS,
// 17-Nov-2026): only SO number, date, customer, status, reference and item
// names / quantities. Import this from server code (routes, server pages) only.

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";
const API = process.env.ZOHO_API_URL || "https://www.zohoapis.in";
const ORG = process.env.ZOHO_ORG_ID || "60004253439";

export function zohoConfigured() {
  return !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);
}

// Access tokens last an hour; Zoho rate-limits token refreshes, so cache one
// per server instance and share an in-flight refresh.
let tokenCache = { token: null, expiresAt: 0, pending: null };

async function accessToken() {
  if (!zohoConfigured()) throw new Error("Zoho is not connected (missing ZOHO_* settings)");
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 120_000) return tokenCache.token;
  if (tokenCache.pending) return tokenCache.pending;
  tokenCache.pending = (async () => {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    });
    const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: "POST", body: params, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error(`Zoho sign-in failed: ${data.error || res.status}`);
    tokenCache.token = data.access_token;
    tokenCache.expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    return tokenCache.token;
  })();
  try { return await tokenCache.pending; } finally { tokenCache.pending = null; }
}

async function zohoGet(path, query = {}) {
  const url = new URL(`${API}/books/v3${path}`);
  url.searchParams.set("organization_id", ORG);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const run = async () => fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}` }, cache: "no-store" });
  let res = await run();
  if (res.status === 401) { tokenCache = { token: null, expiresAt: 0, pending: null }; res = await run(); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.code !== undefined && data.code !== 0)) throw new Error(`Zoho: ${data.message || res.status}`);
  return data;
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

const soCache = new Map(); // number → { at, value }
const SO_TTL = 60_000;

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
