import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { listEmployees, listUsers, listAttendance, listHolidays } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import {
  currentMonthKeyIST,
  findAttendanceGaps,
  isWorkingDay,
  monthEnd,
  monthStart,
  todayYmdIST,
} from "@/lib/factoryos/hr";
import { hrScope } from "@/lib/factoryos/hrScope";
import EmployeesAdmin from "./EmployeesAdmin";
import AttendanceGapsWidget from "./AttendanceGapsWidget";

export const dynamic = "force-dynamic";

export default async function HrPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "hr")) redirect("/hub");

  // HR Admin sees everyone; HR Manager sees only their own reports.
  const [allEmployees, users] = await Promise.all([listEmployees(), listUsers()]);
  const { isAdmin, managerUserId } = await hrScope(session);
  const employees = isAdmin ? allEmployees : allEmployees.filter((e) => e.managerId === managerUserId);
  const factoryManagers = users.filter((u) => u.role === ROLES.FACTORY_MANAGER && u.active);

  const monthKey = currentMonthKeyIST();
  const today = todayYmdIST();
  const visibleIds = new Set(employees.map((e) => e.id));
  const [monthAttendanceAll, monthHolidays] = await Promise.all([
    employees.length ? listAttendance({ from: monthStart(monthKey), to: monthEnd(monthKey) }) : [],
    listHolidays({ from: monthStart(monthKey), to: monthEnd(monthKey) }),
  ]);
  // Scope attendance to visible employees so a manager never receives other
  // managers' rows over the wire.
  const monthAttendance = monthAttendanceAll.filter((r) => visibleIds.has(r.employeeId));
  const holidayDates = monthHolidays.map((h) => h.date);
  const gaps = findAttendanceGaps({
    monthKey,
    upToDate: today,
    employees,
    attendance: monthAttendance,
    holidays: holidayDates,
  });
  const employeeNameById = Object.fromEntries(employees.map((e) => [e.id, e.name]));

  // ----- Today's snapshot (dashboard) -----
  const holidaySet = new Set(holidayDates);
  const todayHolidayName = monthHolidays.find((h) => h.date === today)?.name || null;
  const todayByEmp = {};
  for (const r of monthAttendance) if (r.date === today) todayByEmp[r.employeeId] = r;
  const snap = { expected: 0, present: 0, onLeave: 0, absent: 0, notMarked: 0, wfhPresent: 0 };
  for (const e of employees) {
    if (!e.active) continue;
    if (e.joiningDate && today < e.joiningDate) continue;
    if (!isWorkingDay(today, e.weeklyOffDays, holidaySet)) continue; // off/holiday today
    snap.expected += 1;
    const r = todayByEmp[e.id];
    if (!r) { snap.notMarked += 1; continue; }
    if (r.status === "P" || r.status === "H") {
      snap.present += 1;
      if (e.workMode === "WFH") snap.wfhPresent += 1;
    } else if (r.status === "PL" || r.status === "UL") {
      snap.onLeave += 1;
    } else if (r.status === "A") {
      snap.absent += 1;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hub" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← Hub
        </Link>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">HR</h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              Employee roster, attendance, calendar, payroll.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/hr/attendance" className="px-3 py-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Mark attendance
            </Link>
            <Link href="/hr/calendar" className="px-3 py-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Calendar
            </Link>
            <Link href="/hr/payroll" className="px-3 py-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Payroll
            </Link>
            <Link href="/hr/leaves" className="px-3 py-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Leave requests
            </Link>
            <Link href="/hr/holidays" className="px-3 py-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Holidays
            </Link>
            <Link
              href="/hr/clock"
              target="_blank"
              title="Worker self-service check-in / check-out — share this URL or open on a shared device"
              className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Punch clock ↗
            </Link>
          </div>
        </div>

        {/* ----- Today's snapshot ----- */}
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Today</h2>
            <Link href="/hr/attendance" className="text-xs text-blue-600 hover:underline dark:text-blue-400">Mark today →</Link>
          </div>
          {todayHolidayName && (
            <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300">
              🎉 Holiday today — {todayHolidayName}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Present" value={snap.present} sub={`of ${snap.expected} due`} tone="emerald" />
            <StatCard label="Not marked" value={snap.notMarked} tone={snap.notMarked ? "amber" : "gray"} />
            <StatCard label="Absent" value={snap.absent} tone={snap.absent ? "red" : "gray"} />
            <StatCard label="On leave" value={snap.onLeave} tone={snap.onLeave ? "sky" : "gray"} />
            <StatCard label="WFH present" value={snap.wfhPresent} tone={snap.wfhPresent ? "purple" : "gray"} />
          </div>
        </section>

        {gaps.length > 0 && (
          <AttendanceGapsWidget gaps={gaps} employeeNameById={employeeNameById} monthKey={monthKey} />
        )}

        <EmployeesAdmin
          initialEmployees={employees}
          factoryManagers={factoryManagers}
        />
      </main>
    </div>
  );
}

const TONES = {
  emerald: "text-emerald-700 dark:text-emerald-300",
  amber: "text-amber-700 dark:text-amber-300",
  red: "text-red-600 dark:text-red-400",
  sky: "text-sky-700 dark:text-sky-300",
  purple: "text-purple-700 dark:text-purple-300",
  gray: "text-gray-400 dark:text-gray-500",
};

function StatCard({ label, value, sub, tone = "gray" }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 dark:bg-gray-900 dark:border-gray-800">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${TONES[tone] || TONES.gray}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  );
}
