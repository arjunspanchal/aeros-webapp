import { getSession, hasModule } from "@/lib/auth/session";
import { resolveFactoryosUserId } from "@/lib/hub/users";
import { listAttendance, upsertAttendance, getEmployee, computeOtHours } from "@/lib/factoryos/repo";
import { ATTENDANCE_WEIGHT, SHIFT_END } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

// HR is single-level full access — any `hr` user reads/marks the whole roster.
export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId") || undefined;
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;

    const attendance = await listAttendance({ employeeId, from, to });
    return Response.json({ attendance });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// Mark attendance for any employee.
export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(session, "hr")) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    if (!body.employeeId) return Response.json({ error: "Employee required" }, { status: 400 });
    if (!body.date) return Response.json({ error: "Date required" }, { status: 400 });
    if (!(body.status in ATTENDANCE_WEIGHT)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    const employee = await getEmployee(body.employeeId);
    if (!employee) return Response.json({ error: "Employee not found" }, { status: 404 });

    const myUserId = await resolveFactoryosUserId(session);

    // OT only counts on Present days for OT-eligible employees.
    // OT = hours past SHIFT_END (19:00) — the factory's hard cutoff.
    let otHours = 0;
    if (employee.otEligible && body.status === "P") {
      otHours = computeOtHours(body.inTime, body.outTime, SHIFT_END);
    }

    const record = await upsertAttendance({
      employeeId: body.employeeId,
      date: body.date,
      status: body.status,
      inTime: body.inTime || "",
      outTime: body.outTime || "",
      otHours,
      markedByUserId: myUserId,
      markedByEmail: session.email,
      markedByName: session.name || "",
      notes: body.notes || "",
    });
    return Response.json({ attendance: record });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
