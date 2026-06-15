import { NextResponse } from "next/server";
import { getSession } from "@/lib/hub/session";
import { canManageVehicleDispatch } from "@/lib/warehouse/vehicleDispatches";
import { placeAutocomplete, placeDetails, isGeoConfigured } from "@/lib/warehouse/geo";

export const dynamic = "force-dynamic";

// GET ?q=... → predictions for the From/To pickers.
// GET ?place_id=...&details=1 → resolve a chosen prediction to label + coords.
export async function GET(req) {
  const session = getSession();
  if (!canManageVehicleDispatch(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isGeoConfigured()) {
    // Soft signal so the client can fall back to plain text entry instead of
    // throwing a scary error when the key isn't set yet.
    return NextResponse.json({ configured: false, predictions: [] });
  }

  const { searchParams } = new URL(req.url);
  const sessionToken = searchParams.get("session") || undefined;
  const placeId = searchParams.get("place_id");

  try {
    if (placeId) {
      const place = await placeDetails(placeId, sessionToken);
      return NextResponse.json({ configured: true, place });
    }
    const predictions = await placeAutocomplete(searchParams.get("q") || "", sessionToken);
    return NextResponse.json({ configured: true, predictions });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
