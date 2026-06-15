import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canManageVehicleDispatch,
  getVehicleDispatch,
  updateVehicleDispatch,
  updateVehicleDispatchStatus,
  softDeleteVehicleDispatch,
  createTransporter,
} from "@/lib/warehouse/vehicleDispatches";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const session = getSession();
  if (!canManageVehicleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dispatch = await getVehicleDispatch(params.id);
  if (!dispatch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ dispatch });
}

export async function PATCH(req, { params }) {
  const session = getSession();
  if (!canManageVehicleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    // Status-only flip from the detail-page buttons (Mark dispatched /
    // delivered). A body carrying *only* `status` takes the light path.
    const keys = Object.keys(body || {});
    if (keys.length === 1 && keys[0] === "status") {
      const dispatch = await updateVehicleDispatchStatus(params.id, body.status);
      return NextResponse.json({ dispatch });
    }

    if (body?.newTransporterName && !body.transporter_vendor_id) {
      const v = await createTransporter({ name: body.newTransporterName });
      body.transporter_vendor_id = v.id;
      body.transporter_name = v.name;
    }
    const dispatch = await updateVehicleDispatch(params.id, body);
    return NextResponse.json({ dispatch });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(_req, { params }) {
  const session = getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await softDeleteVehicleDispatch(params.id);
  return NextResponse.json({ ok: true });
}
