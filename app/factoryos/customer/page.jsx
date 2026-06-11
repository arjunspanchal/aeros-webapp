import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  customerUnreadJobIds,
  listClients,
  listJobsForSession,
} from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import CustomerJobsView from "./CustomerJobsView";

export const dynamic = "force-dynamic";

export default async function CustomerPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  const [jobs, clients] = await Promise.all([
    listJobsForSession({
      role,
      userId: session.factoryosUserId,
      clientIds: session.factoryosClientIds,
    }),
    listClients(),
  ]);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  // Narrow the unread lookup to the jobs this customer can actually see — we
  // never want to ask Supabase about jobs they wouldn't be allowed to read.
  const unreadIds = Array.from(
    await customerUnreadJobIds(jobs.map((j) => j.id)),
  );

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <CustomerJobsView jobs={jobs} clientMap={clientMap} unreadIds={unreadIds} />
    </main>
  );
}
