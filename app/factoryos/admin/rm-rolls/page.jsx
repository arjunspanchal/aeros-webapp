import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { listRawMaterials } from "@/lib/factoryos/repo";
import { listAllRolls } from "@/lib/factoryos/floor";
import RollsAdmin from "./RollsAdmin";

export const dynamic = "force-dynamic";

export default async function RmRollsPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");

  const [stockLines, rolls] = await Promise.all([
    listRawMaterials({ activeOnly: true }).catch(() => []),
    listAllRolls().catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin/inventory" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← RM Inventory</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">RM Rolls</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Register serial-numbered rolls so operators can pick them on the shop-floor page.
          Leave the serial blank to auto-generate one. Rolls draw down automatically when a
          production run finishes.
        </p>
        <RollsAdmin
          stockLines={stockLines.map((l) => ({ id: l.id, name: l.name || l.masterRmName, paperType: l.paperType, gsm: l.gsm, supplier: l.supplier }))}
          initialRolls={rolls}
        />
      </main>
    </div>
  );
}
