import { listStockPosition } from "@/lib/warehouse/inventory";
import { listingCategoryFor, NOT_IN_LISTING } from "@/lib/warehouse/categories";
import { dbSelect } from "@/lib/db/supabase";
import StockClient from "./StockClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock — Warehouse" };

// What is on the racks right now. Quantities only, no rates.
export default async function StockPage() {
  let rows = [];
  let error = "";
  try { rows = await listStockPosition(); } catch (e) { error = e.message; }
  // parent_sku is not on the stock view; read it from the items.
  const parents = await dbSelect("inventory_items", { select: "id,parent_sku", filter: { is_active: "eq.true" }, limit: 10000 }).catch(() => []);
  const parentBy = new Map(parents.map((p) => [p.id, p.parent_sku]));
  const cats = await listingCategoryFor(rows.map((r) => ({ parent_sku: parentBy.get(r.item_id) || null, category: r.category })));
  const stock = rows.map((r, i) => ({
    id: r.item_id, sku: r.sku, name: r.name, category: cats[i].category, subCategory: cats[i].subCategory || "",
    linked: cats[i].linked, customer: r.brand_customer || "",
    uom: r.uom || "pcs", source: r.source || "", qty: Number(r.total_qty) || 0,
    racks: Object.entries(r.by_location || {}).map(([code, q]) => ({ code, qty: Number(q) || 0 })).filter((x) => x.qty !== 0).sort((a, b) => b.qty - a.qty),
    lastMoved: r.last_movement_at || null, needsReview: !!r.needs_review,
  }));
  return <StockClient stock={stock} error={error} notInListing={NOT_IN_LISTING} />;
}
