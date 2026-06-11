// Aeros Products Master — admin-only endpoint for the rate-card item picker.
// Reads the same catalog base the public /catalog page uses.

import { getSession, requireRole, requireAdminStrict } from "@/lib/auth/session";
import { fetchCatalogLite } from "@/lib/catalog";

export const runtime = "nodejs";
// Reads cookies via getSession() — opt out of static prerendering so Vercel
// doesn't try to invoke the handler at build time (where there's no request
// context).
export const dynamic = "force-dynamic";

function isRateCardAdmin(session) {
  return requireAdminStrict(session) || requireRole(session, "rate_cards", "admin");
}

export async function GET() {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!isRateCardAdmin(session)) return new Response("Forbidden", { status: 403 });
  try {
    // Lite fetch: the picker needs identity + spec fields to pre-fill, not
    // photos/pricing — fetchCatalog() fires a photos query per product
    // (~600 round trips). specFields adds the 6 spec columns to the one
    // query, matching the 13-field shape this endpoint has always returned.
    const products = await fetchCatalogLite({ specFields: true });
    return Response.json(products);
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
