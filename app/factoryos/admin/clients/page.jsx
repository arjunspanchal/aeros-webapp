import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/factoryos/session";
import { listClients } from "@/lib/factoryos/repo";
import { airtableList, TABLES } from "@/lib/factoryos/airtable";
import { ROLES } from "@/lib/factoryos/constants";
import ClientsAdmin from "./ClientsAdmin";

export const dynamic = "force-dynamic";

async function listBrandManagers() {
  const rows = await airtableList(TABLES.users(), {
    filterByFormula: `AND(LOWER({Role})='${ROLES.ACCOUNT_MANAGER}', {Active})`,
    sort: [{ field: "Name", direction: "asc" }],
  });
  return rows
    .map((r) => ({ id: r.id, name: r.fields.Name || "", email: r.fields.Email || "" }))
    .filter((bm) => bm.email);
}

export default async function AdminClientsPage() {
  const s = getSession();
  if (!s) redirect("/login");
  if (s.role !== ROLES.ADMIN && s.role !== ROLES.FACTORY_MANAGER) redirect("/factoryos");
  const [clients, brandManagers] = await Promise.all([
    listClients(),
    listBrandManagers().catch(() => []),
  ]);
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Clients</h1>
        <ClientsAdmin initialClients={clients} initialBrandManagers={brandManagers} />
      </main>
    </div>
  );
}
