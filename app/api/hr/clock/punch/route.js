// Punch-clock: the worker checks in or out. Auto-derives the attendance row
// (one per employee/shift) — Check In marks Present + stamps in-time; Check Out
// stamps out-time and recomputes OT for OT-eligible workers (hours past 19:00,
// same rule as the manual form). Self-marked rows carry marked_by_name="self"
// so managers can tell them apart on the admin attendance page.
//
// Overnight shifts: an OT shift can run past midnight (e.g. 09:00 → 04:00). The
// row stays keyed to the CHECK-IN date, so a check-out after midnight closes
// yesterday's open row, and OT is measured across midnight. A shift's hard end
// is OT_CUTOFF_HM (04:00) on the day after check-in: punching out later, or
// forgetting to punch out, auto-closes the shift at the cutoff and caps OT.
import { getEmpSession } from "@/lib/factoryos/empAuth";
import { getEmployee, findAttendance, upsertAttendance, computeOtHours } from "@/lib/factoryos/repo";
import { todayYmdIST, nowHmIST, isLate, distanceMeters, addDaysYmd, overnightShiftActive } from "@/lib/factoryos/hr";
import { SHIFT_END, OFFICE_GEOFENCE, OT_CUTOFF_HM } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

const SELF = "self";

// Append a system note to whatever the row already had, " · "-separated.
function appendNote(existing, addition) {
  const base = String(existing || "").trim();
  return base ? `${base} · ${addition}` : addition;
}

// Close a forgotten overnight shift at the OT ceiling so it still credits OT
// (up to 04:00) and the new day can start clean. No out-location — they're long
// gone by the time this runs.
async function autoCloseShift(employeeId, date, row, otEligible) {
  const otHours = otEligible ? computeOtHours(row.inTime, OT_CUTOFF_HM, SHIFT_END) : 0;
  await upsertAttendance({
    employeeId,
    date,
    status: row.status || "P",
    inTime: row.inTime,
    outTime: OT_CUTOFF_HM,
    otHours,
    markedByName: row.markedByName || SELF,
    notes: appendNote(row.notes, `Auto check-out ${OT_CUTOFF_HM} (no punch-out)`),
  });
}

// Cap how much we trust a poor GPS fix when checking the geofence: a worker is
// "at the office" if they're within radius OR the office falls inside their
// accuracy circle (up to this buffer). Stops indoor GPS jitter from wrongly
// locking out on-site staff, without turning a wild fix into a free pass.
const ACCURACY_BUFFER_CAP_M = 200;

// Geofence gate for WFO workers: they may only punch at the Bhiwandi office.
// Returns an error Response to block, or null to allow. WFH workers are exempt.
function geofenceBlock(employee, geo) {
  const isWfo = String(employee.workMode || "WFO").toUpperCase() !== "WFH";
  if (!isWfo) return null; // WFH: no geofence.

  if (geo.lat == null) {
    return Response.json(
      {
        error:
          "Location required. Turn on GPS/location for this site and allow it, then try again — office staff must punch at the Bhiwandi office.",
        needLocation: true,
      },
      { status: 422 },
    );
  }

  const dist = distanceMeters(geo.lat, geo.lng, OFFICE_GEOFENCE.lat, OFFICE_GEOFENCE.lng);
  const buffer = Math.min(geo.accuracy || 0, ACCURACY_BUFFER_CAP_M);
  if (Math.max(0, dist - buffer) > OFFICE_GEOFENCE.radiusM) {
    const away = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    return Response.json(
      {
        error: `You appear to be about ${away} from the office. Office staff must check in/out at the Bhiwandi factory.`,
        outsideGeofence: true,
        distanceM: Math.round(dist),
      },
      { status: 422 },
    );
  }
  return null;
}

export async function POST(req) {
  const session = getEmpSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });

  const employee = await getEmployee(session.employeeId);
  if (!employee || !employee.active) {
    return Response.json({ error: "Account inactive" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { action } = body;
  if (action !== "in" && action !== "out") {
    return Response.json({ error: "action must be 'in' or 'out'" }, { status: 400 });
  }

  // GPS the device shared with the punch clock. Sanity-bound lat/lng so junk
  // never persists. For WFH workers this is best-effort (recorded, never
  // required); for WFO workers it gates the punch via the office geofence.
  const geo = parseGeo(body);

  const blocked = geofenceBlock(employee, geo);
  if (blocked) return blocked;

  const today = todayYmdIST();
  const now = nowHmIST();
  const yesterday = addDaysYmd(today, -1);
  const todayRow = await findAttendance(session.employeeId, today);

  if (action === "in") {
    if (todayRow?.inTime) {
      return Response.json(
        { error: `Already checked in at ${todayRow.inTime}.`, inTime: todayRow.inTime },
        { status: 409 },
      );
    }
    // Is yesterday's shift still open (mid-overnight, or a forgotten punch-out)?
    const yRow = await findAttendance(session.employeeId, yesterday);
    if (yRow?.inTime && !yRow.outTime) {
      if (overnightShiftActive(yesterday, today, now)) {
        // Still inside the overnight window — they should be checking OUT, not IN.
        return Response.json(
          {
            error: `You're still checked in from yesterday (since ${yRow.inTime}). Check out first.`,
            openSince: yRow.inTime,
          },
          { status: 409 },
        );
      }
      // Past the cutoff and never closed — auto-close it so OT (to 04:00) is
      // credited and today starts clean.
      await autoCloseShift(session.employeeId, yesterday, yRow, employee.otEligible);
    }
    const late = isLate(now);
    const record = await upsertAttendance({
      employeeId: session.employeeId,
      date: today,
      status: "P",
      inTime: now,
      outTime: "",
      otHours: 0,
      markedByName: SELF,
      notes: "",
      inLat: geo.lat,
      inLng: geo.lng,
      inAccuracy: geo.accuracy,
    });
    return Response.json({ ok: true, action, record, late, inTime: now, located: geo.lat != null });
  }

  // action === "out" — close the open shift: today's if there is one, else
  // yesterday's overnight one (check-in before midnight, out-time after).
  let shiftDate = null;
  let shiftRow = null;
  if (todayRow?.inTime && !todayRow.outTime) {
    shiftDate = today;
    shiftRow = todayRow;
  } else if (!todayRow) {
    const yRow = await findAttendance(session.employeeId, yesterday);
    if (yRow?.inTime && !yRow.outTime) {
      shiftDate = yesterday;
      shiftRow = yRow;
    }
  }

  if (!shiftRow) {
    if (todayRow?.outTime) {
      return Response.json(
        { error: `Already checked out at ${todayRow.outTime}.`, outTime: todayRow.outTime },
        { status: 409 },
      );
    }
    return Response.json({ error: "Check in first." }, { status: 400 });
  }

  // Honour the 04:00 OT ceiling: punching out after the cutoff caps the out-time
  // (and OT) at the cutoff; otherwise the real punch time stands.
  const capped = !overnightShiftActive(shiftDate, today, now);
  const outTime = capped ? OT_CUTOFF_HM : now;
  const otHours = employee.otEligible ? computeOtHours(shiftRow.inTime, outTime, SHIFT_END) : 0;
  const record = await upsertAttendance({
    employeeId: session.employeeId,
    date: shiftDate,
    status: "P",
    inTime: shiftRow.inTime,
    outTime,
    otHours,
    markedByName: SELF,
    notes: capped
      ? appendNote(shiftRow.notes, `Out capped to ${OT_CUTOFF_HM} (punched ${now})`)
      : shiftRow.notes || "",
    outLat: geo.lat,
    outLng: geo.lng,
    outAccuracy: geo.accuracy,
  });
  return Response.json({
    ok: true,
    action,
    record,
    located: geo.lat != null,
    overnight: shiftDate !== today,
    capped,
    otHours,
  });
}

// Pull lat/lng/accuracy off the request body, validating ranges. Returns nulls
// when absent or out of bounds so a bad client payload can't poison the record.
function parseGeo(body) {
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const acc = Number(body?.accuracy);
  const valid =
    Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0);
  if (!valid) return { lat: null, lng: null, accuracy: null };
  return {
    lat,
    lng,
    accuracy: Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null,
  };
}
