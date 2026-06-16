import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageVehicleDispatch } from "@/lib/warehouse/vehicleDispatches";
import { drivingDistanceKm, isGeoConfigured } from "@/lib/warehouse/geo";

export const dynamic = "force-dynamic";

// POST { from: {place_id|lat,lng}, to: {place_id|lat,lng} } → { km }
export async function POST(req) {
  const session = getSession();
  if (!canManageVehicleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isGeoConfigured()) {
    return NextResponse.json({ configured: false, km: null });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { from, to } = body || {};
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  try {
    const km = await drivingDistanceKm(from, to);
    return NextResponse.json({ configured: true, km });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
