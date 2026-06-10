// "Lid styles" gallery for the public PP cups & IM lids page. Server component
// (no interactivity). One card per injection-molded lid SKU, with a product
// image loaded from public/pp-cups/lids/<SKU>.<ext>. Drop a photo in using the
// SKU as the filename (any of .jpg / .jpeg / .png / .webp) and it appears
// automatically; until then a labelled placeholder renders so the section never
// shows a broken image.

import fs from "node:fs";
import path from "node:path";

const LID_IMG_DIR = path.join(process.cwd(), "public", "pp-cups", "lids");

function findLidImage(sku) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    try {
      if (fs.existsSync(path.join(LID_IMG_DIR, `${sku}.${ext}`))) {
        return `/pp-cups/lids/${sku}.${ext}`;
      }
    } catch {
      // ignore — fall through to placeholder
    }
  }
  return null;
}

export function LidGallery({ sections }) {
  // Flatten the lid sections (Dome / Flat / Sipper) into one ordered list,
  // tagging each row with its lid-type label for the caption.
  const lids = sections
    .filter((s) => s.isLid)
    .flatMap((s) => s.rows.map((r) => ({ ...r, typeLabel: s.label })));

  if (lids.length === 0) return null;

  return (
    <section id="lid-styles" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Lid styles</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Every injection-molded lid in the range — dome, flat and the full set of sipper mechanisms.
        All supplied plain; match a lid to your cup by its top diameter.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {lids.map((lid) => {
          const src = findLidImage(lid.sku);
          const title = lid.name || lid.typeLabel;
          return (
            <figure
              key={lid.sku}
              className="overflow-hidden rounded-md border border-ink-200 bg-white"
            >
              <div className="aspect-square w-full bg-ink-50">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={`${lid.typeLabel} — ${title} — Aeros PP lid (${lid.sku})`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <LidPlaceholder />
                )}
              </div>
              <figcaption className="p-3">
                <p className="font-mono text-[11px] text-ink-400">{lid.sku}</p>
                <h3 className="mt-0.5 text-sm font-bold leading-tight text-ink-900">{title}</h3>
                <p className="mt-0.5 text-xs text-ink-500">
                  {lid.typeLabel}
                  {lid.size ? ` · ${lid.size}` : ""}
                </p>
              </figcaption>
            </figure>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-ink-400">
        Product photos are added per lid — styles without a photo yet show a placeholder.
      </p>
    </section>
  );
}

function LidPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-300">
      {/* Simple lid line-art: rim with a flat top and a small spout. */}
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
