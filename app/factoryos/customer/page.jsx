import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listJobsForSession, listClients } from "@/lib/factoryos/repo";
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CustomerJobsView jobs={jobs} clientMap={clientMap} />
      </main>
    </div>
  );
}
