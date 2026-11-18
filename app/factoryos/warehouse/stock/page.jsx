import { listStockPosition } from "@/lib/warehouse/inventory";
import StockClient from "./StockClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock — Warehouse" };

// What is on the racks right now. Quantities only, no rates.
export default async function StockPage() {
  let rows = [];
  let error = "";
  try { rows = await listStockPosition(); } catch (e) { error = e.message; }
  const stock = rows.map((r) => ({
    id: r.item_id, sku: r.sku, name: r.name, category: r.category || "", customer: r.brand_customer || "",
    uom: r.uom || "pcs", source: r.source || "", qty: Number(r.total_qty) || 0,
    racks: Object.entries(r.by_location || {}).map(([code, q]) => ({ code, qty: Number(q) || 0 })).filter((x) => x.qty !== 0).sort((a, b) => b.qty - a.qty),
    lastMoved: r.last_movement_at || null, needsReview: !!r.needs_review,
  }));
  return <StockClient stock={stock} error={error} />;
}
