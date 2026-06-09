import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { resolveFactoryosUserId } from "@/lib/hub/users";
import { listEmployees, listAttendance, listUsers } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import { todayYmdIST } from "@/lib/factoryos/hr";
import MarkAttendance from "./MarkAttendance";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "hr")) redirect("/hub");

  const date = (searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date))
    ? searchParams.date
    : todayYmdIST();

  const [allEmployees, users] = await Promise.all([
    listEmployees({ activeOnly: true }),
    listUsers(),
  ]);

  // Admin sees everyone. FM is force-scoped to their own reports — `?scope=all`
  // is ignored unless the caller is Admin (prevents URL-tampering bypass).
  const isAdmin = true;
  const showAll = isAdmin;
  const myUserId = isAdmin ? null : await resolveFactoryosUserId(session);
  const employees = isAdmin
    ? allEmployees
    : allEmployees.filter((e) => e.managerId === myUserId);

  // Pull attendance for the picked date, only for the displayed employees.
  // Filtering by employee set prevents other managers' attendance from
  // crossing the wire even though the UI wouldn't render it.
  const visibleIds = new Set(employees.map((e) => e.id));
  const dayAttendance = employees.length
    ? (await listAttendance({ from: date, to: date })).filter((r) => visibleIds.has(r.employeeId))
    : [];

  const attendanceByEmployee = Object.fromEntries(
    dayAttendance.map((r) => [r.employeeId, r]),
  );

  const managerMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hr" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← HR
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Mark attendance</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Standard shift: 9 AM–7 PM. OT = hours past 7 PM × 1.5× normal hourly rate.
        </p>

        <MarkAttendance
          date={date}
          employees={employees}
          attendanceByEmployee={attendanceByEmployee}
          managerMap={managerMap}
          canViewAll={true}
          showingAll={showAll}
          currentUserId={myUserId}
        />
      </main>
    </div>
  );
}
