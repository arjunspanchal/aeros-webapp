import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import {
  canManageVehicleDispatch,
  listVehicleDispatches,
  createVehicleDispatch,
  createTransporter,
} from "@/lib/warehouse/vehicleDispatches";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = getSession();
  if (!canManageVehicleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const dispatches = await listVehicleDispatches({
    limit: Number(searchParams.get("limit") || 500),
  });
  return NextResponse.json({ dispatches });
}

export async function POST(req) {
  const session = getSession();
  if (!canManageVehicleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    // Inline "add transporter" — the form posts { newTransporterName } when
    // the user typed a transporter not already in the directory.
    if (body?.newTransporterName && !body.transporter_vendor_id) {
      const v = await createTransporter({ name: body.newTransporterName });
      body.transporter_vendor_id = v.id;
      body.transporter_name = v.name;
    }
    const dispatch = await createVehicleDispatch(body, session.email);
    return NextResponse.json({ dispatch }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
