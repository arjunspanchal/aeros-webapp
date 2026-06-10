import Link from 'next/link';
import { fetchInventory, getCategories } from '@/lib/airtable';
import { getSession } from '@/lib/hub/session';
import { canManageClearance } from '@/lib/clearance/admin';
import Header from '@/app/components/Header';
import Catalog from '@/app/components/Catalog';

// Revalidate every 60 seconds — Airtable updates will appear within a minute
export const revalidate = 60;

export default async function ClearancePage() {
  let items = [];
  let internalItems = [];
  let error = null;
  const session = getSession();
  const canManage = canManageClearance(session);

  try {
    // Public list — always fetched. Internal list — only for team members
    // (Admin / FM / FE). Parallel so the page doesn't pay the cost twice.
    if (canManage) {
      [items, internalItems] = await Promise.all([
        fetchInventory(),
        fetchInventory({ internal: true }),
      ]);
    } else {
      items = await fetchInventory();
    }
  } catch (e) {
    error = e.message;
  }

  const categories = getCategories(items);
  const internalCategories = getCategories(internalItems);

  return (
    <>
      <Header itemCount={items.length} />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {canManage && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-sm text-amber-900">
              <span className="font-semibold">Staff access:</span> edit items and upload photos in the backend.
            </div>
            <Link
              href="/warehouse/clearance/manage"
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Manage stock →
            </Link>
          </div>
        )}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-semibold">Could not load inventory.</p>
            <p className="mt-1 text-sm">{error}</p>
            <p className="mt-2 text-xs">
              Clearance reads go through Supabase — verify <code>SUPABASE_URL</code> + <code>SUPABASE_SERVICE_ROLE_KEY</code> are set on Vercel and the <code>clearance_items</code> table is reachable.
            </p>
          </div>
        ) : (
          <Catalog
            items={items}
            categories={categories}
            internalItems={canManage ? internalItems : null}
            internalCategories={canManage ? internalCategories : null}
          />
        )}
      </div>
    </>
  );
}
