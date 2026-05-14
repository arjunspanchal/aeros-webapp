"use client";

import { useCallback, useEffect, useState } from "react";

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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const active = images[activeIdx] || null;
  const canLightbox = !!active;

  const openLightbox = useCallback(() => {
    if (canLightbox) setLightboxOpen(true);
  }, [canLightbox]);

  return (
    <div>
      {/* Hero image — click to open the in-page lightbox. */}
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-brand-50 dark:border-gray-800 dark:bg-amber-900/20">
        {active ? (
          <button
            type="button"
            onClick={openLightbox}
            aria-label={`View ${product.productName} image full size`}
            className="block h-full w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={product.productName}
              className="h-full w-full object-contain"
            />
          </button>
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

      {lightboxOpen && (
        <Lightbox
          images={images}
          startIdx={activeIdx}
          productName={product.productName}
          onIndexChange={setActiveIdx}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

// Full-screen image viewer. Click backdrop / press Esc / hit the × button to
// close. Arrow keys navigate when there are 2+ images. Body scroll is locked
// while the overlay is mounted.
function Lightbox({ images, startIdx, productName, onIndexChange, onClose }) {
  const [idx, setIdx] = useState(startIdx);
  const hasMany = images.length > 1;

  const goPrev = useCallback(() => {
    setIdx((i) => {
      const next = (i - 1 + images.length) % images.length;
      onIndexChange?.(next);
      return next;
    });
  }, [images.length, onIndexChange]);

  const goNext = useCallback(() => {
    setIdx((i) => {
      const next = (i + 1) % images.length;
      onIndexChange?.(next);
      return next;
    });
  }, [images.length, onIndexChange]);

  // Keyboard: Esc closes, arrows navigate.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasMany) goPrev();
      else if (e.key === "ArrowRight" && hasMany) goNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext, hasMany]);

  // Lock background scroll while open. Restore the previous overflow value
  // when the lightbox unmounts so we don't trample on other code that may
  // also have temporarily locked it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const active = images[idx] || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} — full-size image`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8"
      onClick={onClose}
    >
      {/* Close (×) — top-right of the overlay. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close image"
        className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>

      {/* Prev — only when there are 2+ images. */}
      {hasMany && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          aria-label="Previous image"
          className="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-6"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      {/* Image — stopPropagation so clicking the image itself doesn't close
          the lightbox. */}
      {active && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={active.largeUrl || active.url}
          alt={productName}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full select-none object-contain"
        />
      )}

      {/* Next — only when there are 2+ images. */}
      {hasMany && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          aria-label="Next image"
          className="absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}

      {/* Counter footer — only meaningful when there's more than one image. */}
      {hasMany && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70">
          {idx + 1} / {images.length}
        </p>
      )}
    </div>
  );
}
