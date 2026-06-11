// "Cup styles" gallery for the public PP cups & IM lids page. Server side of
// the pair: resolves each cup's product photo from public/pp-cups/cups/
// <SKU>.<ext> (drop a photo in using the SKU as the filename — any of .jpg /
// .jpeg / .png / .webp — and it appears automatically), then hands the
// flattened list to the shared StyleCarousel client component. Cups without a
// photo render a placeholder so the section never shows a broken image.

import fs from "node:fs";
import path from "node:path";
import { StyleCarousel } from "./StyleCarousel";

const CUP_IMG_DIR = path.join(process.cwd(), "public", "pp-cups", "cups");

function findCupImage(sku) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    try {
      if (fs.existsSync(path.join(CUP_IMG_DIR, `${sku}.${ext}`))) {
        return `/pp-cups/cups/${sku}.${ext}`;
      }
    } catch {
      // ignore — fall through to placeholder
    }
  }
  return null;
}

export function CupGallery({ sections }) {
  // Flatten the cup sections (F-Bottom / U-Bottom / Sets) into one ordered
  // list. Card title leads with capacity, then the finish; profile/type goes
  // in the caption line.
  const cups = sections
    .filter((s) => !s.isLid)
    .flatMap((s) =>
      s.rows.map((r) => ({
        sku: r.sku,
        title: [r.volume, r.finish].filter(Boolean).join(" · ") || r.name || s.label,
        typeLabel: s.label,
        size: r.size || null,
        src: findCupImage(r.sku),
      })),
    );

  if (cups.length === 0) return null;

  return (
    <section id="cup-styles" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Cup styles</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        The full cup range — F-Bottom and U-Bottom profiles in clear and frosted finishes. All
        custom-brandable; printed samples shown where available.
      </p>

      <StyleCarousel items={cups} kind="cup" label="Cup styles carousel" />

      <p className="mt-3 text-xs text-ink-400">
        Product photos are added per cup — styles without a photo yet show a placeholder.
      </p>
    </section>
  );
}
