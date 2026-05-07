import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getJob, listJobUpdates, listClients } from "@/lib/factoryos/repo";
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

  const [updates, clients] = await Promise.all([listJobUpdates(job.id), listClients()]);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/manager" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← All jobs
        </Link>
        <JobEditor job={job} initialUpdates={updates} clientMap={clientMap} role={role} />
      </main>
    </div>
  );
}
