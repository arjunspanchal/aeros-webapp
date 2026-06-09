import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { listEmployees, listUsers, listAttendance } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import {
  currentMonthKeyIST,
  findAttendanceGaps,
  monthEnd,
  monthStart,
  todayYmdIST,
} from "@/lib/factoryos/hr";
import EmployeesAdmin from "./EmployeesAdmin";
import AttendanceGapsWidget from "./AttendanceGapsWidget";

export const dynamic = "force-dynamic";

export default async function HrPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "hr")) redirect("/hub");

  // HR is single-level full access — anyone with modules.hr sees the full
  // roster. The legacy per-manager scoping branches (and a hardcoded
  // isAdmin = true that bypassed them) were removed when HR moved out of
  // FactoryOS; see commit "Move HR out of FactoryOS into its own top-level
  // module (/hr)" for the design note.
  const [employees, users] = await Promise.all([listEmployees(), listUsers()]);
  const factoryManagers = users.filter((u) => u.role === ROLES.FACTORY_MANAGER && u.active);

  // Compute current-month attendance gaps for the full roster.
  const monthKey = currentMonthKeyIST();
  const today = todayYmdIST();
  const monthAttendance = employees.length
    ? await listAttendance({ from: monthStart(monthKey), to: monthEnd(monthKey) })
    : [];
  const gaps = findAttendanceGaps({
    monthKey,
    upToDate: today,
    employees,
    attendance: monthAttendance,
  });
  const employeeNameById = Object.fromEntries(employees.map((e) => [e.id, e.name]));

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
