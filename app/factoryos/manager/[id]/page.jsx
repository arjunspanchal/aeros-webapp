import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getJob, listJobUpdates, listClients, listVendors, listUsers } from "@/lib/factoryos/repo";
import { getJobPushStatus } from "@/lib/warehouse/jobPush";
import { ROLES } from "@/lib/factoryos/constants";
import JobEditor from "./JobEditor";
import { listRmStockOptions } from "@/lib/factoryos/rmStock";
import { stepContext, listOutsourcers } from "@/lib/factoryos/transitions";

export const metadata = { title: "Job — FactoryOS" };

export const dynamic = "force-dynamic";

export default async function ManagerJobDetail({ params }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.ADMIN || role === ROLES.FACTORY_MANAGER) redirect(`/factoryos/admin/jobs/${params.id}`);

  const job = await getJob(params.id);
  if (!job) notFound();

  // Sales see every job, read-only (18-Nov-2026) — no scope check here.

  // FM lands here and CAN edit master-product mapping; AMs see it read-only.
  // Either way, the lock state needs to reflect whether warehouse pushes
  // have happened. If the fetch fails, fall back to unlocked — server-side
  // PATCH guard re-checks anyway.
  const [updates, clients, pushStatus, printingVendors, rmStock, users, stepCtxRaw, outsourcers] = await Promise.all([
    listJobUpdates(job.id),
    listClients(),
    getJobPushStatus(job.id).catch((e) => {
      console.error("Push status fetch failed:", e);
      return { push_count: 0 };
    }),
    listVendors({ type: "Printing", activeOnly: true }).catch(() => []),
    listRmStockOptions(),
    listUsers().catch(() => []),
    stepContext(job.id).catch(() => null),
    listOutsourcers().catch(() => []),
  ]);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const masterMappingLocked = (pushStatus?.push_count || 0) > 0;
  // Sales managers = active account managers (same list as the New job form).
  const salesManagers = users
    .filter((u) => (u.role === "account_manager" || u.role === "admin") && u.active)
    .map((u) => ({ id: u.id, name: u.name || u.email }));
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
          rmStock={rmStock}
          salesManagers={salesManagers}
          stepCtx={stepCtxRaw ? { inwardCount: stepCtxRaw.inwardCount, coaCount: stepCtxRaw.coaCount, lots: stepCtxRaw.lots, dispatchedQty: stepCtxRaw.dispatchedQty } : null}
          outsourcers={outsourcers}
        />
      </main>
    </div>
  );
}
