import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getJob, listJobUpdates, listClients, listVendors } from "@/lib/factoryos/repo";
import { getJobPushStatus } from "@/lib/warehouse/jobPush";
import { ROLES } from "@/lib/factoryos/constants";
import JobEditor from "./JobEditor";

export const dynamic = "force-dynamic";

export default async function ManagerJobDetail({ params }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.CUSTOMER) redirect("/factoryos/customer");
  if (role === ROLES.ADMIN) redirect(`/factoryos/admin/jobs/${params.id}`);

  const job = await getJob(params.id);
  if (!job) notFound();

  // Scope check for account managers.
  if (role === ROLES.ACCOUNT_MANAGER) {
    const myClients = new Set(session.factoryosClientIds || []);
    const ok = job.clientIds.some((c) => myClients.has(c)) ||
      (job.customerManagerId && job.customerManagerId === session.factoryosUserId);
    if (!ok) redirect("/factoryos/manager");
  }

  // FM lands here and CAN edit master-product mapping; AMs see it read-only.
  // Either way, the lock state needs to reflect whether warehouse pushes
  // have happened. If the fetch fails, fall back to unlocked — server-side
  // PATCH guard re-checks anyway.
  const [updates, clients, pushStatus, printingVendors] = await Promise.all([
    listJobUpdates(job.id),
    listClients(),
    getJobPushStatus(job.id).catch((e) => {
      console.error("Push status fetch failed:", e);
      return { push_count: 0 };
    }),
    listVendors({ type: "Printing", activeOnly: true }).catch(() => []),
  ]);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const masterMappingLocked = (pushStatus?.push_count || 0) > 0;
  const printingVendorNames = printingVendors.map((v) => v.name);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/manager" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← All jobs
        </Link>
        <JobEditor
          job={job}
          initialUpdates={updates}
          clientMap={clientMap}
          role={role}
          masterMappingLocked={masterMappingLocked}
          pushCount={pushStatus?.push_count || 0}
          printingVendors={printingVendorNames}
        />
      </main>
    </div>
  );
}
