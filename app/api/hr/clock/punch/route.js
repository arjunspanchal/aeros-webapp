// Punch-clock: the worker checks in or out. Auto-derives the attendance row
// (one per employee/day) — Check In marks Present + stamps in-time; Check Out
// stamps out-time and recomputes OT for OT-eligible workers (hours past 19:00,
// same rule as the manual form). Self-marked rows carry marked_by_name="self"
// so managers can tell them apart on the admin attendance page.
import { getEmpSession } from "@/lib/factoryos/empAuth";
import { getEmployee, findAttendance, upsertAttendance, computeOtHours } from "@/lib/factoryos/repo";
import { todayYmdIST, nowHmIST } from "@/lib/factoryos/hr";
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

  const { action } = await req.json().catch(() => ({}));
  if (action !== "in" && action !== "out") {
    return Response.json({ error: "action must be 'in' or 'out'" }, { status: 400 });
  }

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
    const record = await upsertAttendance({
      employeeId: session.employeeId,
      date,
      status: "P",
      inTime: now,
      outTime: existing?.outTime || "",
      otHours: 0,
      markedByName: SELF,
      notes: existing?.notes || "",
    });
    return Response.json({ ok: true, action, record });
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
  });
  return Response.json({ ok: true, action, record });
}
