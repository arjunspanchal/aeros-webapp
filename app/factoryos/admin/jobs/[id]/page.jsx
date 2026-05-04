import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession as getFactoryosSession } from "@/lib/factoryos/session";
import { getSession, requireManager } from "@/lib/auth/session";
import { getJob, listJobUpdates, listClients } from "@/lib/factoryos/repo";
import { fetchCatalog } from "@/lib/catalog";
import JobEditor from "@/app/factoryos/manager/[id]/JobEditor";

export const dynamic = "force-dynamic";

export default async function AdminJobDetail({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");
  // Legacy factoryos session kept for s.role passthrough into <JobEditor/>.
  // PR 1.3+ collapses into the unified helper.
  const s = getFactoryosSession();
  const job = await getJob(params.id);
  if (!job) notFound();
  const [updates, clients, catalogResult] = await Promise.all([
    listJobUpdates(job.id),
    listClients(),
    // Catalog is optional on edit — if it fails we still let the page load read-only.
    fetchCatalog()
      .then((products) => ({ products, error: null }))
      .catch((e) => {
        console.error("Catalog fetch failed:", e);
        return { products: [], error: e?.message || String(e) };
      }),
  ]);
  const catalog = catalogResult.products;
  const catalogError = catalogResult.error;
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  // Slim the catalog payload — same shape NewJobForm uses.
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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← Back to admin
        </Link>
        <JobEditor job={job} initialUpdates={updates} clientMap={clientMap} role={s.role} products={products} catalogError={catalogError} />
      </main>
    </div>
  );
}
