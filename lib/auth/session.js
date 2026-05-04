// Unified session helper — the single canonical reader for the hub session
// cookie across every module. Phase 1.1 of the auth-unification work: purely
// additive. NO consumer migrates here yet; lib/calc/session.js,
// lib/factoryos/session.js, and lib/rate-cards/auth.js continue to be the
// in-use helpers until subsequent phases swap them out.
//
// The hub cookie (`aeros_hub_session`) already carries the entitlement shape
// this module surfaces. Underlying signing + entitlement-resolution logic
// lives in lib/hub/auth.js + lib/hub/users.js — this file is a thin adapter.

import { cookies } from "next/headers";
import { verifySession, COOKIE } from "@/lib/hub/auth";
import { hasModule, hasAnyAccess } from "@/lib/hub/session";
import { ROLES, MODULES } from "./roles";

// Derived role sets. Single declaration so "manager" and "internal" mean the
// same thing wherever they're checked. Today every consumer of these
// concepts inlines its own disjunction — see lib/factoryos/session.js
// (`canManage`) and lib/factoryos/constants.js (`isInternalRole`).
const MANAGER_ROLES = new Set([ROLES.ADMIN, ROLES.FACTORY_MANAGER]);
const INTERNAL_ROLES = new Set([
  ROLES.ADMIN,
  ROLES.FACTORY_MANAGER,
  ROLES.FACTORY_EXECUTIVE,
  ROLES.ACCOUNT_MANAGER,
]);

// Normalize the raw verified hub cookie payload into the unified shape
// callers will use going forward. Returns null when there is no valid session.
//
// `id` is sourced from `payload.id ?? payload.userId` — neither lives in the
// hub cookie today (see app/api/auth/verify-otp/route.js and
// app/api/auth/admin/route.js, which sign only `{ email, name, isAdmin,
// modules }`). The field is reserved here so a later phase can start
// minting `id` into the cookie without changing this contract.
function shape(payload) {
  if (!payload) return null;
  return {
    id: payload.id ?? payload.userId ?? null,
    email: payload.email ?? null,
    name: payload.name ?? null,
    isAdmin: !!payload.isAdmin,
    modules: payload.modules || {},
  };
}

// Reads the hub session cookie and returns the unified session, or null.
// Same source of truth as lib/hub/session.js — this is not a second cookie.
export function getSession() {
  const token = cookies().get(COOKIE)?.value;
  return shape(verifySession(token));
}

// Thin alias for getSession(). Provided as a vocabulary shift for callers
// that today import a `requireSession()` from a per-module helper. Unlike
// the per-module versions, this never throws and never redirects — the
// caller decides what null means in its context.
export function requireSession() {
  return getSession();
}

// Strict admin: only the hub-level admin entitlement passes. Mirrors what
// today's `lib/calc/session.js#requireAdmin` enforces (admin password →
// admin cookie), without the misleading factoryos broadening.
export function requireAdminStrict(session) {
  return !!session?.isAdmin;
}

// "Manager" = admin OR Factory Manager. Replaces today's misleadingly-named
// `requireAdmin` in lib/factoryos/session.js (which actually permits FM
// despite the name).
export function requireManager(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  return MANAGER_ROLES.has(session.modules?.factoryos);
}

// Any internal Aeros role: admin / factory manager / factory executive /
// account manager. Customer is excluded. Replaces `isInternalRole` and
// `requireInternal` from the factoryos module.
export function requireInternal(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  return INTERNAL_ROLES.has(session.modules?.factoryos);
}

// Generic per-module role check. Strict equality on the role string within
// the requested module — does NOT auto-pass hub admin via a special case.
// Hub admins still resolve naturally because `adminEntitlements()` in
// lib/hub/users.js grants every module an admin role at sign-in time, so
// `requireRole(s, "calculator", "admin")` returns true for admins via the
// normal modules path. Avoiding an isAdmin shortcut keeps role-specific
// negative checks (e.g. `requireRole(s, "factoryos", "customer")`) honest.
export function requireRole(session, module, role) {
  if (!session) return false;
  return session.modules?.[module] === role;
}

// Re-exports so callers only need a single import for everything auth-related.
export { hasModule, hasAnyAccess };
export { ROLES, MODULES };
