import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageInventory, listItems, listLocations, listStockPositions } from "@/lib/warehouse/inventory";
import { invoiceQueue, TRANSPORT_MODES, INVOICE_GO_LIVE } from "@/lib/warehouse/invoiceDispatch";
import InvoiceQueueClient from "./InvoiceQueueClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices to load — WarehouseOS" };

// The warehouse's daily list: every Zoho invoice that has not been recorded as
// loaded (or as not from the warehouse). "Dispatched = invoiced in Zoho."
export default async function InvoicesToLoadPage({ searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageInventory(session)) redirect("/warehouse");

  const [queue, items, locations, stock] = await Promise.all([
    invoiceQueue({ since: searchParams?.since }),
    listItems().catch(() => []),
    listLocations().catch(() => []),
    listStockPositions().catch(() => []),
  ]);
  const codeToId = new Map(locations.map((l) => [l.code, l.id]));
  const stockByItem = {};
  for (const s of stock) {
    stockByItem[s.item_id] = Object.entries(s.by_location || {})
      .filter(([, q]) => Number(q) > 0)
      .map(([code, q]) => ({ locationId: codeToId.get(code) || "", code, qty: Number(q) }))
      .filter((p) => p.locationId)
      .sort((a, b) => b.qty - a.qty);
  }
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <InvoiceQueueClient
        queue={queue}
        goLive={INVOICE_GO_LIVE}
        items={items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, uom: i.uom, brand: i.brand_customer || i.brand || "" }))}
        stockByItem={stockByItem}
        transportModes={TRANSPORT_MODES}
        isAdmin={!!session.isAdmin}
      />
    </main>
  );
}
