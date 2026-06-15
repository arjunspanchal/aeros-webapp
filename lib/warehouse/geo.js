// Google Maps Platform helpers — server-side only. A single secret key
// (GOOGLE_MAPS_API_KEY) drives Places Autocomplete (New) for the From/To
// location pickers and the Routes API for the driving-distance auto-fill.
// Nothing here runs in the browser, so the key is never exposed; the
// vehicle-dispatch UI calls our own /api/warehouse/geo/* routes instead.
//
// Required APIs on the key's Google Cloud project:
//   • Places API (New)   — autocomplete + place details
//   • Routes API         — computeRoutes (driving distance)
// Recommended restriction: API restriction to those two, no referrer/IP
// limit needed (server-to-server).

const KEY = process.env.GOOGLE_MAPS_API_KEY;

export function isGeoConfigured() {
  return !!KEY;
}

function ensureKey() {
  if (!KEY) {
    throw new Error(
      "Google Maps not configured. Set GOOGLE_MAPS_API_KEY (Places API New + Routes API) in your environment."
    );
  }
}

// Results are biased/limited to India — the freight lanes are domestic and
// it keeps the prediction list relevant.
const REGION = "in";

// Autocomplete: returns up to ~5 predictions for a typed query. Each carries
// the place_id (used later for details + distance) and a human label split
// into main + secondary text for a tidy dropdown.
export async function placeAutocomplete(query, sessionToken) {
  ensureKey();
  const q = String(query || "").trim();
  if (q.length < 3) return [];

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
    },
    body: JSON.stringify({
      input: q,
      regionCode: REGION,
      includedRegionCodes: [REGION],
      ...(sessionToken ? { sessionToken } : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places autocomplete ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const suggestions = data.suggestions || [];
  return suggestions
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      place_id: p.placeId,
      label: p.text?.text || "",
      main: p.structuredFormat?.mainText?.text || p.text?.text || "",
      secondary: p.structuredFormat?.secondaryText?.text || "",
    }));
}

// Resolve a place_id to its formatted label + coordinates. Called when the
// user picks a prediction so we can store lat/lng alongside the city text.
export async function placeDetails(placeId, sessionToken) {
  ensureKey();
  if (!placeId) throw new Error("place_id required");
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "id,formattedAddress,displayName,location",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Place details ${res.status}: ${body.slice(0, 200)}`);
  }
  const p = await res.json();
  return {
    place_id: p.id || placeId,
    label: p.displayName?.text || p.formattedAddress || "",
    address: p.formattedAddress || "",
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
  };
}

// Driving distance in km between two points. Accepts place_ids (preferred)
// or {lat,lng}. Uses Routes API computeRoutes with a DISTANCE-optimised,
// metric request and reads the single route's meters → km (1 dp). Returns
// null if no route is found (e.g. across water) so the caller leaves kms
// for manual entry.
export async function drivingDistanceKm(from, to) {
  ensureKey();
  const waypoint = (pt) => {
    if (pt?.place_id) return { placeId: pt.place_id };
    if (pt?.lat != null && pt?.lng != null) {
      return { location: { latLng: { latitude: Number(pt.lat), longitude: Number(pt.lng) } } };
    }
    throw new Error("Each endpoint needs a place_id or lat/lng");
  };

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "routes.distanceMeters",
    },
    body: JSON.stringify({
      origin: waypoint(from),
      destination: waypoint(to),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "METRIC",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Routes computeRoutes ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const meters = data.routes?.[0]?.distanceMeters;
  if (meters == null) return null;
  return +(meters / 1000).toFixed(1);
}
