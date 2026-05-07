import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listJobsForSession, listClients, listUsers } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import ManagerJobsView from "./ManagerJobsView";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.CUSTOMER) redirect("/factoryos/customer");

  const [jobs, clients, users] = await Promise.all([
    listJobsForSession({
      role,
      userId: session.factoryosUserId,
      clientIds: session.factoryosClientIds,
    }),
    listClients(),
    role === ROLES.FACTORY_MANAGER || role === ROLES.ADMIN ? listUsers() : Promise.resolve([]),
  ]);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ManagerJobsView jobs={jobs} clientMap={clientMap} userMap={userMap} role={role} />
      </main>
    </div>
  );
}
