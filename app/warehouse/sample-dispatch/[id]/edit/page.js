import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canManageSampleDispatch,
  getDispatch,
} from "@/lib/warehouse/sampleDispatches";
import { listKits } from "@/lib/warehouse/sampleKits";
import { dbSelect } from "@/lib/db/supabase";
import NewDispatchClient from "../../new/NewDispatchClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit sample dispatch — WarehouseOS" };

export default async function EditDispatchPage({ params }) {
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
  const dispatch = await getDispatch(params.id);
  if (!dispatch) notFound();

  let products = [];
  let kits = [];
  try {
    products = await dbSelect("master_products", {
      select: "id,sku,product_name,category,price_per_unit",
      order: "product_name.asc",
      limit: 1000,
    });
  } catch {}
  try {
    kits = await listKits({ activeOnly: true });
  } catch {}

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Edit {dispatch.dispatch_no}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Update customer details and items. Order IDs (CBX########) on existing lines are preserved so the printed dispatch note keeps its tracking numbers.
        </p>
      </div>
      <NewDispatchClient
        products={products}
        kits={kits}
        defaultManagedBy={session.name || session.email}
        mode="edit"
        initial={dispatch}
        dispatchId={dispatch.id}
      />
    </div>
  );
}
