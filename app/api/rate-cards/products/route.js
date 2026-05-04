// Aeros Products Master — admin-only endpoint for the rate-card item picker.
// Reads the same catalog base the public /catalog page uses.

import { getSession, requireRole, requireAdminStrict } from "@/lib/auth/session";
import { fetchCatalog } from "@/lib/catalog";

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
    const products = await fetchCatalog();
    // Slim the payload — we only need identity + spec fields to pre-fill.
    const slim = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      productName: p.productName,
      category: p.category,
      subCategory: p.subCategory,
      sizeVolume: p.sizeVolume,
      material: p.material,
      gsm: p.gsm,
      wallType: p.wallType,
      coating: p.coating,
      unitsPerCase: p.unitsPerCase,
      cartonDimensions: p.cartonDimensions,
      colour: p.colour,
    }));
    return Response.json(slim);
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
