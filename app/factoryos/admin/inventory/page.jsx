import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { listRawMaterials } from "@/lib/factoryos/repo";
import { listMasterPapers } from "@/lib/paper-rm";
import InventoryAdmin from "./InventoryAdmin";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");
  const [inventory, masterPapers] = await Promise.all([
    listRawMaterials(),
    listMasterPapers().catch((e) => { console.error("Master paper fetch failed:", e); return []; }),
  ]);
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Admin</Link>
        <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">RM Inventory</h1>
          <Link href="/factoryos/admin/rm-rolls" className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900">
            Manage RM rolls →
          </Link>
        </div>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          On-hand paper stock. Link each line to an entry in the
          Supabase <code className="font-mono text-xs">master_papers</code> table
          using the picker below — base rates and supplier discounts come from there.
          Register serial-numbered rolls under <strong>Manage RM rolls</strong> so floor operators can pick them.
        </p>
        <InventoryAdmin initialInventory={inventory} masterPapers={masterPapers} />
      </main>
    </div>
  );
}
