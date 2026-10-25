// Session-revocation check. Sessions are HMAC-signed cookies valid for 30
// days; modules + roles get baked in at sign-in time. When admin toggles
// access in /admin/access (or any AccessAdmin PATCH that changes a role
// or active flag), we bump users.session_invalidated_at to now(). This
// helper compares the cookie's iat against that timestamp — if iat
// predates it, the session is stale and the caller should force re-login.
//
// Edge-runtime-safe: uses fetch (no node:crypto, no next/headers). Both
// middleware (edge) and Node-runtime page guards can call this.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Middleware runs this on every gated page AND API request, and each lookup
// is a round trip to the database — so remember each user's
// session_invalidated_at for a short while per instance. A revocation in
// /admin/access therefore takes effect within CACHE_TTL_MS instead of
// instantly. Only successful lookups are cached; network errors stay
// fail-open and uncached.
const CACHE_TTL_MS = 60_000;
const invalidatedAtCache = new Map(); // email → { ts, at }

// `null` (no override) and a missing column both mean "never invalidated"
// → cookie is fresh by default. Only an explicit timestamp greater than
// the cookie's iat marks it stale.
export async function isSessionStale(payload) {
  if (!payload?.email || !payload?.iat) return false;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;

  const email = String(payload.email).toLowerCase();
  const hit = invalidatedAtCache.get(email);
  const ts = hit && Date.now() - hit.at < CACHE_TTL_MS
    ? hit.ts
    : await fetchInvalidatedAt(email);
  if (ts === undefined) return false; // lookup failed → fail-open
  if (!ts) return false;
  const invalidatedSec = Math.floor(new Date(ts).getTime() / 1000);
  return payload.iat < invalidatedSec;
}

// Returns the timestamp (or null when never invalidated), or undefined when
// the lookup itself failed.
async function fetchInvalidatedAt(email) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/users`);
  url.searchParams.set("select", "session_invalidated_at");
  url.searchParams.set("email", `eq.${email}`);
  url.searchParams.set("limit", "1");

  let res;
  try {
    res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: "no-store",
    });
  } catch {
    // Fail-open on network errors so a Supabase blip doesn't lock everyone
    // out — admin can still revoke by toggling Active.
    return undefined;
  }
  if (!res.ok) return undefined;
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows)) return undefined;
  const ts = rows[0]?.session_invalidated_at || null;
  if (invalidatedAtCache.size > 500) invalidatedAtCache.clear();
  invalidatedAtCache.set(email, { ts, at: Date.now() });
  return ts;
}
