import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/hub/session";
import {
  canManageInventory,
  listLocations,
  listItems,
} from "@/lib/warehouse/inventory";
import NewAuditClient from "./NewAuditClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "New Audit — WarehouseOS" };

export default async function NewAuditPage() {
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
  let locations = [], items = [], categories = [], error = null;
  try {
    [locations, items] = await Promise.all([listLocations(), listItems()]);
    categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort();
  } catch (e) {
    error = e.message;
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/warehouse/inventory/audits" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
        ← Audits
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">New audit</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Pick a scope and an audit manager. The system snapshots on-hand qty for every (item, location) in scope; counters then enter physical counts.
      </p>
      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      ) : (
        <NewAuditClient
          locations={locations}
          categories={categories}
          items={items}
          currentUserEmail={session.email || ""}
        />
      )}
    </div>
  );
}
