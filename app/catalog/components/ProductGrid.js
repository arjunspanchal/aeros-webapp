'use client';

import { useMemo, useState } from 'react';
import ProductCard from './ProductCard';

export default function ProductGrid({ products, categories }) {
  const [query, setQuery] = useState('');
  // Empty Set = "All". Click a chip to add/remove it from the filter so the
  // grid can show, e.g., Lids + Paper Cups together.
  const [selected, setSelected] = useState(() => new Set());

  const toggleCategory = (cat) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  const clearCategories = () => setSelected(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (selected.size && !selected.has(p.category)) return false;
      if (q) {
        const haystack = `${p.productName} ${p.sku} ${p.category} ${p.subCategory} ${p.material} ${p.sizeVolume}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [products, query, selected]);

  const selectedList = useMemo(() => Array.from(selected), [selected]);

  return (
    <div>
      {/* Search + filters */}
      <div className="mb-6 space-y-4">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by product name, SKU, size, material…"
            className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <CategoryChip active={selected.size === 0} onClick={clearCategories}>
            All ({products.length})
          </CategoryChip>
          {categories.map((cat) => (
            <CategoryChip
              key={cat}
              active={selected.has(cat)}
              onClick={() => toggleCategory(cat)}
            >
              {cat}
            </CategoryChip>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Showing <span className="font-semibold text-gray-900 dark:text-white">{filtered.length}</span>{' '}
        {filtered.length === 1 ? 'product' : 'products'}
        {query && <> for &ldquo;<span className="font-semibold text-gray-900 dark:text-white">{query}</span>&rdquo;</>}
        {selectedList.length > 0 && (
          <>
            {' '}in{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              {selectedList.join(' + ')}
            </span>
          </>
        )}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
          <p className="text-gray-500 dark:text-gray-400">No products match your search. Try a different term or category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
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
