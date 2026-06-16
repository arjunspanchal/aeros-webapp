import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canManageVehicleDispatch,
  getVehicleDispatch,
  listDispatchClients,
  listTransporters,
  listRecentLocations,
  VEHICLE_SIZES,
} from "@/lib/warehouse/vehicleDispatches";
import VehicleDispatchForm from "../../VehicleDispatchForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit vehicle dispatch — WarehouseOS" };

export default async function EditVehicleDispatchPage({ params }) {
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

  const dispatch = await getVehicleDispatch(params.id);
  if (!dispatch) notFound();

  let clients = [], transporters = [], recentLocations = [];
  try { clients = await listDispatchClients(); } catch {}
  try { transporters = await listTransporters(); } catch {}
  try { recentLocations = await listRecentLocations(); } catch {}

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Edit {dispatch.dispatch_no}</h1>
      </div>
      <VehicleDispatchForm
        mode="edit"
        dispatchId={dispatch.id}
        initial={dispatch}
        clients={clients}
        transporters={transporters}
        recentLocations={recentLocations}
        vehicleSizes={VEHICLE_SIZES}
      />
    </div>
  );
}
