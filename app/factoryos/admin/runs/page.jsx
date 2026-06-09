import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { listRuns, listMachines, listJobsForSession } from "@/lib/factoryos/repo";
import RunsAdmin from "./RunsAdmin";
import RunsSummary from "./RunsSummary";

export const dynamic = "force-dynamic";

export default async function AdminRunsPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");
  const [runs, machines, jobs] = await Promise.all([
    listRuns({ limit: 200 }),
    listMachines(),
    listJobsForSession({
      role: session.modules?.factoryos,
      userId: session.factoryosUserId,
      clientIds: session.factoryosClientIds,
    }).catch(() => []),
  ]);
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Production runs</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Each run = one shift / batch on a machine. Log RM consumed (kgs) and output produced (pcs). Consumption automatically decrements RM Inventory.
        </p>
        {/* PR_G: today + running-now + idle-machine summary above the
            existing form/list grid. Server-rendered snapshot — no client
            ticking; refresh for fresh elapsed times. */}
        <RunsSummary runs={runs} machines={machines} jobs={jobs} />
        <RunsAdmin initialRuns={runs} machines={machines} jobs={jobs} currentUser={{ email: session.email, name: session.name }} />
      </main>
    </div>
  );
}
