"use client";

import { useState } from "react";

// Category icon SVGs come from ProductCard; re-importing the file would
// drag in Link + other props. Tiny duplication of the default placeholder
// is acceptable for the fallback case (products with no uploaded photos).
const DEFAULT_ICON = (
  <svg viewBox="0 0 64 64" fill="none" className="h-24 w-24 text-brand-300 dark:text-amber-400" aria-hidden="true">
    <rect x="10" y="10" width="44" height="44" rx="4" stroke="currentColor" strokeWidth="2.5" />
    <path d="M10 24h44M24 24v30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default function ProductGallery({ product }) {
  const images = Array.isArray(product.images) ? product.images : [];
  const [activeIdx, setActiveIdx] = useState(0);
  const active = images[activeIdx] || null;

  return (
    <div>
      {/* Hero image — click to open full-resolution in a new tab. */}
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-brand-50 dark:border-gray-800 dark:bg-amber-900/20">
        {active ? (
          <a
            href={active.largeUrl || active.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${product.productName} image full size`}
            className="block h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={product.productName}
              className="h-full w-full object-contain"
            />
          </a>
        ) : (
          DEFAULT_ICON
        )}
      </div>

      {/* Thumbnail strip — only when there are 2+ images. */}
      {images.length > 1 && (
        <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6">
          {images.map((img, i) => (
            <button
              key={img.id || i}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              aria-pressed={i === activeIdx}
              className={`flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-white p-1 transition dark:bg-gray-900 ${
                i === activeIdx
                  ? "border-brand-600 ring-2 ring-brand-200 dark:border-amber-400 dark:ring-amber-900/40"
                  : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.thumbnailUrl || img.url}
                alt=""
                className="h-full w-full object-contain"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
