import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canManageVehicleDispatch,
  getVehicleDispatch,
  suggestVehicle,
} from "@/lib/warehouse/vehicleDispatches";
import {
  listManifestLines,
  listDispatchInvoices,
  manifestTotals,
  groupByInvoice,
} from "@/lib/warehouse/dispatchManifest";
import PrintView from "./PrintView";

export const dynamic = "force-dynamic";

export const metadata = { title: "Print — dispatch manifest" };

export default async function VehicleManifestPrintPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageVehicleDispatch(session)) {
    return <div className="p-12 text-center text-red-700">Access denied</div>;
  }

  const dispatch = await getVehicleDispatch(params.id);
  if (!dispatch) notFound();

  const [lines, invoices] = await Promise.all([
    listManifestLines(params.id),
    listDispatchInvoices(params.id),
  ]);
  const totals = manifestTotals(lines);
  const groups = groupByInvoice(lines, invoices);
  // Only worth printing when no vehicle has been committed yet — once one is
  // booked, the manifest should show what's actually coming, not a suggestion.
  const suggestion = dispatch.vehicle_size ? null : suggestVehicle(totals.cbm, totals.kg);

  return (
    <PrintView
      dispatch={dispatch}
      groups={groups}
      invoices={invoices}
      totals={totals}
      suggestion={suggestion}
    />
  );
}
