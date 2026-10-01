import { redirect } from "next/navigation";
import { getSession, requireInternal } from "@/lib/auth/session";
import { listFactoryFg } from "@/lib/factoryos/closeJob";
import FactoryFgList from "./FactoryFgList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finished goods from factory" };

// Warehouse view of everything the factory has closed and handed over.
export default async function FactoryFgPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/warehouse");
  const rows = await listFactoryFg();
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finished goods from factory</h1>
      <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
        Every job the factory has closed, with the finished quantity handed over. Mark a job dispatched when it leaves.
      </p>
      <FactoryFgList rows={rows} />
    </main>
  );
}
