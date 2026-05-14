// Category icon map — fallback placeholder for products with no uploaded
// photos. When a product has at least one entry in `images` we render that
// instead (see ProductCard below).
const CATEGORY_ICONS = {
  'Paper Cups': (
    <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
      <path d="M14 16h36l-6 30H20L14 16z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M10 16h44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 28c2 4 14 4 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  'Paper Tubs': (
    <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
      <ellipse cx="32" cy="18" rx="20" ry="6" stroke="currentColor" strokeWidth="2.5" />
      <path d="M12 18v22c0 3.3 9 6 20 6s20-2.7 20-6V18" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  ),
  'Lids': (
    <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
      <ellipse cx="32" cy="28" rx="22" ry="7" stroke="currentColor" strokeWidth="2.5" />
      <path d="M10 28c0 3.9 9.9 7 22 7s22-3.1 22-7" stroke="currentColor" strokeWidth="2.5" />
      <path d="M26 21v-6M32 19v-8M38 21v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  'Food Boxes': (
    <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
      <rect x="10" y="24" width="44" height="28" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M10 32h44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 12l-8 12h44l-8-12H18z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  ),
  'Paper Straws': (
    <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
      <rect x="28" y="8" width="8" height="48" rx="4" stroke="currentColor" strokeWidth="2.5" />
      <path d="M20 20h24M20 44h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
    </svg>
  ),
  'Paper Bags': (
    <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
      <rect x="12" y="22" width="40" height="32" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M22 22v-6a10 10 0 0120 0v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  'Salad Bowls': (
    <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
      <path d="M10 28c0 12.2 9.9 22 22 22s22-9.8 22-22H10z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M8 28h48" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M26 20c0-3 4-6 4-10M34 22c0-3 4-5 4-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

const DEFAULT_ICON = (
  <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
    <rect x="10" y="10" width="44" height="44" rx="4" stroke="currentColor" strokeWidth="2.5" />
    <path d="M10 24h44M24 24v30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default function ProductCard({ product }) {
  const icon = CATEGORY_ICONS[product.category] || DEFAULT_ICON;
  // Prefer an uploaded photo when available, fall back to the category icon
  // placeholder. Photos come from master_product_photos via the airtable shim
  // and resolve to public catalog-photos bucket URLs.
  const heroImage = Array.isArray(product.images) && product.images.length > 0
    ? product.images[0]
    : null;

  const specs = [
    product.sizeVolume && { label: 'Size', value: product.sizeVolume },
    product.material && { label: 'Material', value: product.material },
    product.gsm && { label: 'GSM', value: `${product.gsm} gsm` },
    product.wallType && { label: 'Wall', value: product.wallType },
    product.colour && product.colour !== 'N/A' && { label: 'Colour', value: product.colour },
    product.unitsPerCase && { label: 'Case qty', value: `${product.unitsPerCase.toLocaleString()} units` },
    product.cartonDimensions && { label: 'Carton', value: product.cartonDimensions },
    product.casesPerPallet && { label: 'Pallet', value: `${product.casesPerPallet} cases` },
  ].filter(Boolean);

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      {/* Hero area — uploaded photo when present, category icon as fallback.
          When there's a photo, the whole tile is a link that opens the
          full-resolution image in a new tab. */}
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-brand-50 text-brand-300 transition group-hover:bg-brand-100 dark:bg-amber-900/30 dark:text-amber-400 dark:group-hover:bg-amber-900/50">
        {heroImage ? (
          <a
            href={heroImage.largeUrl || heroImage.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${product.productName} image full size`}
            className="block h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage.thumbnailUrl || heroImage.url}
              alt={product.productName}
              className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
              loading="lazy"
            />
            {/* Zoom-glass affordance — fades in on hover so the click target
                reads as openable without crowding the resting state. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-700 opacity-0 shadow-sm ring-1 ring-black/5 transition group-hover:opacity-100 dark:bg-gray-900/85 dark:text-gray-200"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M21 21l-4.3-4.3M8 11h6M11 8v6" />
              </svg>
            </span>
          </a>
        ) : (
          icon
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Category + SKU row */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="inline-block rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-amber-900/40 dark:text-amber-300">
            {product.subCategory || product.category}
          </span>
          {product.sku && (
            <span className="shrink-0 font-mono text-xs text-gray-400 dark:text-gray-500">{product.sku}</span>
          )}
        </div>

        {/* Name */}
        <h3 className="mb-3 line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">
          {product.productName}
        </h3>

        {/* Spec pills */}
        {specs.length > 0 && (
          <dl className="mb-3 flex flex-wrap gap-1.5">
            {specs.map(({ label, value }) => (
              <div key={label} className="flex items-center gap-1 rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                <dt className="font-medium text-gray-400 dark:text-gray-500">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Compatible products — populated server-side for round lids,
            listing the cups/tubs/bowls that match the lid's rim diameter. */}
        {product.compatibleWith?.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              Compatible with
            </div>
            <ul className="flex flex-wrap gap-1">
              {product.compatibleWith.map((c) => (
                <li
                  key={c.id}
                  title={c.productName}
                  className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-800 ring-1 ring-brand-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800"
                >
                  {c.productName}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pricing — hidden on the public catalogue. Visible to admin in
            /catalog/manage where the field still appears in the editor. */}
        <div className="mb-4 mt-auto">
          <span className="text-sm text-gray-400 dark:text-gray-500 italic">Price on request</span>
        </div>

        {/* CTA buttons */}
        <div className="flex gap-2">
          <a
            href={product.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-700"
            aria-label={`Inquire about ${product.productName} on WhatsApp`}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            WhatsApp
          </a>
          <a
            href={product.emailUrl}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
            aria-label={`Inquire about ${product.productName} by email`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email
          </a>
        </div>
      </div>
    </div>
  );
}
