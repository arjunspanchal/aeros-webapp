import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import { listMachines } from "@/lib/factoryos/repo";
import MachinesAdmin from "./MachinesAdmin";

export const dynamic = "force-dynamic";

export default async function AdminMachinesPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");
  const machines = await listMachines();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Machines</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Factory machines. Each consumes RM (kgs) and produces finished units (pcs). Production runs and RM consumption will plug in here.
        </p>
        <MachinesAdmin initialMachines={machines} />
      </main>
    </div>
  );
}
