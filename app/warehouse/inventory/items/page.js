import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/hub/session";
import {
  canManageInventory,
  listItems,
} from "@/lib/warehouse/inventory";
import ItemsAdminClient from "./ItemsAdminClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Items Master — WarehouseOS",
  description: "Master SKU list — plain items (warehouse-managed) and branded variants (FactoryOS-spawned).",
};

export default async function ItemsAdminPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageInventory(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
          <p className="mt-2 text-sm">
            The Items master is restricted to Admin, Factory Manager, and Factory Executive roles.
          </p>
        </div>
      </div>
    );
  }

  let items = [];
  let error = null;
  try {
    items = await listItems({ includeInactive: true });
  } catch (e) {
    error = e.message;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Items Master</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Define plain SKUs here. Branded variants (e.g. <span className="font-mono">CUP-DW-8OZ-HIMS</span>)
            auto-spawn from FactoryOS pushes — they cannot be created manually.
          </p>
        </div>
        <Link
          href="/warehouse/inventory"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          ← Stock position
        </Link>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">Could not load items.</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : (
        <ItemsAdminClient initialItems={items} />
      )}
    </div>
  );
}
