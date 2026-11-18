import { getSession } from "@/lib/hub/session";
import { canWorkWarehouse, isWarehouseAdmin } from "@/lib/warehouse/access";
import { outwardQueue, TRANSPORT_MODES, NOT_FROM_WAREHOUSE_REASONS } from "@/lib/warehouse/outward";
import { pickerData } from "@/lib/warehouse/zohoItems";
import OutwardClient from "./OutwardClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outward — Warehouse" };

// Everything leaving the warehouse. Driven by Zoho invoices: "dispatched =
// invoiced in Zoho".
export default async function OutwardPage({ searchParams }) {
  const session = getSession();
  const [queue, picker] = await Promise.all([outwardQueue({ since: searchParams?.since }), pickerData()]);
  return (
    <OutwardClient
      queue={queue}
      items={picker.items}
      stockByItem={picker.stockByItem}
      transportModes={TRANSPORT_MODES}
      reasons={NOT_FROM_WAREHOUSE_REASONS}
      canWork={canWorkWarehouse(session)}
      isAdmin={isWarehouseAdmin(session)}
    />
  );
}
