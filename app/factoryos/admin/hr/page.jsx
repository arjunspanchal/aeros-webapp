import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
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
  if (!requireManager(session)) redirect("/factoryos");

  const [allEmployees, users] = await Promise.all([listEmployees(), listUsers()]);
  const factoryManagers = users.filter((u) => u.role === ROLES.FACTORY_MANAGER && u.active);

  // Factory Manager sees only their own reports. Admin sees everyone.
  // Critical: filter server-side so other managers' data never ships to the client.
  const isAdmin = session.modules?.factoryos === ROLES.ADMIN;
  const employees = isAdmin ? allEmployees : allEmployees.filter((e) => e.managerId === session.factoryosUserId);

  // Compute current-month attendance gaps for the scoped employees.
  const monthKey = currentMonthKeyIST();
  const today = todayYmdIST();
  const visibleIds = new Set(employees.map((e) => e.id));
  const monthAttendance = employees.length
    ? (await listAttendance({ from: monthStart(monthKey), to: monthEnd(monthKey) }))
        .filter((r) => visibleIds.has(r.employeeId))
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
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← Admin
        </Link>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">HR</h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              {isAdmin ? "Employee roster, attendance, calendar, payroll." : "Your reports only — managed by you."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/factoryos/admin/hr/attendance" className="px-3 py-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Mark attendance
            </Link>
            <Link href="/factoryos/admin/hr/calendar" className="px-3 py-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Calendar
            </Link>
            <Link href="/factoryos/admin/hr/payroll" className="px-3 py-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Payroll
            </Link>
          </div>
        </div>

        {gaps.length > 0 && (
          <AttendanceGapsWidget gaps={gaps} employeeNameById={employeeNameById} monthKey={monthKey} />
        )}

        <EmployeesAdmin
          initialEmployees={employees}
          factoryManagers={factoryManagers}
          isAdmin={isAdmin}
          currentUserId={session.factoryosUserId || null}
        />
      </main>
    </div>
  );
}
