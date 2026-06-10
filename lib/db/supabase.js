// Server-side Supabase REST + RPC helpers. No SDK dependency — direct fetch.
// All callers run in Node.js routes/Server Components and use the service-role
// key (RLS bypassed; never exposed to the browser).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function ensureConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local or your Vercel Environment Variables."
    );
  }
}

const headers = () => ({
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
});

export function getSupabaseUrl() {
  ensureConfig();
  return SUPABASE_URL;
}

/**
 * SELECT against PostgREST.
 *   await dbSelect("jobs", { select: "id,j_number,client_id", filter: { stage: "eq.RM Pending" }, order: "j_number.desc", limit: 50 })
 * Filters use PostgREST syntax: "eq.value", "in.(a,b,c)", "gt.5", "is.null", etc.
 */
export async function dbSelect(table, opts = {}) {
  ensureConfig();
  const { select = "*", filter = {}, order, limit, range } = opts;
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set("select", select);
  for (const [col, expr] of Object.entries(filter)) url.searchParams.append(col, expr);
  if (order) url.searchParams.set("order", order);
  if (limit) url.searchParams.set("limit", String(limit));
  const res = await fetch(url, {
    headers: { ...headers(), ...(range ? { Range: range, "Range-Unit": "items" } : {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase select ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Cheap exact-count for a table. Uses PostgREST's `count=exact` Prefer
 * header with a tiny range so no rows are transferred. Returns 0 on
 * error so home tiles never blow up the page if a table is empty or
 * filtered out.
 *   await dbCount("jobs", { stage: "neq.Delivered" })
 */
export async function dbCount(table, filter = {}) {
  ensureConfig();
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set("select", "id");
    for (const [col, expr] of Object.entries(filter)) url.searchParams.append(col, expr);
    const res = await fetch(url, {
      headers: {
        ...headers(),
        Range: "0-0",
        "Range-Unit": "items",
        Prefer: "count=exact",
      },
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const cr = res.headers.get("content-range") || "";
    const total = cr.split("/")[1];
    const n = total ? parseInt(total, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function dbInsert(table, rows, opts = {}) {
  ensureConfig();
  const { onConflict, returning = "representation" } = opts;
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (onConflict) url.searchParams.set("on_conflict", onConflict);
  const prefer = onConflict
    ? `return=${returning},resolution=merge-duplicates`
    : `return=${returning}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json", Prefer: prefer },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase insert ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
  if (returning === "minimal") return null;
  const out = await res.json();
  return Array.isArray(rows) ? out : out[0];
}

export async function dbUpdate(table, filterCol, filterVal, patch, opts = {}) {
  ensureConfig();
  const { returning = "representation" } = opts;
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set(filterCol, `eq.${filterVal}`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...headers(), "Content-Type": "application/json", Prefer: `return=${returning}` },
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase update ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
  if (returning === "minimal") return null;
  const out = await res.json();
  return out[0] || null;
}

export async function dbDelete(table, filterCol, filterVal) {
  ensureConfig();
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set(filterCol, `eq.${filterVal}`);
  const res = await fetch(url, {
    method: "DELETE",
    headers: { ...headers(), Prefer: "return=minimal" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase delete ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
}

/** Call a Postgres function via PostgREST `/rpc/<name>`. */
export async function dbRPC(fnName, params = {}) {
  ensureConfig();
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(params),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase rpc ${fnName} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// ---- Identifier helpers ----------------------------------------------------
// During the cutover, public-facing IDs may be either Airtable record IDs
// (recXXX, ~17 chars) for rows imported from Airtable, OR Postgres UUIDs for
// rows created post-cutover. These helpers paper over the difference so URLs
// and cookies that include either format keep working.

export function isAirtableId(id) {
  return typeof id === "string" && /^rec[A-Za-z0-9]{14}$/.test(id);
}

/** PG filter-column for an arbitrary public id. */
export function idFilterCol(id) {
  return isAirtableId(id) ? "airtable_id" : "id";
}

/** Look up a single row by public id (Airtable rec or PG uuid). */
export async function findOne(table, publicId, select = "*") {
  if (!publicId) return null;
  const rows = await dbSelect(table, {
    select,
    filter: { [idFilterCol(publicId)]: `eq.${publicId}` },
    limit: 1,
  });
  return rows[0] || null;
}

/** Public id surfaced to the UI. Prefer airtable_id (recXXX) when present so
 *  legacy URLs/cookies keep resolving; fall back to PG uuid for new rows. */
export function publicId(row) {
  if (!row) return null;
  return row.airtable_id || row.id || null;
}
