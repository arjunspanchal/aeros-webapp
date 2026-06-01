import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listClients, listUsers, listVendors, getNextJobNumber } from "@/lib/factoryos/repo";
import { listMasterPapers } from "@/lib/paper-rm";
import { ROLES } from "@/lib/factoryos/constants";
import { fetchCatalog } from "@/lib/catalog";
import NewJobForm from "./NewJobForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  // Mirror the API's create-job allow-list: admin / factory manager / account
  // manager. AMs in particular need this — they're the ones taking the brief
  // from the customer and turning it into a job.
  if (
    role !== ROLES.ADMIN &&
    role !== ROLES.FACTORY_MANAGER &&
    role !== ROLES.ACCOUNT_MANAGER
  ) {
    redirect("/factoryos");
  }
  const [clients, users, catalogResult, masterPapers, printingVendors, nextJNumber] = await Promise.all([
    listClients(),
    listUsers(),
    fetchCatalog()
      .then((products) => ({ products, error: null }))
      .catch((e) => {
        console.error("Catalog fetch failed:", e);
        return { products: [], error: e?.message || String(e) };
      }),
    listMasterPapers().catch((e) => { console.error("Master paper fetch failed:", e); return []; }),
    listVendors({ type: "Printing", activeOnly: true }).catch((e) => { console.error("Vendor fetch failed:", e); return []; }),
    getNextJobNumber(),
  ]);
  const catalog = catalogResult.products;
  const catalogError = catalogResult.error;
  const accountManagers = users.filter((u) => u.role === ROLES.ACCOUNT_MANAGER && u.active);
  // Slim down the product payload for the client bundle — we only need what the form uses.
  const products = catalog.map((p) => ({
    id: p.id,
    productName: p.productName,
    sku: p.sku,
    category: p.category,
    sizeVolume: p.sizeVolume,
    gsm: p.gsm,
    material: p.material,
  }));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Back</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">New job</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Create a single job (line item). For a multi-item PO, create one job per item and use the same PO number.</p>
        <NewJobForm
          clients={clients}
          accountManagers={accountManagers}
          products={products}
          catalogError={catalogError}
          masterPapers={masterPapers}
          printingVendors={printingVendors.map((v) => v.name)}
          initialJNumber={nextJNumber}
        />
      </main>
    </div>
  );
}
