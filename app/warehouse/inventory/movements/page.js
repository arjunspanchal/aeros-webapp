import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { listMovements } from "@/lib/warehouse/movements";
import MovementsClient from "./MovementsClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Movements — WarehouseOS" };

export default async function MovementsHistoryPage() {
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

  let movements = [], error = null;
  try {
    movements = await listMovements({ limit: 500 });
  } catch (e) {
    error = e.message;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Movements</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Every posted inward, outward, transfer, and adjustment. Click a row for full line detail.
        </p>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      ) : (
        <MovementsClient initialMovements={movements} />
      )}
    </div>
  );
}
