import { fetchCatalog, getCatalogCategories } from '@/lib/catalog';
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

// ProductGrid is a client component, so every field we pass gets serialised
// into the page payload AND server-rendered for ~600 cards. fetchCatalog
// returns the full product (pricing-tier arrays, every spec column, internal
// notes) — most of which the grid + card never read, bloating the payload to
// several MB and slowing TTFB. Project to exactly the fields the grid/facets
// and the card use. This also drops `notes` for everyone, so no session-based
// masking is needed.
const GRID_FIELDS = [
  "id", "productName", "sku", "category", "subCategory",
  "sizeVolume", "sizeLabel", "material", "gsm", "colour",
  "wallType", "coating", "lidProcess", "wrapping",
  "unitsPerCase", "casesPerPallet", "cartonDimensions",
  "images", "landed", "compatibleWith", "whatsappUrl", "emailUrl",
];

function slimForGrid(p) {
  const out = {};
  for (const k of GRID_FIELDS) if (p[k] !== undefined) out[k] = p[k];
  return out;
}

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
  // Slim the payload to grid-only fields (drops pricing tiers, unused specs,
  // and internal notes) before handing it to the client component.
  const slimProducts = products.map(slimForGrid);

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
          <ProductGrid products={slimProducts} categories={categories} />
        )}
      </main>
      <Footer />
    </>
  );
}
