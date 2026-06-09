// Shared HR / payroll helpers. Pure functions — safe on server or client.

import {
  ATTENDANCE_WEIGHT,
  OT_MULTIPLIER,
  PAYROLL_DAYS_IN_MONTH,
  STANDARD_SHIFT_HOURS,
} from "@/lib/factoryos/constants";

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function todayYmd() {
  return ymd(new Date());
}

// Month key: "YYYY-MM"
export function monthKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`;
}

export function monthStart(mk) {
  const [y, m] = mk.split("-").map(Number);
  return `${y}-${pad2(m)}-01`;
}

export function monthEnd(mk) {
  const [y, m] = mk.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(last)}`;
}

export function daysInMonth(mk) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function shiftHours() {
  return STANDARD_SHIFT_HOURS;
}

// Normal hourly rate = monthly salary / 30 days / 10-hr shift.
export function hourlyRate(employee) {
  const base = Number(employee.monthlySalary) || 0;
  if (base <= 0) return 0;
  return base / PAYROLL_DAYS_IN_MONTH / STANDARD_SHIFT_HOURS;
}

export function otHourlyRate(employee) {
  if (!employee.otEligible) return 0;
  return hourlyRate(employee) * OT_MULTIPLIER;
}

// Given a flat list of attendance rows for one employee over a month,
// compute payroll for that month.
// Formula (per user spec):
//   base × presentDays / 30  +  OT hours × (salary/30/10 × 1.5)
// Half-day counts as 0.5 day. Absent = 0. OT only accrues when OT-eligible
// and status=P (already enforced on write; we don't double-check here).
export function computePayroll(employee, attendance) {
  const presentDays = attendance.reduce(
    (sum, r) => sum + (ATTENDANCE_WEIGHT[r.status] ?? 0),
    0,
  );
  const otHours = attendance.reduce((sum, r) => sum + (Number(r.otHours) || 0), 0);
  const base = Number(employee.monthlySalary) || 0;
  const basePay = (base * presentDays) / PAYROLL_DAYS_IN_MONTH;
  const otPay = otHours * otHourlyRate(employee);
  return {
    presentDays: Number(presentDays.toFixed(2)),
    otHours: Number(otHours.toFixed(2)),
    basePay: Number(basePay.toFixed(2)),
    otPay: Number(otPay.toFixed(2)),
    otRate: Number(otHourlyRate(employee).toFixed(2)),
    total: Number((basePay + otPay).toFixed(2)),
  };
}

export function formatINR(n) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// Current month key for India (IST) — avoids the "wrong month at midnight UTC" bug.
// getTime() is UTC ms; shifting by +5.5h then reading UTC fields yields IST wall time.
export function currentMonthKeyIST() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}`;
}

export function todayYmdIST() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}-${pad2(ist.getUTCDate())}`;
}

// Current IST wall-clock time as "HH:MM". Used by the punch clock to stamp
// in/out times in the same shape the manual attendance form produces, so OT
// math (hours past 19:00) is identical for self- and manager-marked rows.
export function nowHmIST() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return `${pad2(ist.getUTCHours())}:${pad2(ist.getUTCMinutes())}`;
}

// Find (date, employeeIds[]) pairs where attendance is missing for the month
// up through `upToDate` inclusive (pass today so future days aren't flagged).
// An employee is only "expected" on dates >= their joining date. Inactive
// employees are skipped entirely. Returns dates in descending order (newest
// gap first — easier to spot recent misses).
export function findAttendanceGaps({ monthKey, upToDate, employees, attendance }) {
  const byEmpDate = new Set();
  for (const r of attendance) if (r.employeeId && r.date) byEmpDate.add(`${r.employeeId}|${r.date}`);

  const active = employees.filter((e) => e.active);
  const [y, m] = monthKey.split("-").map(Number);
  const totalDays = new Date(y, m, 0).getDate();

  const gaps = [];
  for (let d = totalDays; d >= 1; d--) {
    const iso = `${monthKey}-${pad2(d)}`;
    if (upToDate && iso > upToDate) continue;
    const missing = [];
    for (const e of active) {
      if (e.joiningDate && iso < e.joiningDate) continue;
      if (!byEmpDate.has(`${e.id}|${iso}`)) missing.push(e.id);
    }
    if (missing.length) gaps.push({ date: iso, missingEmployeeIds: missing });
  }
  return gaps;
}
