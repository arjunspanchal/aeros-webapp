import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { dbSelect } from "@/lib/db/supabase.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dieline/cups — paper cup SKUs with their catalog specs, for the
// dieline generator's "load from catalog" picker. Session-gated like the
// /design pages. Plain (non -CUST) SKUs only; the client dedupes sizes.
export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const rows = await dbSelect("master_products", {
      select: "sku,product_name,size_volume,top_diameter_mm,bottom_diameter_mm,height_mm",
      filter: { category: "eq.Paper Cups" },
      order: "sku.asc",
    });
    const cups = (rows || [])
      .filter((r) => !/-CUST$/.test(r.sku))
      .map((r) => ({
        sku: r.sku,
        name: r.product_name,
        size: r.size_volume,
        td: r.top_diameter_mm ? +r.top_diameter_mm : null,
        bd: r.bottom_diameter_mm ? +r.bottom_diameter_mm : null,
        h: r.height_mm ? +r.height_mm : null,
      }));
    return NextResponse.json({ cups });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Load failed" }, { status: 500 });
  }
}
