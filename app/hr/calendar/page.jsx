import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { resolveFactoryosUserId } from "@/lib/hub/users";
import { isHrAdmin } from "@/lib/factoryos/hrScope";
import { listEmployees, listAttendance, listUsers, listHolidays } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import {
  currentMonthKeyIST,
  monthEnd,
  monthStart,
} from "@/lib/factoryos/hr";
import CalendarView from "./CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "hr")) redirect("/hub");

  const monthKey = (searchParams?.month && /^\d{4}-\d{2}$/.test(searchParams.month))
    ? searchParams.month
    : currentMonthKeyIST();

  const [allEmployees, users] = await Promise.all([
    listEmployees(),
    listUsers(),
  ]);

  const isAdmin = isHrAdmin(session);
  const showAll = isAdmin;
  const myUserId = isAdmin ? null : await resolveFactoryosUserId(session);
  const employees = isAdmin
    ? allEmployees
    : allEmployees.filter((e) => e.managerId === myUserId);

  const from = monthStart(monthKey);
  const to = monthEnd(monthKey);

  // Fetch attendance once for the whole month, then split per employee.
  // Restricted to visible employees so other managers' rows never ship to the client.
  const visibleIds = new Set(employees.map((e) => e.id));
  const [allAttendance, monthHolidays] = await Promise.all([
    listAttendance({ from, to }),
    listHolidays({ from, to }),
  ]);
  const holidayMap = Object.fromEntries(monthHolidays.map((h) => [h.date, h.name]));
  const byEmployee = {};
  for (const r of allAttendance) {
    if (!visibleIds.has(r.employeeId)) continue;
    if (!byEmployee[r.employeeId]) byEmployee[r.employeeId] = [];
    byEmployee[r.employeeId].push(r);
  }

  const managerMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hr" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← HR
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Attendance calendar</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          P Present · A Absent · H Half-day · PL Paid leave · UL Unpaid leave. Grey = weekly-off, blue = holiday. Green ring = OT.
        </p>
        <CalendarView
          monthKey={monthKey}
          employees={employees}
          attendanceByEmployee={byEmployee}
          managerMap={managerMap}
          holidayMap={holidayMap}
          canToggleScope={isAdmin}
          showingAll={showAll}
        />
      </main>
    </div>
  );
}
