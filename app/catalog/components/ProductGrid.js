'use client';

import { useMemo, useState } from 'react';
import ProductCard from './ProductCard';

// Secondary facets, in display order. Only the rows with ≥2 distinct values
// inside the currently-selected categories actually render — so a Paper Cup
// shows Wall/Coating/Material rows, while Paper Straws (one value each)
// shows nothing extra.
const FACETS = [
  { key: 'wallType', label: 'Wall' },
  { key: 'coating', label: 'Coating' },
  { key: 'material', label: 'Material' },
  { key: 'subCategory', label: 'Sub-category' },
];

export default function ProductGrid({ products, categories }) {
  const [query, setQuery] = useState('');
  // Category multi-select. Empty Set = "All".
  const [selected, setSelected] = useState(() => new Set());
  // Secondary facets: { wallType: Set<value>, coating: Set<value>, … }
  const [facets, setFacets] = useState(() => ({}));

  const toggleCategory = (cat) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    // Category change can invalidate facet values (e.g. "PE" coating
    // doesn't exist outside Paper Cups). Reset rather than try to migrate.
    setFacets({});
  };
  const clearCategories = () => {
    setSelected(new Set());
    setFacets({});
  };

  const toggleFacet = (key, value) => {
    setFacets((prev) => {
      const next = { ...prev };
      const cur = new Set(next[key] || []);
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      if (cur.size === 0) delete next[key];
      else next[key] = cur;
      return next;
    });
  };

  // Stage 1: filter by search + category. We need this intermediate set
  // to compute which facet values are available within the user's
  // current category selection.
  const inSelection = useMemo(() => {
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

  // Derive secondary facet rows from products in the current category
  // selection. Only emit a row when there's a real choice to make (≥2
  // distinct values) or the user already picked something in it.
  const facetRows = useMemo(() => {
    if (selected.size === 0) return [];
    return FACETS.map(({ key, label }) => {
      const counts = new Map();
      for (const p of inSelection) {
        const v = p[key];
        if (!v) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      const values = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
      return { key, label, values };
    }).filter((r) => r.values.length >= 2 || (facets[r.key]?.size > 0));
  }, [inSelection, selected, facets]);

  // Stage 2: apply facet filters. AND across facet keys, OR within a key.
  const filtered = useMemo(() => {
    const active = Object.entries(facets);
    if (active.length === 0) return inSelection;
    return inSelection.filter((p) => {
      for (const [key, values] of active) {
        if (!values.has(p[key])) return false;
      }
      return true;
    });
  }, [inSelection, facets]);

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
          <FilterChip active={selected.size === 0} onClick={clearCategories}>
            All ({products.length})
          </FilterChip>
          {categories.map((cat) => (
            <FilterChip
              key={cat}
              active={selected.has(cat)}
              onClick={() => toggleCategory(cat)}
            >
              {cat}
            </FilterChip>
          ))}
        </div>

        {/* Secondary facet rows — appear once a category is selected and
            the facet has real options to choose between. */}
        {facetRows.map(({ key, label, values }) => (
          <div key={key} className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {label}
            </span>
            {values.map((v) => (
              <FilterChip
                key={v}
                size="sm"
                active={!!facets[key]?.has(v)}
                onClick={() => toggleFacet(key, v)}
              >
                {v}
              </FilterChip>
            ))}
          </div>
        ))}
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

function FilterChip({ active, onClick, size = 'md', children }) {
  const sizeCls = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm';
  return (
    <button
      onClick={onClick}
      className={
        'rounded-full font-medium transition ' +
        sizeCls +
        ' ' +
        (active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-800')
      }
    >
      {children}
    </button>
  );
}
