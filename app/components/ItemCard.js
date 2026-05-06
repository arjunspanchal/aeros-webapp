export default function ItemCard({ item }) {
  const outOfStock = item.stockQuantity === 0;

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      {/* Image or placeholder — always a square tile. Non-square source images
          are letterboxed/pillarboxed against a neutral background so the
          entire product stays visible. */}
      <div className="relative aspect-square overflow-hidden bg-gray-100 p-2 dark:bg-gray-800">
        {item.photoUrl ? (
          // Use plain <img> instead of next/image to avoid optimization pipeline
          // for Airtable URLs (which expire). Simpler and reliable.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photoUrl}
            alt={item.itemName}
            className="h-full w-full object-contain transition group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              className="h-16 w-16 text-gray-300 dark:text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-900 dark:bg-gray-900 dark:text-gray-100">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="inline-block rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-amber-900/40 dark:text-amber-300">
            {item.category}
          </span>
          {item.brand && item.brand !== 'Other' && (
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">{item.brand}</span>
          )}
        </div>

        <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">
          {item.itemName}
        </h3>

        <p className="mb-1 text-xs text-gray-600 dark:text-gray-400">
          {item.stockQuantity !== null ? (
            <>
              <span className="font-semibold text-gray-900 dark:text-gray-200">
                {item.stockQuantity.toLocaleString()}
              </span>{' '}
              {item.unit} available
            </>
          ) : (
            'Stock TBC'
          )}
        </p>

        <p className="mb-4 text-xs">
          {item.price != null ? (
            <>
              <span className="font-semibold text-gray-900 dark:text-gray-200">
                {new Intl.NumberFormat('en-IN', {
                  style: 'currency',
                  currency: 'INR',
                  maximumFractionDigits: 2,
                }).format(item.price)}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {' '}/ {item.priceUnit || item.unit || 'unit'}
              </span>
            </>
          ) : (
            <span className="italic text-gray-500 dark:text-gray-400">Rate Pending</span>
          )}
        </p>

        {/* Buttons */}
        <div className="mt-auto flex gap-2">
          {item.whatsappUrl && (
            <a
              href={item.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-700"
              aria-label={`Inquire about ${item.itemName} on WhatsApp`}
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
          )}
          {item.emailUrl && (
            <a
              href={item.emailUrl}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
              aria-label={`Inquire about ${item.itemName} by email`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Email
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
