import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canSeeStock } from "@/lib/warehouse/inventory";
import { listMovements } from "@/lib/warehouse/movements";
import MovementsClient from "./MovementsClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Movements — Warehouse" };

export default async function MovementsHistoryPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canSeeStock(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
        </div>
      </div>
    );
  }

  let movements = [], error = null;
  try {
    movements = await listMovements({ limit: 500 });
  } catch (e) {
    error = e.message;
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">History</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Every time stock came in, went out or was corrected. Open a row to see its lines.
        </p>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      ) : (
        <MovementsClient initialMovements={movements} />
      )}
    </div>
  );
}
