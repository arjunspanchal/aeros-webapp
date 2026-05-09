import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageClearance, listItemsAdmin } from "@/lib/clearance/admin";
import Header from "@/app/components/Header";
import ManageClient from "./ManageClient";

// No caching — admins need to see fresh data after every edit.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manage Warehouse — Aeros",
  description: "Backend for editing warehouse stock items and photos.",
};

export default async function ManagePage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageClearance(session)) {
    return (
      <>
        <Header title="Manage Warehouse" subtitle="Staff backend — access restricted." />
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <p className="font-semibold text-lg">Access denied</p>
            <p className="mt-2 text-sm">
              The Warehouse backend is restricted to Admin, Factory
              Manager, and Factory Executive roles.
            </p>
          </div>
        </div>
      </>
    );
  }

  let items = [];
  let error = null;
  try {
    items = await listItemsAdmin();
  } catch (e) {
    error = e.message;
  }

  return (
    <>
      <Header
        title="Manage Warehouse"
        subtitle="Edit items and upload photos. Changes reflect on the public page within 60 seconds."
        itemCount={items.length}
        itemLabel="items"
      />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <p className="font-semibold">Could not load items.</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        ) : (
          <ManageClient initialItems={items} />
        )}
      </div>
    </>
  );
}
