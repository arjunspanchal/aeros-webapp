import { getSession, requireInternal, requireManager } from "@/lib/auth/session";
import { createStandaloneCoa, coaDefaultsForSku, searchCoaProducts } from "@/lib/factoryos/coa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// COAs made without a job. GET ?q= searches the catalogue for the product
// picker; GET ?sku= returns the pre-filled sheet for that product.
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  if (sp.get("sku")) return Response.json({ defaults: await coaDefaultsForSku(sp.get("sku")) });
  return Response.json({ products: await searchCoaProducts(sp.get("q")) });
}

export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireManager(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    return Response.json({ coa: await createStandaloneCoa(body, { email: session.email || session.name || null }) });
  } catch (e) {
    return Response.json({ error: e?.message || "Could not save COA" }, { status: 400 });
  }
}
