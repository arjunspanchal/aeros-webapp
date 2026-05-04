import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { listCoatingJobs, listRawMaterials } from "@/lib/factoryos/repo";
import CoatingAdmin from "./CoatingAdmin";

export const dynamic = "force-dynamic";

export default async function AdminCoatingPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");

  const [jobs, inventory] = await Promise.all([
    listCoatingJobs(),
    listRawMaterials(),
  ]);

  // Only uncoated rows with qty > 0 should show in the send-out picker — that's
  // what we can ship. Coated rows (Coating set) are the destination, not the source.
  const sendable = inventory.filter((r) => !r.coating && (r.qtyKgs || 0) > 0);

  // Lookup by id used on the jobs list to show source / result row labels.
  const inventoryById = Object.fromEntries(inventory.map((r) => [r.id, r]));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">PE Coating Jobs</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Track uncoated cupstock sent to PE coaters (Jayant Printery / Wikas) and the coated stock that returns.
          SSP = single-side (~18 g, sidewall fans). DSP = two-side (bottoms). Default PE rate is ₹13/kg for SSP.
        </p>
        <CoatingAdmin initialJobs={jobs} sendableStock={sendable} inventoryById={inventoryById} />
      </main>
    </div>
  );
}
