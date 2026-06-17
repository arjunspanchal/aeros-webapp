// PackAI restricted Supabase client (server-only).
//
// THE RULE: every /api/packai/* route (and the public chat route) reads the
// database through THIS client and nothing else. It authenticates as the
// `packai_ro` Postgres role, which can SELECT exactly three sanitized views —
// v_packai_catalog, v_packai_pricing, v_packai_clearance — and nothing more.
// Purchase prices, EXW, supplier/vendor/mill names, internal notes and
// raw_fields are excluded at the COLUMN level in those views, so this process
// never holds that data; Postgres (not app code) enforces the boundary.
// Do NOT import lib/db/supabase.js (service role) from any PackAI code path.
//
// Auth: PostgREST switches into the role named in the JWT `role` claim when
// that role is granted to `authenticator` (same mechanism the emission module
// uses). We mint the packai_ro JWT here at runtime from SUPABASE_JWT_SECRET
// (Dashboard → Settings → API → JWT Secret) — short-lived, refreshed before
// expiry, never persisted.

import { createHmac } from "node:crypto";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// The only relations this client will ever query. A typo'd or injected table
// name fails here first — and would fail again at the DB grant if it didn't.
const ALLOWED = new Set([
  "v_packai_catalog",
  "v_packai_pricing",
  "v_packai_clearance",
  "v_packai_knowledge",
]);

const TOKEN_TTL_S = 60 * 60; // 1h, re-minted at 80% of life
let _token = null;
let _tokenExp = 0;

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function mintToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      role: "packai_ro",
      iss: "aeros-packai",
      iat: now,
      exp: now + TOKEN_TTL_S,
    })
  );
  const sig = b64url(
    createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest()
  );
  _token = `${header}.${payload}.${sig}`;
  _tokenExp = now + TOKEN_TTL_S;
  return _token;
}

function token() {
  // Preferred path: assume the packai_ro role via a self-minted JWT.
  // Fallback (no SUPABASE_JWT_SECRET in env yet): the anon key — the three
  // sanitized views carry an explicit anon SELECT grant, and contain only
  // public sell-side data, so reads stay safe. The JWT path becomes
  // mandatory at M1 when advisor-schema writes arrive.
  if (!JWT_SECRET) return ANON_KEY;
  const now = Math.floor(Date.now() / 1000);
  if (!_token || now > _tokenExp - TOKEN_TTL_S * 0.2) return mintToken();
  return _token;
}

function ensureConfig() {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error(
      "PackAI client not configured. Set SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (SUPABASE_JWT_SECRET enables the packai_ro role path)."
    );
  }
}

/**
 * SELECT against one of the three sanitized PackAI views.
 *   await packaiSelect("v_packai_catalog", { select: "id,product_name,sell_price_inr", filter: { category: "eq.Paper Cups" }, limit: 50 })
 * Filters use PostgREST syntax ("eq.x", "ilike.*cup*", "in.(a,b)").
 * Errors are thrown with a generic message; PostgREST detail goes to the
 * server log only (never to the client — schema names don't leak).
 */
export async function packaiSelect(view, opts = {}) {
  ensureConfig();
  if (!ALLOWED.has(view)) {
    throw new Error(`packaiSelect: "${view}" is not a PackAI view`);
  }
  const { select = "*", filter = {}, order, limit } = opts;
  const url = new URL(`${SUPABASE_URL}/rest/v1/${view}`);
  url.searchParams.set("select", select);
  for (const [col, expr] of Object.entries(filter)) url.searchParams.append(col, expr);
  if (order) url.searchParams.set("order", order);
  if (limit) url.searchParams.set("limit", String(limit));

  const res = await fetch(url, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token()}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[packai] select ${view} ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error("PackAI data fetch failed");
  }
  return res.json();
}
