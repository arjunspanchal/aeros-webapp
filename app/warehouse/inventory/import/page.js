import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageInventory, listLocations } from "@/lib/warehouse/inventory";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Import Opening Stock — WarehouseOS" };

export default async function ImportPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageInventory(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
          <p className="mt-2 text-sm">
            Importing opening stock is restricted to Admin, Factory Manager, and Factory Executive roles.
          </p>
        </div>
      </div>
    );
  }

  let locations = [];
  let error = null;
  try {
    locations = await listLocations();
  } catch (e) {
    error = e.message;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Import Opening Stock</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            First-load tool for your audit. Upload a CSV of counted stock — any missing SKUs are created and
            one <span className="font-medium">opening</span> Inward is posted, seeding quantity and ₹ value
            together. (For your <em>next</em> count, use Stock Audits to reconcile system vs physical.)
          </p>
        </div>
        <Link href="/warehouse/inventory" className="text-sm text-blue-700 hover:text-blue-800 dark:text-blue-400">
          ← Stock position
        </Link>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      ) : (
        <ImportClient locations={locations} />
      )}
    </div>
  );
}
