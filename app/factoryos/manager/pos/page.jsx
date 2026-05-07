import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listCustomerPOs, listClients } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import ManagerPOsView from "./ManagerPOsView";

export const dynamic = "force-dynamic";

export default async function ManagerPOsPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.CUSTOMER) redirect("/factoryos/customer");

  let clientIds;
  if (role === ROLES.ACCOUNT_MANAGER) clientIds = session.factoryosClientIds || [];
  const [pos, clients] = await Promise.all([
    listCustomerPOs(clientIds ? { clientIds } : undefined),
    listClients(),
  ]);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href={role === ROLES.ADMIN ? "/factoryos/admin" : "/factoryos/manager"} className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Back</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Customer POs</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">PDFs uploaded by customers. Search by PO number or client.</p>
        <ManagerPOsView pos={pos} clientMap={clientMap} />
      </main>
    </div>
  );
}
