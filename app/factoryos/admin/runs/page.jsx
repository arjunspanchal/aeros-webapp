import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession as getFactoryosSession } from "@/lib/factoryos/session";
import { getSession, requireManager } from "@/lib/auth/session";
import { listRuns, listMachines, listJobsForSession } from "@/lib/factoryos/repo";
import RunsAdmin from "./RunsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminRunsPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");
  // Legacy factoryos session still used below for s.email / s.name (passed
  // into RunsAdmin) and listJobsForSession (FM-scoping). PR 1.3+ collapses.
  const s = getFactoryosSession();
  const [runs, machines, jobs] = await Promise.all([
    listRuns({ limit: 200 }),
    listMachines(),
    listJobsForSession(s).catch(() => []),
  ]);
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Production runs</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Each run = one shift / batch on a machine. Log RM consumed (kgs) and output produced (pcs). Consumption automatically decrements RM Inventory.
        </p>
        <RunsAdmin initialRuns={runs} machines={machines} jobs={jobs} currentUser={{ email: s.email, name: s.name }} />
      </main>
    </div>
  );
}
