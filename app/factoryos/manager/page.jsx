import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listJobsForSession, listClients, listUsers } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import ManagerJobsView from "./ManagerJobsView";
import { findOne } from "@/lib/db/supabase";
import { cleanLineKeys } from "@/lib/factoryos/lines";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.CUSTOMER) redirect("/factoryos/customer");

  const [jobs, clients, users, me] = await Promise.all([
    listJobsForSession({
      role,
      userId: session.factoryosUserId,
      clientIds: session.factoryosClientIds,
    }),
    listClients(),
    role === ROLES.FACTORY_MANAGER || role === ROLES.ADMIN ? listUsers() : Promise.resolve([]),
    // The user's production lines drive the default "My lines" view.
    // Password-admin has no users row -> null -> all lines.
    session.factoryosUserId
      ? findOne("users", session.factoryosUserId, "factoryos_lines").catch(() => null)
      : Promise.resolve(null),
  ]);
  const myLines = cleanLineKeys(me?.factoryos_lines);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ManagerJobsView jobs={jobs} clientMap={clientMap} userMap={userMap} role={role} myLines={myLines} />
      </main>
    </div>
  );
}
