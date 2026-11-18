import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canViewWarehouse, canSeeStock } from "@/lib/warehouse/access";
import { WarehouseTabs } from "./_components/ui";

// The Warehouse unit inside FactoryOS. It shares the app's menu and look, but
// keeps its own screens, roles and stock so it can run from another site
// later. Every page below gets the same tab strip.
export default function WarehouseLayout({ children }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canViewWarehouse(session)) redirect("/factoryos");
  const tabs = [
    { href: "/factoryos/warehouse", label: "Today", exact: true },
    { href: "/factoryos/warehouse/inward", label: "Inward" },
    { href: "/factoryos/warehouse/outward", label: "Outward" },
    { href: "/factoryos/warehouse/transit", label: "In transit" },
    ...(canSeeStock(session) ? [{ href: "/factoryos/warehouse/stock", label: "Stock" }] : []),
  ];
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <WarehouseTabs tabs={tabs} />
      {children}
    </div>
  );
}
