// Punch-clock: today's state for the signed-in worker. Drives the button
// (Check In vs Check Out vs done-for-the-day).
import { getEmpSession } from "@/lib/factoryos/empAuth";
import { getEmployee, findAttendance } from "@/lib/factoryos/repo";
import { todayYmdIST } from "@/lib/factoryos/hr";

export const runtime = "nodejs";

export async function GET() {
  const session = getEmpSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });

  const employee = await getEmployee(session.employeeId);
  if (!employee || !employee.active) {
    return Response.json({ error: "Account inactive" }, { status: 403 });
  }

  const date = todayYmdIST();
  const row = await findAttendance(session.employeeId, date);

  return Response.json({
    employee: { name: employee.name, designation: employee.designation, otEligible: employee.otEligible },
    date,
    checkedIn: !!row?.inTime,
    checkedOut: !!row?.outTime,
    status: row?.status || null,
    inTime: row?.inTime || null,
    outTime: row?.outTime || null,
    otHours: row?.otHours || 0,
  });
}
