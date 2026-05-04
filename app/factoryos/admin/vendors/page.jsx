import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { listVendors } from "@/lib/factoryos/repo";
import VendorsAdmin from "./VendorsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminVendorsPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");
  const vendors = await listVendors();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Vendors</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Master directory of outside vendors. Printing vendors show up in the New Job dropdown; RM supplier / transport types are ready for future forms.
        </p>
        <VendorsAdmin initialVendors={vendors} />
      </main>
    </div>
  );
}
