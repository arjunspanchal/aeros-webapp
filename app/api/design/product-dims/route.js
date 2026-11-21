import { getSession, requireInternal } from "@/lib/auth/session";
import { dbSelect } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sizes for a CUSTOMER PROOF come from the product list (master_products), never from a die or a 3D model
// (house rule, 5-Nov-2026). GET ?prefix=PC-DW  -> the rows whose SKU starts with it, with their sizes. Staff only.
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  const prefix = (new URL(req.url).searchParams.get("prefix") || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 12);
  if (prefix.length < 2) return Response.json({ error: "Give the start of a SKU." }, { status: 400 });
  try {
    const rows = await dbSelect("master_products", { select: "sku,product_name,top_diameter_mm,bottom_diameter_mm,height_mm", filter: { sku: `ilike.${prefix}*` }, order: "sku", limit: 200 });
    return Response.json({ products: rows.map((r) => ({ sku: r.sku, name: r.product_name, td: +r.top_diameter_mm || null, bd: +r.bottom_diameter_mm || null, h: +r.height_mm || null })) });
  } catch (e) { console.error(e); return Response.json({ error: e.message || "Failed" }, { status: 500 }); }
}
