// Vehicle bodies and the "what will carry this load?" maths.
//
// Pure module, zero DB imports — the manifest calculator runs it live in the
// browser as the team types, and the print page runs it on the server. Keep it
// that way: importing the data layer here would drag server-only Supabase code
// into the client bundle.
//
// !! ASSUMED CONSTANTS !! `cbm` and `payload_kg` are standard Indian market
// body sizes, NOT measured on Aeros' own hired fleet. They exist so the
// suggestion has something to work with — correct them against real transporter
// specs before anyone quotes off them. This list is also the vehicle-size
// dropdown, so the picker and the recommender can never disagree.

// `kind` matters to the recommender: a 20 ft container and a 24 ft truck hold
// almost the same cube, but they are not interchangeable — a container means
// an export/FCL move, a truck means domestic road. Trucks are always offered
// first; containers only surface when no truck can take the load.
export const VEHICLE_SPECS = [
  { name: "Tata 407",        kind: "truck",     cbm: 7.7,  payload_kg: 2500,  body: "9 × 5.5 × 5.5 ft" },
  { name: "14 ft",           kind: "truck",     cbm: 14.3, payload_kg: 3500,  body: "14 × 6 × 6 ft" },
  { name: "17 ft",           kind: "truck",     cbm: 20.2, payload_kg: 5000,  body: "17 × 6 × 7 ft" },
  { name: "19 ft",           kind: "truck",     cbm: 26.4, payload_kg: 7000,  body: "19 × 7 × 7 ft" },
  { name: "20 ft",           kind: "truck",     cbm: 27.7, payload_kg: 8000,  body: "20 × 7 × 7 ft" },
  { name: "22 ft",           kind: "truck",     cbm: 30.5, payload_kg: 9000,  body: "22 × 7 × 7 ft" },
  { name: "24 ft",           kind: "truck",     cbm: 33.3, payload_kg: 10000, body: "24 × 7 × 7 ft" },
  { name: "32 ft SXL",       kind: "truck",     cbm: 58.0, payload_kg: 7500,  body: "32 × 8 × 8 ft (single axle)" },
  { name: "32 ft MXL",       kind: "truck",     cbm: 58.0, payload_kg: 16000, body: "32 × 8 × 8 ft (multi axle)" },
  { name: "20 ft Container", kind: "container", cbm: 33.2, payload_kg: 28000, body: "ISO 20 ft GP" },
  { name: "40 ft Container", kind: "container", cbm: 67.7, payload_kg: 26000, body: "ISO 40 ft GP" },
];

export const VEHICLE_SIZES = VEHICLE_SPECS.map((v) => v.name);

// You never fill a body to its geometric cube — cartons don't tessellate, the
// load has to be walked in, and the last tier is rarely complete. 85% is a
// deliberately conservative planning figure for palletless floor loading.
export const VEHICLE_FILL_FACTOR = 0.85;

// Smallest vehicle that swallows the load on BOTH volume and weight. Returns
// the pick plus the next size up (the safety option when the manifest is still
// growing) and, when nothing fits, the largest body with the number of trips it
// would take — a 90-CBM load is a two-vehicle problem, not a missing row here.
export function suggestVehicle(cbm, kg, { fillFactor = VEHICLE_FILL_FACTOR } = {}) {
  const needCbm = Number(cbm) || 0;
  const needKg = Number(kg) || 0;
  if (needCbm <= 0 && needKg <= 0) return null;

  const usable = (v) => +(v.cbm * fillFactor).toFixed(2);
  const bySize = (a, b) => a.cbm - b.cbm || a.payload_kg - b.payload_kg;
  const trucks = VEHICLE_SPECS.filter((v) => v.kind === "truck").sort(bySize);
  const containers = VEHICLE_SPECS.filter((v) => v.kind === "container").sort(bySize);
  const takes = (v) => needCbm <= usable(v) && (needKg === 0 || needKg <= v.payload_kg);

  // Trucks first; containers are the fallback for loads no truck can take
  // (typically weight, since a 20 ft box holds nearly 3× a 24 ft truck's payload).
  const pool = trucks.some(takes) ? trucks : containers;
  const fits = pool.filter(takes);

  if (!fits.length) {
    // Nothing takes it in one go — size the job in whole trucks rather than
    // pretending a bigger row exists.
    const biggest = trucks[trucks.length - 1];
    const trips = Math.max(
      needCbm > 0 ? Math.ceil(needCbm / usable(biggest)) : 1,
      needKg > 0 ? Math.ceil(needKg / biggest.payload_kg) : 1,
    );
    return { vehicle: null, overflow: true, biggest, usableCbm: usable(biggest), trips };
  }

  const pick = fits[0];
  const idx = pool.indexOf(pick);
  // A smaller body big enough by volume but skipped on payload means weight,
  // not cube, set the size — worth saying out loud, it's the surprising case.
  const firstVolumeFit = pool.findIndex((v) => needCbm <= usable(v));
  return {
    vehicle: pick,
    overflow: false,
    usableCbm: usable(pick),
    utilisation: usable(pick) > 0 ? Math.round((needCbm / usable(pick)) * 100) : null,
    weightBound: needKg > 0 && firstVolumeFit >= 0 && firstVolumeFit < idx,
    nextUp: pool[idx + 1] || null,
  };
}
