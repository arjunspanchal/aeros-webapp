import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canManageVehicleDispatch,
  listVehicleDispatches,
} from "@/lib/warehouse/vehicleDispatches";
import VehicleQueueClient from "./VehicleQueueClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vehicle Dispatch — WarehouseOS" };

export default async function VehicleDispatchPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageVehicleDispatch(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
        </div>
      </div>
    );
  }

  let dispatches = [], error = null;
  try {
    dispatches = await listVehicleDispatches({ limit: 1000 });
  } catch (e) {
    error = e.message;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Vehicle Dispatch</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Outbound freight log — one row per invoice/vehicle. Tracks transporter, lane and the lump-sum
            freight, with cost per box and per kg worked out automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/warehouse/vehicle-dispatch/manifests"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Manifest history
          </Link>
          <Link
            href="/warehouse/vehicle-dispatch/new"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            + New dispatch
          </Link>
        </div>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      ) : (
        <VehicleQueueClient initialDispatches={dispatches} />
      )}
    </div>
  );
}
