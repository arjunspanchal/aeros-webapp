import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canManageInventory,
  listStockPosition,
  listLocations,
} from "@/lib/warehouse/inventory";
import AppHeader from "@/app/components/AppHeader";
import Footer from "@/app/components/Footer";
import StockPositionClient from "./StockPositionClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory — WarehouseOS",
  description: "Master SKU stock position across the Bhiwandi warehouse.",
};

export default async function InventoryStockPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageInventory(session)) {
    return (
      <>
        <AppHeader session={session} />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
            <p className="text-lg font-semibold">Access denied</p>
            <p className="mt-2 text-sm">
              Inventory is restricted to Admin, Factory Manager, and Factory Executive roles.
            </p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  let stock = [];
  let locations = [];
  let error = null;
  try {
    [stock, locations] = await Promise.all([listStockPosition(), listLocations()]);
  } catch (e) {
    error = e.message;
  }

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Stock Position</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              On-hand quantity and INR value per SKU across {locations.length} Bhiwandi locations. Updated by every posted movement.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/warehouse/inventory/items"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Items master →
            </Link>
            <Link
              href="/warehouse/inventory/audits"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Audits →
            </Link>
          </div>
        </div>
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-semibold">Could not load stock position.</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        ) : (
          <StockPositionClient initialStock={stock} locations={locations} />
        )}
      </main>
      <Footer />
    </>
  );
}
