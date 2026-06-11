import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import {
  getJob,
  getJobCustomerExtras,
  listJobThread,
  listJobUpdates,
} from "@/lib/factoryos/repo";
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

  // Seed everything server-side so the page paints in one round trip — the
  // thread component still refetches on mount to stamp it read, but the user
  // doesn't see a loading flash for messages they're about to read.
  const [updates, thread, extras] = await Promise.all([
    listJobUpdates(job.id),
    listJobThread(job.id),
    getJobCustomerExtras(job.id),
  ]);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Link href="/factoryos/customer" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
        ← Back to orders
      </Link>
      <CustomerJobDetailClient
        initialJob={{ ...job, ...extras }}
        initialUpdates={updates}
        initialThread={thread}
      />
    </main>
  );
}
