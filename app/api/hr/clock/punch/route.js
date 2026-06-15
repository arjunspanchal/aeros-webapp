// Punch-clock: the worker checks in or out. Auto-derives the attendance row
// (one per employee/day) — Check In marks Present + stamps in-time; Check Out
// stamps out-time and recomputes OT for OT-eligible workers (hours past 19:00,
// same rule as the manual form). Self-marked rows carry marked_by_name="self"
// so managers can tell them apart on the admin attendance page.
import { getEmpSession } from "@/lib/factoryos/empAuth";
import { getEmployee, findAttendance, upsertAttendance, computeOtHours } from "@/lib/factoryos/repo";
import { todayYmdIST, nowHmIST, isLate } from "@/lib/factoryos/hr";
import { SHIFT_END } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

const SELF = "self";

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

  // Optional GPS the device shared with the punch clock. Best-effort: if the
  // worker denied location or it's unavailable, these are missing and we record
  // the punch without coordinates. Sanity-bound lat/lng so junk never persists.
  const geo = parseGeo(body);

  const date = todayYmdIST();
  const now = nowHmIST();
  const existing = await findAttendance(session.employeeId, date);

  if (action === "in") {
    if (existing?.inTime) {
      return Response.json(
        { error: `Already checked in at ${existing.inTime}.`, inTime: existing.inTime },
        { status: 409 },
      );
    }
    const late = isLate(now);
    const record = await upsertAttendance({
      employeeId: session.employeeId,
      date,
      status: "P",
      inTime: now,
      outTime: existing?.outTime || "",
      otHours: 0,
      markedByName: SELF,
      notes: existing?.notes || "",
      inLat: geo.lat,
      inLng: geo.lng,
      inAccuracy: geo.accuracy,
    });
    return Response.json({ ok: true, action, record, late, inTime: now, located: geo.lat != null });
  }

  // action === "out"
  if (!existing?.inTime) {
    return Response.json({ error: "Check in first." }, { status: 400 });
  }
  if (existing?.outTime) {
    return Response.json(
      { error: `Already checked out at ${existing.outTime}.`, outTime: existing.outTime },
      { status: 409 },
    );
  }

  const otHours = employee.otEligible ? computeOtHours(existing.inTime, now, SHIFT_END) : 0;
  const record = await upsertAttendance({
    employeeId: session.employeeId,
    date,
    status: "P",
    inTime: existing.inTime,
    outTime: now,
    otHours,
    markedByName: SELF,
    notes: existing?.notes || "",
    outLat: geo.lat,
    outLng: geo.lng,
    outAccuracy: geo.accuracy,
  });
  return Response.json({ ok: true, action, record, located: geo.lat != null });
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
