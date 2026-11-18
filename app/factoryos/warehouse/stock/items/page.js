import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageInventory, listItems, SOURCE_OPTIONS, UOM_OPTIONS } from "@/lib/warehouse/inventory";
import { masterCategories } from "@/lib/warehouse/categories";
import ItemsClient from "./ItemsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Items — Warehouse" };

export default async function ItemsPage() {
  const session = getSession();
  if (!canManageInventory(session)) redirect("/factoryos/warehouse/stock");
  const [items, categories] = await Promise.all([listItems({ includeInactive: true }).catch(() => []), masterCategories()]);
  return <ItemsClient initialItems={items} sources={SOURCE_OPTIONS} units={UOM_OPTIONS} categories={categories.map((c) => c.name)} />;
}
