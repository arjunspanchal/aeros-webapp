// Runtime-agnostic policy helpers — pure JS over plain session objects.
// Phase 1.4a of auth unification: extracted from lib/auth/session.js so the
// edge runtime (middleware) can import these without dragging in next/headers
// or node:crypto.
//
// This module must NOT import next/headers, node:crypto, Buffer, fs, path,
// or anything from lib/hub/auth.js. Verified at PR time:
//   grep -rEn "next/headers|node:crypto|Buffer|require\\('fs'\\)" lib/auth/policy.js
//   → zero hits
//
// The policy helpers operate on the unified session shape produced by
// `shape(payload)` below: `{ id, email, name, isAdmin, modules }`. Same
// shape lib/auth/session.js#getSession returns.

import { ROLES, MODULES } from "./roles";

// Derived role sets. Single declaration so "manager" and "internal" mean the
// same thing wherever they're checked.
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
// hub cookie today (verify-otp / admin-login sign only `{ email, name,
// isAdmin, modules }`). Reserved for a later phase when `id` lands in the
// cookie payload.
export function shape(payload) {
  if (!payload) return null;
  return {
    id: payload.id ?? payload.userId ?? null,
    email: payload.email ?? null,
    name: payload.name ?? null,
    isAdmin: !!payload.isAdmin,
    modules: payload.modules || {},
  };
}

// Accepts either the hub-level isAdmin (granted via password admin flow)
// OR a factoryos module role of 'admin' (granted via users.factoryos_role
// resolved at OTP sign-in). These are two legitimate paths to top-level
// admin in the current system; conflating them preserves legacy
// master-papers gate semantics. If we later need to distinguish "hub
// owner" from "factoryos-scoped admin", introduce a separate helper
// rather than tightening this one.
export function requireAdminStrict(session) {
  if (!session) return false;
  if (session.isAdmin === true) return true;
  if (session.modules?.factoryos === "admin") return true;
  return false;
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

// True if the user has the named module entitlement at any role level.
// Mirrors lib/hub/session.js#hasModule. Duplicated here so policy.js stays
// dependency-free; PR 1.5 collapses lib/hub/session.js entirely.
export function hasModule(session, mod) {
  return !!session?.modules?.[mod];
}

// True if the user has access to at least one module. Admin always true.
// Mirrors lib/hub/session.js#hasAnyAccess.
export function hasAnyAccess(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  return Object.values(session.modules || {}).some(Boolean);
}

// Re-export the role + module enums so callers only need one import for
// "everything policy-related".
export { ROLES, MODULES };
