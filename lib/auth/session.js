// Node-runtime adapter for the unified hub session — used by route handlers
// and server components. Pairs with lib/auth/edge.js, which is the
// edge-runtime adapter used by middleware (PR 1.4b).
//
// Phase 1.4a of auth unification: the policy helpers (requireAdminStrict,
// requireManager, requireInternal, requireRole, hasModule, hasAnyAccess)
// moved to lib/auth/policy.js so they can be imported from the edge runtime
// without dragging in next/headers or node:crypto. This file's exported
// surface is unchanged — every symbol that was exported before is still
// exported here, either defined locally (getSession, requireSession) or
// re-exported from policy.js. The ~50 consumers from PRs 1.2 / 1.3a / 1.3b /
// 1.3c don't have to change any imports.
//
// IMPORTANT: getSession remains SYNCHRONOUS in this PR. The natural target
// would have been the async `verifyToken` from lib/auth/verify.js (WebCrypto-
// based, edge-portable), but switching would have broken every existing
// caller that does `const session = getSession()` without `await`. Promises
// are truthy, so `if (!session)` would pass while role checks against
// `session.modules` would silently fail-closed (403s on every authenticated
// request). Auditing all ~50 call sites for missing `await` is outside the
// scope of "pure refactor that preserves the exported surface" — punt to a
// follow-up.
//
// Concretely: getSession continues to read via lib/hub/auth.js#verifySession
// (Node, sync, node:crypto-backed). lib/auth/edge.js + lib/auth/verify.js
// (WebCrypto, async) live alongside for middleware. Both verifiers operate
// on the same wire format with the same SESSION_SECRET, so they validate
// the same cookies — they're functionally interchangeable, just on
// different runtimes.

import { cookies } from "next/headers";
import { verifySession, COOKIE } from "@/lib/hub/auth";
import { shape } from "./policy";

// Reads the hub session cookie and returns the unified session, or null.
// Synchronous — see file header for why.
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

// Re-export the full policy surface so consumers keep a single import path.
// The function bodies live in lib/auth/policy.js (runtime-agnostic).
export {
  requireAdminStrict,
  requireManager,
  requireInternal,
  requireRole,
  hasModule,
  hasAnyAccess,
  ROLES,
  MODULES,
} from "./policy";
