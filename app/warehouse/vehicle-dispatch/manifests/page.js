import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageVehicleDispatch } from "@/lib/warehouse/vehicleDispatches";
import { listManifestHistory } from "@/lib/warehouse/dispatchManifest";
import ManifestHistoryClient from "./ManifestHistoryClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Manifest history — WarehouseOS" };

export default async function ManifestHistoryPage() {
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

  let manifests = [], error = null;
  try {
    manifests = await listManifestHistory({ limit: 1000 });
  } catch (e) {
    error = e.message;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/warehouse/vehicle-dispatch" className="text-sm text-blue-700 hover:text-blue-800 dark:text-blue-400">
            ← Vehicle Dispatch
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">Manifest history</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Every dispatch manifest generated, with the boxes, weight and volume that went out.
            Open one to re-print it, or copy its lines into a new dispatch.
          </p>
        </div>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      ) : (
        <ManifestHistoryClient manifests={manifests} />
      )}
    </div>
  );
}
