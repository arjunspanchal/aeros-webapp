import { redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageSampleKits } from "@/lib/warehouse/sampleKits";
import { dbSelect } from "@/lib/db/supabase";
import KitForm from "../KitForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "New sample kit — WarehouseOS" };

export default async function NewKitPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageSampleKits(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
        </div>
      </div>
    );
  }
  let products = [];
  try {
    products = await dbSelect("master_products", {
      select: "id,sku,product_name,category",
      order: "product_name.asc",
      limit: 1000,
    });
  } catch {}

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">New sample kit</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">A kit shows up as one line item on a sample dispatch.</p>
      </div>
      <KitForm products={products} mode="create" />
    </div>
  );
}
