// Edge-runtime adapter for the unified hub session.
//
// Phase 1.4a of auth unification. PR 1.4b migrates middleware.js to import
// `getSessionFromRequest` + the policy helpers from this module, eliminating
// the inline `verify()` + raw `payload.role` literals it has today.
//
// This module must be edge-safe: NO imports of next/headers, node:crypto,
// or Buffer. Importing from "next/server" (NextRequest type) is fine if
// needed; we accept the request duck-typed instead, so no value import
// from next/server is required.
//
// Pairs with lib/auth/session.js (Node adapter for route handlers + server
// components) — same shape returned, same secret, same cookie. The two
// adapters differ only in how they read the cookie (req.cookies.get vs
// next/headers cookies()) and in which crypto runtime verifies the
// signature.

import { verifyToken, COOKIE_NAME } from "./verify";
import { shape } from "./policy";

// Read + verify the hub session cookie from a NextRequest (or any request-
// like object that exposes `cookies.get(name)?.value`). Returns the unified
// session shape on success, or null. Async because WebCrypto is Promise-based.
//
// Usage in middleware:
//   const session = await getSessionFromRequest(req);
//   if (!session) return redirectToLogin(req);
//   if (!requireManager(session)) return NextResponse.redirect(...);
export async function getSessionFromRequest(req) {
  const token = req?.cookies?.get?.(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return shape(payload);
}

// Re-export so middleware has a single import path for "everything I need
// to make a role decision against a NextRequest".
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

export { COOKIE_NAME } from "./verify";
