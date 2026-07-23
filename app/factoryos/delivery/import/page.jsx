import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listClients } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

// Open-PO import — paste rows from the customer's Excel (or a CSV) and
// reconcile them into jobs (PO lines). Internal staff only.
export default async function DeliveryImportPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.CUSTOMER) redirect("/factoryos/customer");
  if (role === ROLES.VENDOR) redirect("/factoryos/vendor");

  const clients = await listClients();
  // Account managers only import for their own clients.
  const scoped =
    role === ROLES.ACCOUNT_MANAGER
      ? clients.filter((c) => (session.factoryosClientIds || []).includes(c.id))
      : clients;
  const clientOptions = scoped.map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Link
        href="/factoryos/delivery"
        className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400"
      >
        ← Delivery Plan
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-3 dark:text-white">Import open POs</h1>
      <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
        Copy the line rows from the customer&apos;s Excel (or a CSV) and paste below. Match the columns,
        review, then import. Existing PO lines (matched on PO# + SKU) are updated; new ones are created
        as jobs.
      </p>
      <ImportClient clients={clientOptions} />
    </main>
  );
}
