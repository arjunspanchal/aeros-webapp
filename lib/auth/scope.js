// Scoping primitives for FactoryOS jobs/POs. Phase 1.3 Block B — purely
// additive, no callers wired up yet (Blocks C–M land after the 1.5e soak).
//
// `effectiveJobScope` and `effectivePOScope` accept either a unified session
// object (role at `user.modules.factoryos`) or a raw DB row (role at
// `user.factoryos_role`). The dual-shape lookup is isolated to
// `getFactoryosRole` so the rest of the module stays clean.

import { dbSelect } from "../db/supabase.js";

function getFactoryosRole(user) {
  if (!user) return null;
  return user.factoryos_role ?? user.modules?.factoryos ?? null;
}

const ALL_ROLES = new Set(["admin", "factory_manager", "factory_executive"]);
const OWN_ROLES = new Set(["client", "customer"]);

export async function getClientIdsForUser(userId) {
  if (!userId) return [];
  const rows = await dbSelect("user_clients", {
    select: "client_id",
    filter: { user_id: `eq.${userId}` },
  });
  return rows.map((r) => r.client_id).filter(Boolean);
}

export async function getPortfolioClientIdsForAM(userId) {
  if (!userId) return [];
  const rows = await dbSelect("clients", {
    select: "id",
    filter: { account_manager_id: `eq.${userId}` },
  });
  return rows.map((r) => r.id).filter(Boolean);
}

export async function effectiveJobScope(user) {
  if (!user || !user.id) return { mode: "none" };
  const role = getFactoryosRole(user);
  if (!role) return { mode: "none" };
  if (ALL_ROLES.has(role)) return { mode: "all" };
  if (role === "account_manager") {
    const clientIds = await getPortfolioClientIdsForAM(user.id);
    return { mode: "portfolio", clientIds };
  }
  if (OWN_ROLES.has(role)) {
    const clientIds = await getClientIdsForUser(user.id);
    return { mode: "own", clientIds };
  }
  return { mode: "none" };
}

// Separate export so PO-specific rules can diverge later without touching job callers.
export async function effectivePOScope(user) {
  return effectiveJobScope(user);
}
