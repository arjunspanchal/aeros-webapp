import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession as getFactoryosSession } from "@/lib/factoryos/session";
import { getSession, requireManager } from "@/lib/auth/session";
import { listEmployees, listAttendance, listUsers } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import { computePayroll, currentMonthKeyIST, monthEnd, monthStart } from "@/lib/factoryos/hr";
import PayrollView from "./PayrollView";

export const dynamic = "force-dynamic";

export default async function PayrollPage({ searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");
  // Legacy factoryos session kept for s.role — used below to scope FM to
  // their own reports. PR 1.3+ collapses.
  const s = getFactoryosSession();

  const monthKey = (searchParams?.month && /^\d{4}-\d{2}$/.test(searchParams.month))
    ? searchParams.month
    : currentMonthKeyIST();

  const [allEmployees, users] = await Promise.all([
    listEmployees(),
    listUsers(),
  ]);
  const isAdmin = s.role === ROLES.ADMIN;
  const showAll = isAdmin;
  const employees = isAdmin
    ? allEmployees
    : allEmployees.filter((e) => e.managerId === s.userId);

  const from = monthStart(monthKey);
  const to = monthEnd(monthKey);
  const allAttendance = await listAttendance({ from, to });
  const byEmployee = {};
  for (const r of allAttendance) {
    if (!byEmployee[r.employeeId]) byEmployee[r.employeeId] = [];
    byEmployee[r.employeeId].push(r);
  }

  const rows = employees.map((e) => ({
    employee: e,
    payroll: computePayroll(e, byEmployee[e.id] || []),
  }));

  const managerMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin/hr" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← HR
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Payroll</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Base pay = monthly salary × present days / 30. OT pay = OT hours × (salary/30/10 × 1.5).
        </p>

        <PayrollView
          monthKey={monthKey}
          rows={rows}
          managerMap={managerMap}
          canToggleScope={s.role === ROLES.ADMIN}
          showingAll={showAll}
        />
      </main>
    </div>
  );
}
