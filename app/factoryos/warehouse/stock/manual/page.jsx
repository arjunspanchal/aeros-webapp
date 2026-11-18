import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageInventory, listItems, listLocations, listStockPositions } from "@/lib/warehouse/inventory";
import ManualClient from "./ManualClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manual entry — Warehouse" };

// For the few movements with no Zoho document behind them: a customer return,
// samples, scrap, opening stock. Everything else goes through Inward / Outward.
export default async function ManualPage() {
  const session = getSession();
  if (!canManageInventory(session)) redirect("/factoryos/warehouse/stock");
  const [items, locations, stock] = await Promise.all([
    listItems().catch(() => []), listLocations().catch(() => []), listStockPositions().catch(() => []),
  ]);
  return <ManualClient items={items} locations={locations} stock={stock} />;
}
