import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { teamInboxItems } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import { formatDateTime } from "@/app/factoryos/_components/ui";

export const dynamic = "force-dynamic";

// Team inbox — one row per job with an unread message from a customer. Shared
// across all internal staff (FE/FM/AM/Admin). Clicking a row opens the job;
// the job thread auto-stamps team_last_read_at on load, which clears the row
// on next visit. The mirror of the customer inbox, team-side.
export default async function TeamInboxPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  // Customers + vendors have their own inboxes; this one is internal only.
  if (role === ROLES.CUSTOMER) redirect("/factoryos/customer");
  if (role === ROLES.VENDOR) redirect("/factoryos/vendor");

  const items = await teamInboxItems();

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Customer messages</h2>
      <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
        New messages and files from customers. Opening a job marks it as read.
      </p>

      {items.length === 0 ? (
        <div className="mt-5 bg-white border border-gray-200 rounded-xl p-8 text-center dark:bg-gray-900 dark:border-gray-800">
          <div className="text-3xl">✉️</div>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">You&apos;re all caught up.</p>
          <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
            When a customer writes in on any order, it shows up here — and the Inbox tab is badged so the team can&apos;t miss it.
          </p>
        </div>
      ) : (
        <ul className="mt-5 bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden dark:bg-gray-900 dark:border-gray-800 dark:divide-gray-800">
          {items.map((it) => (
            <li key={it.jobId}>
              <Link
                href={`/factoryos/manager/${it.jobId}`}
                className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" aria-hidden />
                      <span className="truncate">{it.jobBrand || it.jobItem || "Order"}</span>
                      {it.jobBrand && it.jobItem && (
                        <span className="text-gray-500 shrink-0 truncate"> · {it.jobItem}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1 dark:text-gray-300 line-clamp-2">{it.preview}</p>
                    <div className="text-[11px] text-gray-400 mt-1">
                      J# {it.jNumber} · {formatDateTime(it.createdAt)}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-blue-600 dark:text-blue-400">Open →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
