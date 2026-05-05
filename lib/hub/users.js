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

const FACTORYOS_ROLES = new Set(["admin", "account_manager", "factory_manager", "factory_executive", "customer"]);
const CALC_ROLES = new Set(["admin", "client"]);

export async function resolveEntitlements(email) {
  // Embed user_clients → clients to get linked client airtable_ids in one
  // round-trip (the value existing session-cookie consumers expect).
  const rows = await dbSelect("users", {
    select: "id,airtable_id,email,name,active,factoryos_role,calculator_role,margin_pct,user_clients(client_id,clients(airtable_id))",
    filter: { email: `eq.${email.toLowerCase()}` },
    limit: 1,
  });
  const row = rows[0];
  if (!row) return null;
  if (row.active === false) return null;

  const r = normRole(row.factoryos_role);
  const c = normRole(row.calculator_role);
  const orders = r && FACTORYOS_ROLES.has(r) ? r : null;
  // Account Managers get default client-level calc + rate-cards if no explicit calc role.
  const calc = (c && CALC_ROLES.has(c) ? c : null) || (orders === "account_manager" ? "client" : null);
  if (!calc && !orders) return null;

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
      rate_cards: calc,
    },
    calcMarginPct: typeof row.margin_pct === "number" ? row.margin_pct : null,
    factoryosUserId: row.airtable_id || row.id,
    factoryosClientIds: clientIds,
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
    },
    calcMarginPct: null,
    factoryosUserId: null,
    factoryosClientIds: [],
  };
}
