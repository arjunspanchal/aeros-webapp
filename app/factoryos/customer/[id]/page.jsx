import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getJob, listJobUpdates } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import CustomerJobDetailClient from "./CustomerJobDetailClient";

export const dynamic = "force-dynamic";

export default async function CustomerJobDetail({ params }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  const job = await getJob(params.id);
  if (!job) notFound();
  const myClients = new Set(session.factoryosClientIds || []);
  if (!job.clientIds.some((c) => myClients.has(c))) redirect("/factoryos/customer");

  const updates = await listJobUpdates(job.id);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/customer" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← All orders
        </Link>
        <CustomerJobDetailClient initialJob={job} initialUpdates={updates} />
      </main>
    </div>
  );
}
