import { fetchCatalog, getCatalogCategories, canManageCatalogue } from '@/lib/catalog';
import { getSession } from '@/lib/hub/session';
import ProductGrid from './components/ProductGrid';
import AppHeader from '../components/AppHeader';
import Header from '../components/Header';
import Footer from '../components/Footer';

export const revalidate = 300; // refresh every 5 minutes

export const metadata = {
  title: 'Aeros Product Catalog',
  description: 'Browse our full range of packaging products — paper cups, tubs, lids, food boxes, bags, straws, and salad bowls.',
};

export default async function CatalogPage() {
  let products = [];
  let error = null;

  try {
    products = await fetchCatalog();
  } catch (e) {
    error = e.message;
  }

  const categories = getCatalogCategories(products);
  const session = getSession();
  // Mask the internal-notes field for non-staff viewers so it doesn't ship
  // in the RSC payload to ProductGrid (a client component). The list cards
  // never render notes, but RSC serialises every prop the client gets.
  if (!canManageCatalogue(session)) {
    products = products.map((p) => ({ ...p, notes: "" }));
  }

  return (
    <>
      <AppHeader session={session} />
      <Header
        title="Aeros Product Catalog"
        subtitle="Our complete range of packaging products"
        itemCount={products.length}
        itemLabel="products"
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-semibold">Could not load catalog.</p>
            <p className="mt-1 text-sm">{error}</p>
            <p className="mt-2 text-xs">
              Check the Supabase env vars (SUPABASE_URL,
              SUPABASE_SERVICE_ROLE_KEY) and that the master_products view is
              reachable.
            </p>
          </div>
        ) : (
          <ProductGrid products={products} categories={categories} />
        )}
      </main>
      <Footer />
    </>
  );
}
