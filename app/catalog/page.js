import { unstable_cache } from 'next/cache';
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
// masking is needed. whatsappUrl / emailUrl are NOT shipped — at ~1,700 cards
// they were 1.5 MB of the payload; ProductCard builds them on render.
const GRID_FIELDS = [
  "id", "productName", "sku", "category", "subCategory",
  "sizeVolume", "sizeLabel", "material", "gsm", "colour",
  "wallType", "coating", "lidProcess", "wrapping",
  "unitsPerCase", "casesPerPallet", "cartonDimensions",
  "images", "landed", "compatibleWith",
];

function slimForGrid(p) {
  const out = {};
  for (const k of GRID_FIELDS) if (p[k] !== undefined) out[k] = p[k];
  // The card only shows the compatible product's name.
  if (out.compatibleWith) out.compatibleWith = out.compatibleWith.map((c) => ({ id: c.id, productName: c.productName }));
  return out;
}

// The page itself is dynamic (it reads the session cookie to render the
// header), so the page-level `revalidate` never caches anything. Memoise the
// cookie-independent catalog DATA in the Next data cache for 5 min, so only
// the first request per window pays the fetch. The cache holds the SLIM
// grid rows, not the full fetchCatalog() result: the data cache refuses
// entries over 2 MB, and the full catalog (~4.8 MB) was silently never
// cached, so every request re-ran the whole read. Tagged 'catalog' so a
// future revalidateTag on product edits can bust it.
const getCachedCatalog = unstable_cache(
  async () => (await fetchCatalog()).map(slimForGrid),
  ['catalog-grid-v2'],
  { revalidate: 300, tags: ['catalog'] },
);

export default async function CatalogPage() {
  let products = [];
  let error = null;

  try {
    products = await getCachedCatalog();
  } catch (e) {
    error = e.message;
  }

  const categories = getCatalogCategories(products);
  const session = getSession();

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
