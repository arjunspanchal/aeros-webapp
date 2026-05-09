import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { listAudits } from "@/lib/warehouse/audits";
import AuditsListClient from "./AuditsListClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stock Audits — WarehouseOS" };

export default async function AuditsListPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageInventory(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
        </div>
      </div>
    );
  }
  let audits = [], error = null;
  try { audits = await listAudits(); } catch (e) { error = e.message; }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Stock Audits</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Cycle counts and full inventories. Each audit snapshots system qty at start, captures counted qty per (item, location), and posts the variance as one adjustment movement.
          </p>
        </div>
        <Link
          href="/warehouse/inventory/audits/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + New audit
        </Link>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      ) : (
        <AuditsListClient initialAudits={audits} />
      )}
    </div>
  );
}
