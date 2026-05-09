import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { listJobsForSession, listClients, listUsers } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import StatusChart from "@/app/factoryos/_components/StatusChart";
import { StageBadge, formatDate } from "@/app/factoryos/_components/ui";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");
  const role = session.modules?.factoryos;

  const [jobs, clients, users] = await Promise.all([
    listJobsForSession({
      role,
      userId: session.factoryosUserId,
      clientIds: session.factoryosClientIds,
    }),
    listClients(),
    listUsers(),
  ]);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const recent = jobs.slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-6">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
            <Link
              href="/factoryos/admin/jobs/new"
              className="shrink-0 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + New job
            </Link>
          </div>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            {jobs.length} jobs · {clients.length} customers · {users.length} users
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href="/factoryos/admin/clients" className="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Manage customers
            </Link>
            {/* User management moved to the hub-level /admin/access page —
                roles + pricing + client links live in one editor there. */}
            <Link href="/factoryos/admin/inventory" className="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              RM inventory
            </Link>
            <Link href="/factoryos/admin/coating" className="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              PE coating
            </Link>
            {/* Master RM rates are admin-only (rates feed COGS) — hide for FM who otherwise sees this dashboard. */}
            {role === ROLES.ADMIN && (
              <Link href="/factoryos/admin/master-papers" className="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
                Master RM rates
              </Link>
            )}
            <Link href="/factoryos/admin/machines" className="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Machines
            </Link>
            <Link href="/factoryos/admin/vendors" className="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Vendors
            </Link>
            <Link href="/factoryos/admin/runs" className="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              Production runs
            </Link>
            <Link href="/factoryos/admin/hr" className="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800">
              HR
            </Link>
          </div>
        </header>

        <div className="mb-6">
          <StatusChart jobs={jobs} title="Jobs by stage" />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent jobs</h2>
            <Link href="/factoryos/manager" className="text-xs text-blue-600 hover:underline dark:text-blue-400">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">J#</th>
                  <th className="text-left px-4 py-2 font-medium">Customer / Brand</th>
                  <th className="text-left px-4 py-2 font-medium">Item</th>
                  <th className="text-right px-4 py-2 font-medium">Qty</th>
                  <th className="text-left px-4 py-2 font-medium">Stage</th>
                  <th className="text-left px-4 py-2 font-medium">Dispatch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recent.map((j) => (
                  <tr key={j.id}>
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/factoryos/admin/jobs/${j.id}`} className="text-blue-600 hover:underline dark:text-blue-400">{j.jNumber}</Link>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-gray-900 dark:text-white">{j.clientIds.map((c) => clientMap[c]?.name).filter(Boolean).join(", ") || "—"}</div>
                      {j.brand && <div className="text-xs text-gray-500 dark:text-gray-400">{j.brand}</div>}
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white">{j.item}</td>
                    <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                      {j.qty != null ? j.qty.toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-2"><StageBadge stage={j.stage} /></td>
                    <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{formatDate(j.expectedDispatchDate)}</td>
                  </tr>
                ))}
                {recent.length === 0 && <tr><td colSpan={6} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">No jobs yet. Create one to get started.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
