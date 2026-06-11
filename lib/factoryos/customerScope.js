// Customer-scope helpers for the customer portal. A customer user can be
// linked to multiple client records (Brewbay, Testing Grounds, Wellbeing
// Exports, etc.); without a picker their orders all dump into one list,
// which is confusing. This module manages the *active* client — the single
// one the customer is currently working with — backed by a cookie.

import { cookies } from "next/headers";

export const ACTIVE_CLIENT_COOKIE = "aeros_customer_client";

// Read the cookie-scoped active client id, falling back to the first linked
// client if nothing is set or the stored choice no longer exists in the
// caller's linked-clients list. Returns null when the caller has no linked
// clients at all (a misconfigured account).
export function getActiveClientId(linkedClientIds) {
  if (!Array.isArray(linkedClientIds) || linkedClientIds.length === 0) return null;
  const jar = cookies();
  const raw = jar.get(ACTIVE_CLIENT_COOKIE)?.value;
  if (raw && linkedClientIds.includes(raw)) return raw;
  return linkedClientIds[0];
}

// Persist the active client id on the cookie jar. Server actions / API
// routes call this. Safe with httpOnly=false so a future client-side picker
// can also write it without round-tripping; for now we keep all writes
// server-side via the active-client API route.
export function setActiveClientId(clientId) {
  const jar = cookies();
  jar.set({
    name: ACTIVE_CLIENT_COOKIE,
    value: String(clientId),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
