import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listClients, listUsers, listVendors, getNextJobNumber, getJob } from "@/lib/factoryos/repo";
import { lineForCategory } from "@/lib/factoryos/lines";
import { listMasterPapers } from "@/lib/paper-rm";
import { listBrandsByClient } from "@/lib/factoryos/brands";
import { listRmStockOptions } from "@/lib/factoryos/rmStock";
import { ROLES } from "@/lib/factoryos/constants";
import { fetchCatalogLite } from "@/lib/catalog";
import NewJobForm from "./NewJobForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage({ searchParams }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  // Jobs are raised by the factory managers (Rahul / Sachin) or admin only —
  // Arjun, 01-Oct-2026. Mirrors the API's create-job allow-list.
  if (
    role !== ROLES.ADMIN &&
    role !== ROLES.FACTORY_MANAGER
  ) {
    redirect("/factoryos");
  }
  const [clients, users, catalogResult, masterPapers, printingVendors, nextJNumber, brands, rmStock] = await Promise.all([
    listClients(),
    listUsers(),
    // Lite fetch: the picker needs 7 text fields, not photos/pricing —
    // fetchCatalog() fires a photos query per product (~600 round trips).
    fetchCatalogLite()
      .then((products) => ({ products, error: null }))
      .catch((e) => {
        console.error("Catalog fetch failed:", e);
        return { products: [], error: e?.message || String(e) };
      }),
    listMasterPapers().catch((e) => { console.error("Master paper fetch failed:", e); return []; }),
    listVendors({ type: "Printing", activeOnly: true }).catch((e) => { console.error("Vendor fetch failed:", e); return []; }),
    getNextJobNumber(),
    listBrandsByClient(),
    listRmStockOptions(),
  ]);
  // fetchCatalogLite already returns the slim picker shape the form uses.
  const products = catalogResult.products;
  const catalogError = catalogResult.error;
  const accountManagers = users.filter((u) => (u.role === ROLES.ACCOUNT_MANAGER || u.role === ROLES.ADMIN) && u.active);

  // Repeat order: copy the identifying + production fields of a previous job.
  let prefill = null;
  if (searchParams?.from) {
    const src = await getJob(String(searchParams.from)).catch(() => null);
    if (src) {
      const product = products.find((p) => p.sku && p.sku === src.masterSku) || null;
      prefill = {
        fromJobId: src.id,
        fromJNumber: src.jNumber,
        line: lineForCategory(src.category, src.item) || "",
        fields: {
          clientId: src.clientIds?.[0] || "",
          brand: src.brand || "",
          customerManagerId: src.customerManagerId || "",
          // The form lists plain (physical) items and takes the printed
          // version as a second choice, so split a printed SKU into both.
          productId: (product?.parentSku ? products.find((p) => p.sku === product.parentSku)?.id : product?.id) || "",
          variantId: product?.parentSku ? product.id : "",
          customItem: !!src.customItem,
          extraFeatures: Array.isArray(src.extraFeatures) ? src.extraFeatures : [],
          coatingRequired: !!src.coatingRequired,
          channel: src.channel || "",
          category: src.category || "",
          item: src.item || "",
          itemSize: (src.customItem ? src.itemSize : product?.sizeVolume) || src.itemSize || "",
          city: src.city || "",
          rmType: src.rmType || "",
          rmSupplier: src.rmSupplier || "",
          rmMill: src.rmMill || "",
          paperType: src.paperType || "",
          gsm: src.gsm != null ? String(src.gsm) : "",
          rmSizeMm: src.rmSizeMm != null ? String(src.rmSizeMm) : "",
          printingType: src.printingType || "",
          printingVendor: src.printingVendor || "",
          conversionAt: src.conversionAt || "aeros",
          packingAt: src.packingAt || "aeros",
          notes: src.notes || "",
        },
      };
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Back</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">New job</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Create a single job (line item). For a multi-item PO, create one job per item and use the same PO number.</p>
        <NewJobForm
          clients={clients}
          accountManagers={accountManagers}
          canOverrideRm={role === ROLES.ADMIN}
          prefill={prefill}
          initialSo={typeof searchParams?.so === "string" ? searchParams.so.slice(0, 60) : ""}
          initialLine={typeof searchParams?.line === "string" ? searchParams.line.slice(0, 40) : ""}
          products={products}
          catalogError={catalogError}
          // Only what the paper picker shows — no rates or rate notes go to the
          // browser (no rates in FactoryOS, 17-Nov-2026).
          masterPapers={masterPapers.map((mp) => ({
            id: mp.id, materialName: mp.materialName, supplier: mp.supplier, type: mp.type,
            gsm: mp.gsm, bf: mp.bf, form: mp.form,
          }))}
          printingVendors={printingVendors.map((v) => v.name)}
          initialJNumber={nextJNumber}
          brands={brands}
          rmStock={rmStock}
        />
      </main>
    </div>
  );
}
