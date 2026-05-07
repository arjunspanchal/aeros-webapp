'use client';

import { useMemo, useState } from 'react';
import ItemCard from './ItemCard';

// `internalItems` is only passed when the viewer is Admin / FM / FE — see
// app/clearance/page.js. When present we render a tab switcher above the
// search bar so staff can flip between the public list and the team-only
// Branded Dead Stock list. Public viewers never see the tabs.
export default function Catalog({
  items,
  categories,
  internalItems = null,
  internalCategories = null,
}) {
  const hasInternalView = Array.isArray(internalItems);
  const [activeTab, setActiveTab] = useState('public'); // 'public' | 'internal'
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showOutOfStock, setShowOutOfStock] = useState(false);

  // Resolve which list + category set is currently active.
  const isInternal = hasInternalView && activeTab === 'internal';
  const activeItems = isInternal ? internalItems : items;
  const activeCategories = isInternal ? (internalCategories || []) : categories;

  function switchTab(tab) {
    setActiveTab(tab);
    // Categories differ between tabs — reset so a stale chip doesn't
    // silently filter out everything on the other tab.
    setSelectedCategory('All');
  }

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    return activeItems.filter((item) => {
      if (!showOutOfStock && item.stockQuantity === 0) return false;

      if (selectedCategory !== 'All' && item.category !== selectedCategory) {
        return false;
      }

      if (q) {
        const haystack = `${item.itemName} ${item.brand} ${item.category}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [activeItems, query, selectedCategory, showOutOfStock]);

  return (
    <div>
      {/* Tab switcher — staff-only. Public viewers never see this. */}
      {hasInternalView && (
        <>
          <div className="mb-4 flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-800 dark:bg-gray-900" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'public'}
              onClick={() => switchTab('public')}
              className={
                'flex-1 rounded-md px-3 py-2 text-sm font-medium transition ' +
                (activeTab === 'public'
                  ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800')
              }
            >
              Plain Items
              <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {items.length}
              </span>
              <span className="ml-1 hidden text-[10px] uppercase tracking-wide text-gray-400 sm:inline">public</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'internal'}
              onClick={() => switchTab('internal')}
              className={
                'flex-1 rounded-md px-3 py-2 text-sm font-medium transition ' +
                (activeTab === 'internal'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800')
              }
            >
              Branded Dead Stock
              <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {internalItems.length}
              </span>
              <span className="ml-1 hidden text-[10px] uppercase tracking-wide text-gray-400 sm:inline">team only</span>
            </button>
          </div>

          {isInternal && (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              <span className="font-semibold">Team-only view.</span>{' '}
              These items are not shown on the public stock page.
            </div>
          )}
        </>
      )}

      {/* Search + filter controls */}
      <div className="mb-6 space-y-4">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by item name, brand, or category…"
            className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <CategoryChip
            active={selectedCategory === 'All'}
            onClick={() => setSelectedCategory('All')}
          >
            All ({activeItems.filter((i) => showOutOfStock || i.stockQuantity !== 0).length})
          </CategoryChip>
          {activeCategories.map((cat) => (
            <CategoryChip
              key={cat}
              active={selectedCategory === cat}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </CategoryChip>
          ))}
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={showOutOfStock}
            onChange={(e) => setShowOutOfStock(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800"
          />
          Show out-of-stock items
        </label>
      </div>

      {/* Results count */}
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Showing <span className="font-semibold text-gray-900 dark:text-white">{filteredItems.length}</span>{' '}
        {filteredItems.length === 1 ? 'item' : 'items'}
        {query && (
          <>
            {' '}
            for &ldquo;<span className="font-semibold text-gray-900 dark:text-white">{query}</span>&rdquo;
          </>
        )}
        {selectedCategory !== 'All' && (
          <>
            {' '}in <span className="font-semibold text-gray-900 dark:text-white">{selectedCategory}</span>
          </>
        )}
      </p>

      {/* Grid */}
      {filteredItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
          <p className="text-gray-500 dark:text-gray-400">No items match your search. Try a different term or category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded-full px-4 py-1.5 text-sm font-medium transition ' +
        (active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-800')
      }
    >
      {children}
    </button>
  );
}
