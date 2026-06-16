// Shared HR / payroll helpers. Pure functions — safe on server or client.

import {
  ATTENDANCE_WEIGHT,
  ATTENDANCE_LOP,
  DEFAULT_WEEKLY_OFF,
  LATE_GRACE_MINUTES,
  OT_CUTOFF_HM,
  OT_MULTIPLIER,
  PAYROLL_DAYS_IN_MONTH,
  SHIFT_START,
  STANDARD_SHIFT_HOURS,
} from "@/lib/factoryos/constants";

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

function hmToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Is this check-in "late"? In-time later than shift start + grace minutes.
export function isLate(inTime, shiftStart = SHIFT_START, graceMin = LATE_GRACE_MINUTES) {
  const i = hmToMinutes(inTime);
  const s = hmToMinutes(shiftStart);
  if (i == null || s == null) return false;
  return i > s + graceMin;
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// Shift a "YYYY-MM-DD" string by whole days (UTC-anchored, never drifts).
export function addDaysYmd(iso, delta) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + delta * 86400000);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

// Is an open shift (checked in on `inDate`, not yet checked out) still within
// its window — i.e. should the clock still offer "Check Out" and treat a punch
// as live? The hard end is `cutoffHm` on the day AFTER inDate (the overnight OT
// ceiling). True up to and including that moment; false once it has passed, at
// which point the shift is auto-closed at the cutoff instead. `now` = current
// IST date + "HH:MM".
export function overnightShiftActive(inDate, nowYmd, nowHm, cutoffHm = OT_CUTOFF_HM) {
  const endDate = addDaysYmd(inDate, 1);
  if (nowYmd < endDate) return true; // same day as (or before) check-in
  if (nowYmd === endDate) return nowHm <= cutoffHm; // morning after, before cutoff
  return false; // past the cutoff day
}

// Day-of-week (0=Sun..6=Sat) for a "YYYY-MM-DD" string, parsed in UTC so it
// never shifts across timezones.
export function dowOfYmd(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Is `iso` a working day for this employee? Non-working = a company holiday
// OR one of the employee's weekly-off days. Monthly-salaried staff are paid
// for non-working days, and they're never flagged as a missing attendance mark.
export function isWorkingDay(iso, weeklyOffDays, holidaySet) {
  if (holidaySet && holidaySet.has(iso)) return false;
  const offs = Array.isArray(weeklyOffDays) && weeklyOffDays.length ? weeklyOffDays : DEFAULT_WEEKLY_OFF;
  return !offs.includes(dowOfYmd(iso));
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

// Given a flat list of attendance rows for one employee over a month, compute
// payroll. Monthly-salaried model: the worker is paid for the WHOLE month
// (incl. Sundays/holidays/weekly-offs); we only DOCK explicit loss-of-pay days.
//
//   lopDays   = Σ lopWeight(status)   — Absent=1, Unpaid Leave=1, Half Day=0.5
//   payable   = 30 − lopDays          (capped ≥ 0)
//   basePay   = salary × payable / 30
//   otPay     = OT hours × (salary/30/10 × 1.5), OT-eligible only
//
// Crucially, days WITHOUT a row contribute nothing — they're treated as paid.
// So HR only needs to mark exceptions (absences/leaves/half-days); Present and
// non-working days never need a row to be paid. Paid Leave / Holiday / Weekly
// Off carry lopWeight 0, so they're paid too.
export function computePayroll(employee, attendance) {
  let presentDays = 0;
  let lopDays = 0;
  let otHours = 0;
  for (const r of attendance) {
    presentDays += ATTENDANCE_WEIGHT[r.status] ?? 0;
    lopDays += ATTENDANCE_LOP[r.status] ?? 0;
    otHours += Number(r.otHours) || 0;
  }
  const base = Number(employee.monthlySalary) || 0;
  const payableDays = Math.max(0, PAYROLL_DAYS_IN_MONTH - lopDays);
  const basePay = (base * payableDays) / PAYROLL_DAYS_IN_MONTH;
  const otPay = otHours * otHourlyRate(employee);
  return {
    presentDays: round2(presentDays),
    lopDays: round2(lopDays),
    payableDays: round2(payableDays),
    otHours: round2(otHours),
    basePay: round2(basePay),
    otPay: round2(otPay),
    otRate: round2(otHourlyRate(employee)),
    total: round2(basePay + otPay),
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

// Great-circle distance between two lat/lng points, in metres (haversine).
// Used by the punch-clock geofence to check a WFO worker is at the office.
export function distanceMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Find (date, employeeIds[]) pairs where an attendance mark is missing on a
// WORKING day, for the month up through `upToDate` inclusive. Skips:
//   • future days (iso > upToDate)
//   • days before an employee's joining date
//   • inactive employees
//   • the employee's weekly-off days (default Sunday)
//   • company holidays (`holidays` = array of "YYYY-MM-DD")
// This is what fixes the "35 missing" false alarms — Sundays/holidays are no
// longer expected to have a mark. Returns dates newest-first.
export function findAttendanceGaps({ monthKey, upToDate, employees, attendance, holidays = [] }) {
  const byEmpDate = new Set();
  for (const r of attendance) if (r.employeeId && r.date) byEmpDate.add(`${r.employeeId}|${r.date}`);
  const holidaySet = new Set(holidays);

  const active = employees.filter((e) => e.active);
  const [y, m] = monthKey.split("-").map(Number);
  const totalDays = new Date(y, m, 0).getDate();

  const gaps = [];
  for (let d = totalDays; d >= 1; d--) {
    const iso = `${monthKey}-${pad2(d)}`;
    if (upToDate && iso > upToDate) continue;
    if (holidaySet.has(iso)) continue; // company holiday — nobody's expected
    const missing = [];
    for (const e of active) {
      if (e.joiningDate && iso < e.joiningDate) continue;
      if (!isWorkingDay(iso, e.weeklyOffDays, holidaySet)) continue; // weekly off
      if (!byEmpDate.has(`${e.id}|${iso}`)) missing.push(e.id);
    }
    if (missing.length) gaps.push({ date: iso, missingEmployeeIds: missing });
  }
  return gaps;
}
