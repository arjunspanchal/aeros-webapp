// Unified user lookup from Supabase. Single source of truth for entitlements
// across Hub / Calculator / FactoryOS modules.
//
// Cookies still encode Airtable record IDs (recXXX) for back-compat — when a
// user has an `airtable_id`, that's what we surface as `factoryosUserId`.
// New users created post-Airtable use the PG uuid instead. Both work in the
// session-cookie payload.

import { dbSelect } from "../db/supabase.js";

function normRole(v) {
  if (v == null) return null;
  return String(v).toLowerCase().trim().replace(/\s+/g, "_");
}

const FACTORYOS_ROLES = new Set(["admin", "account_manager", "factory_manager", "factory_executive", "customer", "vendor"]);
const CALC_ROLES = new Set(["admin", "client"]);
const HR_ROLES = new Set(["admin"]);

export async function resolveEntitlements(email) {
  // Embed user_clients → clients to get linked client airtable_ids in one
  // round-trip (the value existing session-cookie consumers expect).
  const rows = await dbSelect("users", {
    select: "id,airtable_id,email,name,active,factoryos_role,calculator_role,rate_cards_role,hr_role,margin_pct,vendor_id,user_clients(client_id,clients(airtable_id))",
    filter: { email: `eq.${email.toLowerCase()}` },
    limit: 1,
  });
  const row = rows[0];
  if (!row) return null;
  if (row.active === false) return null;

  const r = normRole(row.factoryos_role);
  const c = normRole(row.calculator_role);
  const rc = normRole(row.rate_cards_role);
  const h = normRole(row.hr_role);
  const orders = r && FACTORYOS_ROLES.has(r) ? r : null;
  const hr = h && HR_ROLES.has(h) ? h : null;
  // Account Managers get default client-level calc + rate-cards if no explicit calc role.
  const calc = (c && CALC_ROLES.has(c) ? c : null) || (orders === "account_manager" ? "client" : null);
  // HR is a standalone entitlement — a user with ONLY hr access still resolves.
  if (!calc && !orders && !hr) return null;

  // Per-user RFQs (rate_cards) gate. Honour an explicit override on the
  // users.rate_cards_role column; fall back to the legacy "anyone with
  // platform access gets it" derive when null so existing accounts don't
  // lose access without a backfill.
  //   'disabled' → no access regardless of other roles
  //   'admin' / 'client' → use it directly
  //   null → derive (account_manager → admin; otherwise mirror calc role)
  let rateCards;
  if (rc === "disabled") {
    rateCards = null;
  } else if (rc === "admin" || rc === "client") {
    rateCards = rc;
  } else {
    rateCards = orders === "account_manager" ? "admin" : calc;
  }

  // Pull airtable_ids from joined rows; fall back to PG uuid for post-Airtable clients.
  const links = Array.isArray(row.user_clients) ? row.user_clients : [];
  const clientIds = links
    .map((l) => l.clients?.airtable_id || l.client_id)
    .filter(Boolean);

  return {
    email: (row.email || email).toLowerCase(),
    name: row.name || email.split("@")[0],
    isAdmin: false,
    modules: {
      calculator: calc,
      factoryos: orders,
      catalogue: "viewer",
      clearance: "viewer",
      rate_cards: rateCards,
      hr,
    },
    calcMarginPct: typeof row.margin_pct === "number" ? row.margin_pct : null,
    factoryosUserId: row.airtable_id || row.id,
    factoryosClientIds: clientIds,
    // Vendor scoping — set only for the 'vendor' role. The vendor portal
    // filters jobs to this vendor record (jobs.printing_vendor_id).
    factoryosVendorId: orders === "vendor" ? row.vendor_id || null : null,
  };
}

// Re-read just the factoryos role from the live users table. Used by the
// /factoryos/admin layout guard to defend against stale 30-day cookies that
// were minted when the user had a higher role than they do today (e.g. a
// downgraded factory_manager → customer would otherwise keep admin access
// until cookie expiry — see PR addressing arjunspanchal@gmail.com leak).
// Returns null when the user isn't found / inactive / has no role.
export async function getCurrentFactoryosRole(email) {
  if (!email) return null;
  const rows = await dbSelect("users", {
    select: "active,factoryos_role",
    filter: { email: `eq.${String(email).toLowerCase()}` },
    limit: 1,
  });
  const row = rows[0];
  if (!row || row.active === false) return null;
  const r = normRole(row.factoryos_role);
  return r && FACTORYOS_ROLES.has(r) ? r : null;
}

// Resolve the factoryos user id (airtable_id preferred, pg uuid fallback)
// for a given email. Mirrors the value that resolveEntitlements() writes
// into the cookie's `factoryosUserId` field at sign-in time, but as a
// live DB lookup — used by HR/attendance code so it keeps working when
// the cookie was minted before PR 1.5a (those tokens don't carry
// factoryosUserId; the value would otherwise read as null and silently
// filter every row out of the manager's roster).
export async function getFactoryosUserIdByEmail(email) {
  if (!email) return null;
  const rows = await dbSelect("users", {
    select: "id,airtable_id,active",
    filter: { email: `eq.${String(email).toLowerCase()}` },
    limit: 1,
  });
  const row = rows[0];
  if (!row || row.active === false) return null;
  return row.airtable_id || row.id;
}

// Cookie-first; DB-fallback. Pass the unified session object.
export async function resolveFactoryosUserId(session) {
  if (!session) return null;
  if (session.factoryosUserId) return session.factoryosUserId;
  return getFactoryosUserIdByEmail(session.email);
}

export function adminEntitlements() {
  return {
    email: null,
    name: "Admin",
    isAdmin: true,
    modules: {
      calculator: "admin",
      factoryos: "admin",
      catalogue: "viewer",
      clearance: "viewer",
      rate_cards: "admin",
      hr: "admin",
    },
    calcMarginPct: null,
    factoryosUserId: null,
    factoryosClientIds: [],
  };
}
