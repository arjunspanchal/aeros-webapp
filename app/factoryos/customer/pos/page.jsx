import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listCustomerPOs } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import CustomerPOsClient from "./CustomerPOsClient";

export const dynamic = "force-dynamic";

export default async function CustomerPOsPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  const pos = await listCustomerPOs({ clientIds: session.factoryosClientIds || [] });

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Purchase orders</h2>
      <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
        Upload PO PDFs here. We store them alongside your jobs so nothing gets lost.
      </p>
      <CustomerPOsClient initialPOs={pos} />
    </main>
  );
}
