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
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">RM Inventory</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          On-hand paper stock. Link each line to an entry in the{" "}
          <a href="https://airtable.com/appSllndIZszJSCma" target="_blank" rel="noreferrer" className="underline hover:text-blue-700 dark:hover:text-blue-400">Paper RM Database</a>{" "}
          master using the picker below.
        </p>
        <InventoryAdmin initialInventory={inventory} masterPapers={masterPapers} />
      </main>
    </div>
  );
}
