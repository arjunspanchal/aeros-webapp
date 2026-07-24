import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canManageVehicleDispatch,
  getVehicleDispatch,
  updateVehicleDispatch,
} from "@/lib/warehouse/vehicleDispatches";
import {
  listManifestLines,
  listDispatchInvoices,
  saveManifest,
  manifestTotals,
} from "@/lib/warehouse/dispatchManifest";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const session = getSession();
  if (!canManageVehicleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [lines, invoices] = await Promise.all([
    listManifestLines(params.id),
    listDispatchInvoices(params.id),
  ]);
  return NextResponse.json({ lines, invoices, totals: manifestTotals(lines) });
}

// Replace the whole manifest — invoices and box types together, since lines
// reference invoices and the two must not be saved out of step.
//
// `syncDispatch` (the form's default) pushes the rolled-up box count and weight
// onto the parent dispatch so ₹/box and ₹/kg stay honest — the manifest is the
// more detailed source. Left off, the dispatch's own figures are untouched.
export async function PUT(req, { params }) {
  const session = getSession();
  if (!canManageVehicleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const dispatch = await getVehicleDispatch(params.id);
  if (!dispatch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { lines, invoices } = await saveManifest(params.id, {
      invoices: body?.invoices || [],
      lines: body?.lines || [],
    });
    const totals = manifestTotals(lines);

    // `vehicle_size` arrives when the team accepts the suggested vehicle.
    const setVehicle = typeof body?.vehicle_size === "string" && body.vehicle_size.trim();
    let updated = dispatch;
    if (setVehicle || (body?.syncDispatch && lines.length)) {
      const patch = { ...dispatch };
      if (body?.syncDispatch && lines.length) {
        patch.box_count = totals.boxes;
        // Only overwrite the weight when every line has one — a partial
        // total would understate the load on the freight maths.
        if (totals.missingKg === 0) patch.total_weight_kg = totals.kg;
      }
      if (setVehicle) patch.vehicle_size = body.vehicle_size.trim();
      updated = await updateVehicleDispatch(params.id, patch);
    }
    return NextResponse.json({ lines, invoices, totals, dispatch: updated });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
