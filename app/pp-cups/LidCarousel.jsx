"use client";

// Horizontal carousel for the lid-styles gallery. Native scroll with snap
// points (so it swipes naturally on touch), plus arrow buttons on desktop.
// Receives a plain array of lids from the LidGallery server component —
// { sku, title, typeLabel, size, src } — and renders one card each. No data
// fetching, no external carousel lib.

import { useEffect, useRef, useState } from "react";

export function LidCarousel({ lids }) {
  const trackRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  // Enable/disable the arrows based on scroll position.
  const update = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    update();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Scroll by one viewport (rounded to whole cards via snap points).
  const nudge = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative mt-6" role="region" aria-label="Lid styles carousel">
      {/* Arrows — hidden on touch-first small screens where swiping is natural. */}
      <CarouselArrow side="left" disabled={!canPrev} onClick={() => nudge(-1)} />
      <CarouselArrow side="right" disabled={!canNext} onClick={() => nudge(1)} />

      <ul
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {lids.map((lid) => (
          <li
            key={lid.sku}
            className="w-[200px] shrink-0 snap-start overflow-hidden rounded-md border border-ink-200 bg-white sm:w-[220px]"
          >
            <div className="aspect-square w-full bg-ink-50">
              {lid.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lid.src}
                  alt={`${lid.typeLabel} — ${lid.title} — Aeros PP lid (${lid.sku})`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <LidPlaceholder />
              )}
            </div>
            <div className="p-3">
              <p className="font-mono text-[11px] text-ink-400">{lid.sku}</p>
              <h3 className="mt-0.5 text-sm font-bold leading-tight text-ink-900">{lid.title}</h3>
              <p className="mt-0.5 text-xs text-ink-500">
                {lid.typeLabel}
                {lid.size ? ` · ${lid.size}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CarouselArrow({ side, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous lids" : "More lids"}
      className={
        "absolute top-[100px] z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border bg-white shadow-sm transition-opacity sm:flex " +
        (side === "left" ? "-left-3 " : "-right-3 ") +
        (disabled
          ? "cursor-default border-ink-100 text-ink-200 opacity-50"
          : "border-ink-300 text-ink-700 hover:bg-ink-100")
      }
    >
      <svg
        viewBox="0 0 16 16"
        className={"h-4 w-4 " + (side === "left" ? "rotate-180" : "")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3l5 5-5 5" />
      </svg>
    </button>
  );
}

function LidPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-300">
      <svg
        viewBox="0 0 80 56"
        className="h-12 w-auto"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 30 L66 30 L60 42 L20 42 Z" />
        <ellipse cx="40" cy="30" rx="26" ry="6" />
        <path d="M50 28 q7 -2 8 -12 q-7 1 -10 5" strokeWidth="1.6" />
      </svg>
      <span className="px-3 text-center font-mono text-[10px] uppercase tracking-wider">
        Photo coming soon
      </span>
    </div>
  );
}
