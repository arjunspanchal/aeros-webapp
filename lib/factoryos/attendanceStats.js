// Attendance → performance metrics. Pure functions (server or client) that turn
// a month of attendance rows into per-employee stats, company aggregates, and a
// daily attendance trend. Drives the /hr/performance dashboard + its export.
//
// Definitions:
//   working days   = calendar days in the window that are neither a weekly-off
//                    nor a company holiday (per the employee). The window is the
//                    month, capped at "today" so the current month isn't
//                    penalised for days that haven't happened yet.
//   present-equiv  = P counts 1, H (half-day) counts 0.5.
//   attendance %   = present-equiv ÷ working days. Leave (paid/unpaid) and
//                    absence both lower it; a working day with no punch at all
//                    counts as absent.
//   late           = a P/H day whose in-time is past the grace period.

import { isWorkingDay, isLate, addDaysYmd } from "@/lib/factoryos/hr";

function buildByDate(rows) {
  const m = {};
  for (const r of rows || []) if (r.date) m[r.date] = r;
  return m;
}

export function summarizeAttendance({
  employees = [],
  attendanceByEmployee = {},
  holidayDates = [],
  monthStartIso,
  monthEndIso,
  todayIso,
}) {
  const holidaySet = new Set(holidayDates);
  // Don't count days that haven't happened yet in the current month.
  const end = todayIso && todayIso < monthEndIso ? todayIso : monthEndIso;
  const maps = {};
  for (const e of employees) maps[e.id] = buildByDate(attendanceByEmployee[e.id]);

  const perEmployee = employees.map((e) => {
    const byDate = maps[e.id];
    let workingDays = 0;
    let present = 0, half = 0, absentMarked = 0, paidLeave = 0, unpaidLeave = 0;
    let late = 0, ot = 0, noRecord = 0;

    let cur = monthStartIso;
    while (cur <= end) {
      if (isWorkingDay(cur, e.weeklyOffDays, holidaySet)) {
        workingDays += 1;
        const r = byDate[cur];
        const st = r?.status;
        if (st === "P" || st === "H") {
          if (st === "P") present += 1; else half += 1;
          if (isLate(r.inTime)) late += 1;
          ot += Number(r.otHours) || 0;
        } else if (st === "A") {
          absentMarked += 1;
        } else if (st === "PL") {
          paidLeave += 1;
        } else if (st === "UL") {
          unpaidLeave += 1;
        } else {
          noRecord += 1; // working day, no row at all
        }
      }
      cur = addDaysYmd(cur, 1);
    }

    const absent = absentMarked + noRecord; // missing punch ⇒ absent
    const presentEquiv = present + half * 0.5;
    const attendancePct = workingDays ? (presentEquiv / workingDays) * 100 : 0;
    const onTime = present + half - late; // present days that weren't late
    const leave = paidLeave + unpaidLeave;

    return {
      id: e.id,
      name: e.name,
      designation: e.designation || "",
      otEligible: !!e.otEligible,
      workingDays,
      present,
      half,
      onTime,
      late,
      paidLeave,
      unpaidLeave,
      leave,
      absent,
      ot: Number(ot.toFixed(2)),
      presentEquiv,
      attendancePct: Number(attendancePct.toFixed(1)),
    };
  });

  const totalWorking = perEmployee.reduce((s, p) => s + p.workingDays, 0);
  const totalPresentEquiv = perEmployee.reduce((s, p) => s + p.presentEquiv, 0);
  const company = {
    headcount: employees.length,
    avgAttendancePct: totalWorking ? Number(((totalPresentEquiv / totalWorking) * 100).toFixed(1)) : 0,
    totalOt: Number(perEmployee.reduce((s, p) => s + p.ot, 0).toFixed(1)),
    totalAbsent: perEmployee.reduce((s, p) => s + p.absent, 0),
    totalLate: perEmployee.reduce((s, p) => s + p.late, 0),
  };

  // Daily trend: % of expected (working that day) employees who were present.
  const trend = [];
  let cur = monthStartIso;
  while (cur <= end) {
    let expected = 0, presentCount = 0;
    for (const e of employees) {
      if (!isWorkingDay(cur, e.weeklyOffDays, holidaySet)) continue;
      expected += 1;
      const r = maps[e.id][cur];
      if (r && (r.status === "P" || r.status === "H")) presentCount += 1;
    }
    if (expected > 0) {
      trend.push({ date: cur, pct: Number(((presentCount / expected) * 100).toFixed(1)) });
    }
    cur = addDaysYmd(cur, 1);
  }

  return { perEmployee, company, trend, windowEnd: end };
}
