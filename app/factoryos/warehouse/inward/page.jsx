import { getSession } from "@/lib/hub/session";
import { canWorkWarehouse, isWarehouseAdmin } from "@/lib/warehouse/access";
import { inwardQueue, NOT_TO_WAREHOUSE_REASONS } from "@/lib/warehouse/inward";
import { pickerData } from "@/lib/warehouse/zohoItems";
import InwardClient from "./InwardClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inward — Warehouse" };

// Everything arriving at the warehouse: vendors (Zoho purchase orders) and the
// factory (jobs handed over).
export default async function InwardPage({ searchParams }) {
  const session = getSession();
  const [queue, picker] = await Promise.all([inwardQueue({ since: searchParams?.since }), pickerData()]);
  return (
    <InwardClient
      queue={queue}
      items={picker.items}
      locations={picker.locations}
      stockByItem={picker.stockByItem}
      reasons={NOT_TO_WAREHOUSE_REASONS}
      canWork={canWorkWarehouse(session)}
      isAdmin={isWarehouseAdmin(session)}
    />
  );
}
