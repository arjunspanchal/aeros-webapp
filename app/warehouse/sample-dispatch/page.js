import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canManageSampleDispatch,
  listDispatches,
} from "@/lib/warehouse/sampleDispatches";
import QueueClient from "./QueueClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sample Dispatch — WarehouseOS" };

export default async function SampleDispatchQueuePage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageSampleDispatch(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
        </div>
      </div>
    );
  }

  let dispatches = [], error = null;
  try {
    dispatches = await listDispatches({ limit: 500 });
  } catch (e) {
    error = e.message;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Sample Dispatch</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            CMs raise sample dispatches here; warehouse staff (Sachin / Samar) work the queue and mark dispatched.
          </p>
        </div>
        <Link
          href="/warehouse/sample-dispatch/new"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          + New dispatch
        </Link>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      ) : (
        <QueueClient initialDispatches={dispatches} />
      )}
    </div>
  );
}
