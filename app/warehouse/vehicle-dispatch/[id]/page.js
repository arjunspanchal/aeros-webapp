import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canManageVehicleDispatch,
  getVehicleDispatch,
} from "@/lib/warehouse/vehicleDispatches";
import VehicleDetailClient from "./VehicleDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const d = await getVehicleDispatch(params.id).catch(() => null);
  return { title: `${d?.dispatch_no || "Vehicle dispatch"} — WarehouseOS` };
}

export default async function VehicleDispatchDetailPage({ params }) {
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

  return <VehicleDetailClient dispatch={dispatch} isAdmin={!!session.isAdmin} />;
}
