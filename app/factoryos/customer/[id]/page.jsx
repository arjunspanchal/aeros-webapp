import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  getJob,
  getJobCustomerExtras,
  listJobThread,
  listJobUpdates,
} from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import {
  getActiveClientId,
  setActiveClientId,
} from "@/lib/factoryos/customerScope";
import CustomerJobDetailClient from "./CustomerJobDetailClient";

export const dynamic = "force-dynamic";

export default async function CustomerJobDetail({ params }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  const job = await getJob(params.id);
  if (!job) notFound();
  const linkedIds = session.factoryosClientIds || [];
  const myClients = new Set(linkedIds);
  if (!job.clientIds.some((c) => myClients.has(c))) redirect("/factoryos/customer");

  // Forgiving multi-client UX — if the user opens a job that belongs to a
  // different linked client than the one they're scoped to right now (e.g.
  // arriving from an email link to a Wellbeing order while pinned to
  // Brewbay), silently switch their pinned client so the back-nav lands on
  // the matching dashboard.
  const activeNow = getActiveClientId(linkedIds);
  const jobClient = job.clientIds.find((c) => myClients.has(c));
  if (jobClient && jobClient !== activeNow) {
    setActiveClientId(jobClient);
  }

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
      <CustomerJobDetailClient
        initialJob={{ ...job, ...extras }}
        initialUpdates={updates}
        initialThread={thread}
      />
    </main>
  );
}
