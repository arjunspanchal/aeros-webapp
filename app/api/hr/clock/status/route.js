// Punch-clock: today's state for the signed-in worker. Drives the button
// (Check In vs Check Out vs done-for-the-day).
import { getEmpSession } from "@/lib/factoryos/empAuth";
import { getEmployee, findAttendance } from "@/lib/factoryos/repo";
import { todayYmdIST, nowHmIST, addDaysYmd, overnightShiftActive } from "@/lib/factoryos/hr";

export const runtime = "nodejs";

export async function GET() {
  const session = getEmpSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });

  const employee = await getEmployee(session.employeeId);
  if (!employee || !employee.active) {
    return Response.json({ error: "Account inactive" }, { status: 403 });
  }

  const date = todayYmdIST();
  const now = nowHmIST();
  const todayRow = await findAttendance(session.employeeId, date);

  // The shift the worker should act on. Normally today's row, but if there's no
  // row today AND yesterday's shift is still open within the overnight window
  // (e.g. checked in 09:00, now 03:00 — OT in progress), act on that instead so
  // the clock shows "Check Out", not a fresh "Check In".
  let row = todayRow;
  let inYesterday = false;
  if (!todayRow) {
    const yRow = await findAttendance(session.employeeId, addDaysYmd(date, -1));
    if (yRow?.inTime && !yRow.outTime && overnightShiftActive(addDaysYmd(date, -1), date, now)) {
      row = yRow;
      inYesterday = true;
    }
  }

  return Response.json({
    employee: {
      name: employee.name,
      designation: employee.designation,
      otEligible: employee.otEligible,
      workMode: String(employee.workMode || "WFO").toUpperCase() === "WFH" ? "WFH" : "WFO",
    },
    date,
    checkedIn: !!row?.inTime,
    checkedOut: !!row?.outTime,
    inYesterday,
    status: row?.status || null,
    inTime: row?.inTime || null,
    outTime: row?.outTime || null,
    otHours: row?.otHours || 0,
  });
}
