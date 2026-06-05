// Emission · Service OS — thin PostgREST / RPC / Storage client (browser).
// Matches the host app's no-SDK fetch style, but runs CLIENT-SIDE with the
// user's minted emission JWT in Authorization. PostgREST SET ROLEs into
// emission_staff / emission_admin from the token's `role` claim, so RLS + the
// column-grant money wall enforce everything. apikey is the public anon key.
import { REST_URL, FN_URL, STORAGE_URL, ANON_KEY, SCHEMA } from "./config";

class EmissionError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function baseHeaders(token) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token || ANON_KEY}`,
  };
}

function restHeaders(token, extra = {}) {
  return {
    ...baseHeaders(token),
    "Accept-Profile": SCHEMA,
    "Content-Profile": SCHEMA,
    ...extra,
  };
}

async function handle(res, label) {
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch {}
    throw new EmissionError(`${label} failed (${res.status}): ${detail.slice(0, 240)}`, res.status);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export async function select(table, opts = {}, token) {
  const { select = "*", filter = {}, order, limit } = opts;
  const url = new URL(`${REST_URL}/${table}`);
  url.searchParams.set("select", select);
  for (const [col, expr] of Object.entries(filter)) url.searchParams.append(col, expr);
  if (order) url.searchParams.set("order", order);
  if (limit) url.searchParams.set("limit", String(limit));
  const res = await fetch(url, { headers: restHeaders(token), cache: "no-store" });
  return handle(res, `select ${table}`);
}

// opts.select limits RETURNING to columns the role may SELECT — REQUIRED for
// staff writes to `jobs` / `warranty_claims`, else RETURNING * 403s on the
// financial columns staff lack grants for.
export async function insert(table, rows, token, opts = {}) {
  const { returning = "representation", select } = opts;
  const url = new URL(`${REST_URL}/${table}`);
  if (select) url.searchParams.set("select", select);
  const res = await fetch(url, {
    method: "POST",
    headers: restHeaders(token, { "Content-Type": "application/json", Prefer: `return=${returning}` }),
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    cache: "no-store",
  });
  const out = await handle(res, `insert ${table}`);
  if (returning === "minimal") return null;
  return Array.isArray(rows) ? out : (out && out[0]) || null;
}

export async function update(table, filterCol, filterVal, patch, token, opts = {}) {
  const { select } = opts;
  const url = new URL(`${REST_URL}/${table}`);
  url.searchParams.set(filterCol, `eq.${filterVal}`);
  if (select) url.searchParams.set("select", select);
  const res = await fetch(url, {
    method: "PATCH",
    headers: restHeaders(token, { "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  const out = await handle(res, `update ${table}`);
  return (out && out[0]) || null;
}

export async function rpc(fn, params, token) {
  const res = await fetch(`${REST_URL}/rpc/${fn}`, {
    method: "POST",
    headers: restHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(params || {}),
    cache: "no-store",
  });
  return handle(res, `rpc ${fn}`);
}

// PUBLIC status lookup — anon, no session token (uses anon key only).
export async function publicLookup(jobNo, phone) {
  const res = await fetch(`${REST_URL}/rpc/lookup_job_status`, {
    method: "POST",
    headers: restHeaders(null, { "Content-Type": "application/json" }),
    body: JSON.stringify({ p_job_no: Number(jobNo), p_phone: String(phone) }),
    cache: "no-store",
  });
  return handle(res, "lookup_job_status");
}

// ---- Edge functions --------------------------------------------------------
export async function callFunction(name, body, token) {
  const res = await fetch(`${FN_URL}/${name}`, {
    method: "POST",
    headers: { ...baseHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ---- Storage (private buckets) --------------------------------------------
export async function uploadObject(bucket, path, fileOrBlob, token, contentType) {
  const res = await fetch(`${STORAGE_URL}/object/${bucket}/${encodeURI(path)}`, {
    method: "POST",
    headers: {
      ...baseHeaders(token),
      "Content-Type": contentType || fileOrBlob.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: fileOrBlob,
    cache: "no-store",
  });
  return handle(res, `upload ${bucket}`);
}

export async function signedUrl(bucket, path, token, expiresIn = 3600) {
  const res = await fetch(`${STORAGE_URL}/object/sign/${bucket}/${encodeURI(path)}`, {
    method: "POST",
    headers: { ...baseHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
    cache: "no-store",
  });
  const data = await handle(res, `sign ${bucket}`);
  return data && data.signedURL ? `${STORAGE_URL}${data.signedURL}` : null;
}

export { EmissionError };
