// Emission · Service OS — data layer. Each fn takes the auth session (for the
// token + role) and talks to PostgREST via the thin client. Role decides the
// SELECT column set so staff never request financial columns they lack grants
// for (a `*` select as staff would 403 on those columns).
import * as api from "./client";
import { JOB_STAFF_COLUMNS, CLAIM_STAFF_COLUMNS, TERMINAL_STATUSES } from "./schemas";

const tok = (s) => s?.token;
const isAdmin = (s) => s?.role === "admin";

// ---- staff ----------------------------------------------------------------
export function listStaff(session) {
  return api.select("staff", { select: "id,name,role,active", filter: { active: "eq.true" }, order: "name.asc" }, tok(session));
}

// ---- jobs -----------------------------------------------------------------
export async function listJobs(session, { status } = {}) {
  const cols = isAdmin(session) ? "*" : JOB_STAFF_COLUMNS;
  const filter = {};
  if (status && status !== "all") {
    if (status === "open") filter.status = `not.in.(${TERMINAL_STATUSES.join(",")})`;
    else filter.status = `eq.${status}`;
  }
  const rows = await api.select("jobs", { select: cols, filter, order: "date_received.asc", limit: "1000" }, tok(session));
  // Layout-driven urgency: open jobs first, oldest (most aged) at the very top.
  return rows.sort((a, b) => {
    const at = TERMINAL_STATUSES.includes(a.status) ? 1 : 0;
    const bt = TERMINAL_STATUSES.includes(b.status) ? 1 : 0;
    if (at !== bt) return at - bt;
    return String(a.date_received).localeCompare(String(b.date_received));
  });
}

// Prior jobs for a phone (repeat-customer recognition at intake). Digit-tolerant
// contains-match on the last 10 digits.
export function findJobsByPhone(session, phone) {
  const d = String(phone || "").replace(/\D/g, "").slice(-10);
  if (d.length < 8) return Promise.resolve([]);
  return api.select(
    "jobs",
    { select: "job_no,customer_name,brand,model,status,date_received", filter: { phone: `ilike.*${d}*` }, order: "date_received.desc", limit: "8" },
    tok(session),
  );
}

export async function getJobByNo(session, jobNo) {
  const cols = isAdmin(session) ? "*" : JOB_STAFF_COLUMNS;
  const rows = await api.select("jobs", { select: cols, filter: { job_no: `eq.${Number(jobNo)}` }, limit: "1" }, tok(session));
  return rows[0] || null;
}

const jobSelect = (session) => (isAdmin(session) ? "*" : JOB_STAFF_COLUMNS);

export async function createJob(session, payload) {
  // Strip empty strings to null; never send job_no / financial cols from staff.
  const clean = {};
  for (const [k, v] of Object.entries(payload)) clean[k] = v === "" ? null : v;
  return api.insert("jobs", clean, tok(session), { select: jobSelect(session) });
}

export function updateJob(session, id, patch) {
  return api.update("jobs", "id", id, patch, tok(session), { select: jobSelect(session) });
}

// ---- line items -----------------------------------------------------------
export function listLineItems(session, jobId) {
  return api.select("job_line_items", { select: "*", filter: { job_id: `eq.${jobId}` }, order: "sr_no.asc" }, tok(session));
}
export function addLineItem(session, row) {
  return api.insert("job_line_items", row, tok(session));
}
export function updateLineItem(session, id, patch) {
  return api.update("job_line_items", "id", id, patch, tok(session));
}

// ---- warranty claims ------------------------------------------------------
export async function getClaim(session, jobId) {
  const cols = isAdmin(session) ? "*" : CLAIM_STAFF_COLUMNS;
  const rows = await api.select("warranty_claims", { select: cols, filter: { job_id: `eq.${jobId}` }, limit: "1" }, tok(session));
  return rows[0] || null;
}
export function createClaim(session, jobId) {
  const sel = isAdmin(session) ? "*" : CLAIM_STAFF_COLUMNS;
  return api.insert("warranty_claims", { job_id: jobId }, tok(session), { select: sel });
}
export function updateClaim(session, id, patch) {
  return api.update("warranty_claims", "id", id, patch, tok(session));
}

// ---- job activity timeline (status changes auto-logged + staff notes) ------
export function listJobEvents(session, jobId) {
  return api.select("job_events", { select: "*", filter: { job_id: `eq.${jobId}` }, order: "created_at.desc" }, tok(session));
}
export function addJobNote(session, jobId, note) {
  return api.insert("job_events", { job_id: jobId, event_type: "note", note }, tok(session));
}

// ---- Product catalogue / price list (admin only) --------------------------
// Multi-brand electronics catalogue. Confidential purchase rates — staff tokens
// have NO grant, so these calls 403 for them. Owner-side page only.
// (Table is still named `yamaha_products` for backward-compat; holds all brands.)
export function listProducts(session) {
  return api.select(
    "yamaha_products",
    { select: "*", order: "brand.asc,category.asc,sort_order.asc,model_name.asc" },
    tok(session),
  );
}
export function createProduct(session, row) {
  return api.insert("yamaha_products", row, tok(session), { select: "*" });
}
export function updateProduct(session, id, patch) {
  return api.update("yamaha_products", "id", id, patch, tok(session), { select: "*" });
}
export function deleteProduct(session, id) {
  return api.remove("yamaha_products", "id", id, tok(session));
}

// ---- Vendor / distributor directory (admin only) --------------------------
export function listVendors(session) {
  return api.select("vendors", { select: "*", order: "sort_order.asc,name.asc" }, tok(session));
}
export function createVendor(session, row) {
  return api.insert("vendors", row, tok(session), { select: "*" });
}
export function updateVendor(session, id, patch) {
  return api.update("vendors", "id", id, patch, tok(session), { select: "*" });
}
export function deleteVendor(session, id) {
  return api.remove("vendors", "id", id, tok(session));
}

// ---- dashboard RPCs (admin only) ------------------------------------------
export const dashOpenJobs = (session) => api.rpc("dash_open_jobs", {}, tok(session));
export const dashAgedJobs = (session, ageDays = 15) => api.rpc("dash_aged_jobs", { p_age_days: ageDays }, tok(session));
export const dashClaimsPending = (session) => api.rpc("dash_claims_pending", {}, tok(session));
export const dashRevenueByChannel = (session, from, to) => api.rpc("dash_revenue_by_channel", { p_from: from, p_to: to }, tok(session));
export const dashRevenueByType = (session, from, to) => api.rpc("dash_revenue_by_type", { p_from: from, p_to: to }, tok(session));
