import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { listLeaveRequests, listEmployees } from "@/lib/factoryos/repo";
import { hrScope } from "@/lib/factoryos/hrScope";
import LeavesAdmin from "./LeavesAdmin";

export const dynamic = "force-dynamic";

export default async function LeavesPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "hr")) redirect("/hub");

  let requests = await listLeaveRequests({});
  const scope = await hrScope(session);
  if (!scope.isAdmin) {
    const mine = await listEmployees({ managerUserId: scope.managerUserId });
    const ids = new Set(mine.map((e) => e.id));
    requests = requests.filter((r) => ids.has(r.employeePublicId));
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/hr" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← HR
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Leave requests</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Workers apply from the punch clock. Approving writes the leave onto their attendance
          (paid leave is never docked; unpaid leave is). {pendingCount} pending.
        </p>
        <LeavesAdmin initialRequests={requests} />
      </main>
    </div>
  );
}
