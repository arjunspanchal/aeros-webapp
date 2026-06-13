// Punch-clock self-service leave. A signed-in worker (employee session) can
// submit a Paid/Unpaid leave request and see their own requests. HR approves
// them in /hr/leaves. Public route (middleware lets /api/hr/clock/* through);
// auth is the employee session.
import { getEmpSession } from "@/lib/factoryos/empAuth";
import {
  getEmployee,
  resolveEmployeePgId,
  createLeaveRequest,
  listLeaveRequests,
  listHolidays,
} from "@/lib/factoryos/repo";
import { isWorkingDay, pad2 } from "@/lib/factoryos/hr";

export const runtime = "nodejs";

function datesBetween(from, to) {
  const out = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  while (cur <= end) {
    const dt = new Date(cur);
    out.push(`${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`);
    cur += 86400000;
  }
  return out;
}

export async function GET() {
  const session = getEmpSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  const pgId = await resolveEmployeePgId(session.employeeId);
  if (!pgId) return Response.json({ requests: [] });
  const requests = await listLeaveRequests({ employeeId: pgId });
  return Response.json({ requests });
}

export async function POST(req) {
  const session = getEmpSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });

  const employee = await getEmployee(session.employeeId);
  if (!employee || !employee.active) {
    return Response.json({ error: "Account inactive" }, { status: 403 });
  }

  const { type, fromDate, toDate, reason } = await req.json().catch(() => ({}));
  const t = type === "UL" ? "UL" : "PL";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(toDate))) {
    return Response.json({ error: "Pick a valid date range." }, { status: 400 });
  }
  if (toDate < fromDate) {
    return Response.json({ error: "End date is before the start date." }, { status: 400 });
  }

  // Count the WORKING days in the range (skip the worker's weekly-offs + holidays).
  const holidays = await listHolidays();
  const holidaySet = new Set(holidays.map((h) => h.date));
  const days = datesBetween(fromDate, toDate).filter((iso) =>
    isWorkingDay(iso, employee.weeklyOffDays, holidaySet),
  ).length;
  if (days === 0) {
    return Response.json({ error: "That range has no working days (all off / holiday)." }, { status: 400 });
  }

  const pgId = await resolveEmployeePgId(session.employeeId);
  if (!pgId) return Response.json({ error: "Employee not found" }, { status: 404 });

  const request = await createLeaveRequest({
    employeeId: pgId,
    type: t,
    fromDate,
    toDate,
    days,
    reason: (reason || "").trim(),
  });
  return Response.json({ ok: true, request });
}
