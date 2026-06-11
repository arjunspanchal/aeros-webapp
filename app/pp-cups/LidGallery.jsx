// "Lid styles" gallery for the public PP cups & IM lids page. Server side of
// the pair: resolves each lid's product photo from public/pp-cups/lids/
// <SKU>.<ext> (drop a photo in using the SKU as the filename — any of .jpg /
// .jpeg / .png / .webp — and it appears automatically), then hands the
// flattened list to the LidCarousel client component which owns the
// horizontal scroll / arrows. Lids without a photo render a placeholder so
// the section never shows a broken image.

import fs from "node:fs";
import path from "node:path";
import { LidCarousel } from "./LidCarousel";

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
  // Flatten the lid sections (Dome / Sipper) into one ordered list, tagging
  // each row with its lid-type label for the caption. Only plain data crosses
  // the server→client boundary.
  const lids = sections
    .filter((s) => s.isLid)
    .flatMap((s) =>
      s.rows.map((r) => ({
        sku: r.sku,
        title: r.name || s.label,
        typeLabel: s.label,
        size: r.size || null,
        src: findLidImage(r.sku),
      })),
    );

  if (lids.length === 0) return null;

  return (
    <section id="lid-styles" className="mt-12">
      <div className="border-b border-ink-300 pb-2">
        <h2 className="text-lg font-bold text-ink-900">Lid styles</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">
        Every injection-molded lid in the range — the dome and the full set of sipper mechanisms,
        in their available colours. All supplied plain; match a lid to your cup by its top
        diameter.
      </p>

      <LidCarousel lids={lids} />

      <p className="mt-3 text-xs text-ink-400">
        Product photos are added per lid — styles without a photo yet show a placeholder.
      </p>
    </section>
  );
}
