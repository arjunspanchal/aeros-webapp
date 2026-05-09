import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/hub/session";
import {
  canManageInventory,
  listItems,
  listLocations,
} from "@/lib/warehouse/inventory";
import { listMovements } from "@/lib/warehouse/movements";
import OutwardClient from "./OutwardClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Outward — WarehouseOS" };

export default async function OutwardPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageInventory(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
        </div>
      </div>
    );
  }

  let items = [], locations = [], recent = [], error = null;
  try {
    [items, locations, recent] = await Promise.all([
      listItems(),
      listLocations(),
      listMovements({ type: "outward", limit: 20 }),
    ]);
  } catch (e) {
    error = e.message;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Outward (Issue / Dispatch)</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Issue stock to customers, jobs, samples, or scrap. Decrements the source location instantly.
          </p>
        </div>
        <Link href="/warehouse/inventory/movements" className="text-sm text-blue-700 hover:text-blue-800 dark:text-blue-400">
          View full history →
        </Link>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      ) : (
        <OutwardClient items={items} locations={locations} initialRecent={recent} />
      )}
    </div>
  );
}
