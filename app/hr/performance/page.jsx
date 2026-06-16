import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { resolveFactoryosUserId } from "@/lib/hub/users";
import { isHrAdmin } from "@/lib/factoryos/hrScope";
import { listEmployees, listAttendance, listHolidays } from "@/lib/factoryos/repo";
import { currentMonthKeyIST, monthStart, monthEnd, todayYmdIST } from "@/lib/factoryos/hr";
import { summarizeAttendance } from "@/lib/factoryos/attendanceStats";
import PerformanceDashboard from "./PerformanceDashboard";

export const dynamic = "force-dynamic";

export default async function PerformancePage({ searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "hr")) redirect("/hub");

  const monthKey = (searchParams?.month && /^\d{4}-\d{2}$/.test(searchParams.month))
    ? searchParams.month
    : currentMonthKeyIST();

  const allEmployees = await listEmployees();
  const isAdmin = isHrAdmin(session);
  const myUserId = isAdmin ? null : await resolveFactoryosUserId(session);
  // Active employees only, scoped to the manager's reports unless admin.
  const employees = (isAdmin ? allEmployees : allEmployees.filter((e) => e.managerId === myUserId))
    .filter((e) => e.active);

  const from = monthStart(monthKey);
  const to = monthEnd(monthKey);
  const visibleIds = new Set(employees.map((e) => e.id));

  const [allAttendance, monthHolidays] = await Promise.all([
    listAttendance({ from, to }),
    listHolidays({ from, to }),
  ]);

  const attendanceByEmployee = {};
  for (const r of allAttendance) {
    if (!visibleIds.has(r.employeeId)) continue;
    (attendanceByEmployee[r.employeeId] ||= []).push(r);
  }

  const stats = summarizeAttendance({
    employees,
    attendanceByEmployee,
    holidayDates: monthHolidays.map((h) => h.date),
    monthStartIso: from,
    monthEndIso: to,
    todayIso: todayYmdIST(),
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hr" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← HR
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Attendance performance</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Presence, punctuality and overtime across {isAdmin ? "all employees" : "your reports"} for the selected month.
        </p>
        <PerformanceDashboard
          monthKey={monthKey}
          stats={stats}
          scopeLabel={isAdmin ? "All employees" : "Your reports"}
        />
      </main>
    </div>
  );
}
