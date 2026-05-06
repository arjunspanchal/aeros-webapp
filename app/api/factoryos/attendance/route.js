import { getSession, requireInternal, requireAdminStrict, requireManager } from "@/lib/auth/session";
import { listAttendance, upsertAttendance, getEmployee, computeOtHours, listEmployees } from "@/lib/factoryos/repo";
import { ATTENDANCE_WEIGHT, SHIFT_END } from "@/lib/factoryos/constants";

export const runtime = "nodejs";

export async function GET(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId") || undefined;
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;

    // Factory Manager is scoped to their own employees. If the caller asks
    // for a specific employeeId, verify ownership first; otherwise fall back
    // to the caller's employee set.
    if (!requireAdminStrict(session)) {
      if (employeeId) {
        const emp = await getEmployee(employeeId);
        if (!emp || emp.managerId !== session.factoryosUserId) {
          return Response.json({ error: "Not your employee" }, { status: 403 });
        }
      } else {
        const myEmployees = await listEmployees({ managerUserId: session.factoryosUserId });
        const myIds = new Set(myEmployees.map((e) => e.id));
        const all = await listAttendance({ from, to });
        return Response.json({ attendance: all.filter((r) => myIds.has(r.employeeId)) });
      }
    }

    const attendance = await listAttendance({ employeeId, from, to });
    return Response.json({ attendance });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// Mark attendance. Managers can only mark for employees assigned to them.
// Admin + Factory Manager can mark for anyone.
export async function POST(req) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!requireInternal(session)) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    if (!body.employeeId) return Response.json({ error: "Employee required" }, { status: 400 });
    if (!body.date) return Response.json({ error: "Date required" }, { status: 400 });
    if (!(body.status in ATTENDANCE_WEIGHT)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    const employee = await getEmployee(body.employeeId);
    if (!employee) return Response.json({ error: "Employee not found" }, { status: 404 });

    const isPrivileged = requireManager(session);
    if (!isPrivileged && employee.managerId !== session.factoryosUserId) {
      return Response.json({ error: "Not your assigned employee" }, { status: 403 });
    }

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
      markedByUserId: session.factoryosUserId,
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
