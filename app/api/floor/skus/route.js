// Public SKU picker for the operator page: recent SKUs for the chosen line
// (quick-pick chips) + a searchable slice of the master catalogue. Server-side
// search keeps the payload small (the catalogue is ~750 SKUs).
import { recentSkusForCategory } from "@/lib/factoryos/floor";
import { fetchCatalogLite } from "@/lib/catalog";
import { currentEmployee } from "@/lib/factoryos/floorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!currentEmployee()) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "";
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    const [recent, all] = await Promise.all([
      recentSkusForCategory(category).catch(() => []),
      fetchCatalogLite().catch(() => []),
    ]);

    let list = all;
    if (q) {
      list = all.filter((p) =>
        `${p.productName} ${p.sku} ${p.category} ${p.sizeVolume}`.toLowerCase().includes(q),
      );
    }
    // Cap to keep the response light; the operator searches to narrow.
    const results = list.slice(0, 60).map((p) => ({
      id: p.id,
      productName: p.productName,
      sku: p.sku,
      category: p.category,
      sizeVolume: p.sizeVolume,
    }));
    return Response.json({ recent, results, total: list.length });
  } catch (e) {
    console.error("floor skus", e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
