import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listClients, listJobsForSession } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";

export const dynamic = "force-dynamic";

// Read-only customer directory under the /manager tree so account managers
// can reach it. The /admin/clients page is the editable directory; this is
// a parallel surface scoped by viewer:
//
//   admin / factory_manager → see all customers
//   account_manager         → see only their assigned `factoryosClientIds`
//   factory_executive       → bounced to /factoryos/manager (shop floor
//                             doesn't need customer lookups)
//   customer / vendor       → bounced to /factoryos
//
// Layout audit W2: AM previously had no path to a customer's contact /
// address / past-job history without asking an FM. They're the sales-side
// role; this was the gap most likely to cause day-to-day handoff friction.
export default async function ManagerCustomersPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.CUSTOMER || role === ROLES.VENDOR) redirect("/factoryos");
  if (role === ROLES.FACTORY_EXECUTIVE) redirect("/factoryos/manager");

  const [allClients, jobs] = await Promise.all([
    listClients(),
    listJobsForSession({
      role,
      userId: session.factoryosUserId,
      clientIds: session.factoryosClientIds,
    }),
  ]);

  // Scope: AMs see only their assigned customers; everyone else sees all.
  const myIds = new Set(session.factoryosClientIds || []);
  const scoped = role === ROLES.ACCOUNT_MANAGER
    ? allClients.filter((c) => myIds.has(c.id))
    : allClients;

  // Build a "open jobs" count per customer from the same scoped jobs payload
  // so the table can sort by activity. "Open" = anything not Delivered.
  const jobCounts = new Map();
  for (const j of jobs) {
    if (j.stage === "Delivered") continue;
    for (const cid of j.clientIds) {
      jobCounts.set(cid, (jobCounts.get(cid) || 0) + 1);
    }
  }

  // Sort customers by open-job count descending so the most active ones
  // surface first. Customers with 0 open jobs alphabetise underneath.
  const sorted = scoped.slice().sort((a, b) => {
    const ja = jobCounts.get(a.id) || 0;
    const jb = jobCounts.get(b.id) || 0;
    if (ja !== jb) return jb - ja;
    return (a.name || "").localeCompare(b.name || "");
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          {role === ROLES.ACCOUNT_MANAGER
            ? `Your assigned customers · ${sorted.length} total`
            : `All customers · ${sorted.length} total`}
        </p>

        <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Customer</th>
                  <th className="text-left px-4 py-2 font-medium">Contact</th>
                  <th className="text-left px-4 py-2 font-medium">Phone</th>
                  <th className="text-left px-4 py-2 font-medium">Email</th>
                  <th className="text-right px-4 py-2 font-medium">Open jobs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {sorted.map((c) => {
                  const openCount = jobCounts.get(c.id) || 0;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-2">
                        <div className="text-gray-900 font-medium dark:text-white">{c.name}</div>
                        {c.code && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{c.code}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                        {c.contactPerson || "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 font-mono">
                        {c.contactPhone ? (
                          <a href={`tel:${c.contactPhone}`} className="hover:underline">{c.contactPhone}</a>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                        {c.contactEmail ? (
                          <a href={`mailto:${c.contactEmail}`} className="hover:underline">{c.contactEmail}</a>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {openCount > 0 ? (
                          <Link
                            href={`/factoryos/manager?client=${c.id}`}
                            className="text-blue-600 hover:underline dark:text-blue-400 font-mono"
                          >
                            {openCount}
                          </Link>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-gray-500 py-8 dark:text-gray-400">
                      {role === ROLES.ACCOUNT_MANAGER
                        ? "No customers assigned to you yet. Ask an admin to link you in /admin/access."
                        : "No customers yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* For admin/FM, surface a deep-link to the editable directory.
            AMs deliberately don't see this — they can't edit customer
            records. */}
        {(role === ROLES.ADMIN || role === ROLES.FACTORY_MANAGER) && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Need to add or edit a customer?{" "}
            <Link href="/factoryos/admin/clients" className="text-blue-600 hover:underline dark:text-blue-400">
              Open the customer directory
            </Link>.
          </p>
        )}
      </main>
    </div>
  );
}
