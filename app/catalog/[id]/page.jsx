import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchCatalogProductById, canManageCatalogue } from "@/lib/catalog";
import { getSession } from "@/lib/hub/session";
import AppHeader from "../../components/AppHeader";
import Footer from "../../components/Footer";
import ProductGallery from "./ProductGallery";

export const revalidate = 300; // refresh every 5 minutes

export async function generateMetadata({ params }) {
  const product = await fetchCatalogProductById(params.id);
  if (!product) return { title: "Product not found · Aeros" };
  return {
    title: `${product.productName} · Aeros`,
    description:
      product.notes ||
      `${product.productName} — ${product.category}${product.sizeVolume ? ` · ${product.sizeVolume}` : ""}. Engineered for operators by Aeros.`,
    openGraph: product.images?.[0]?.url
      ? { images: [{ url: product.images[0].url }] }
      : undefined,
  };
}

export default async function ProductDetailPage({ params }) {
  const fetched = await fetchCatalogProductById(params.id);
  if (!fetched) notFound();
  const session = getSession();
  // Notes are an internal scratchpad — supplier codes, dual-rate breakdowns,
  // staging paths — so we only expose them to viewers who can already see
  // them on /catalog/manage (admins, FM/FE, account managers). Customers
  // browsing the public detail page never see the field. We redact at the
  // server boundary (rather than just hiding the JSX) so the value doesn't
  // ship in the RSC payload when ProductGallery — a client component —
  // receives the product as a prop.
  const canSeeInternalNotes = canManageCatalogue(session);
  const product = canSeeInternalNotes ? fetched : { ...fetched, notes: "" };

  // Spec rows shown in the right-hand details column. Same fields the card
  // surfaces, plus everything else that's set on the product. Each row is
  // skipped when the underlying field is null / empty.
  const specs = compactSpecs([
    ["SKU",                product.sku, { mono: true }],
    ["Category",           product.category],
    ["Sub-category",       product.subCategory],
    ["Size / Volume",      product.sizeVolume],
    ["Colour / Print",     product.colour && product.colour !== "N/A" ? product.colour : null],
    ["Material",           product.material],
    ["GSM",                product.gsm != null ? `${product.gsm} gsm` : null],
    ["Wall type",          product.wallType],
    ["Coating",            product.coating],
    ["Top diameter",       product.topDiameter != null ? `${product.topDiameter} mm` : null],
    ["Bottom diameter",    product.bottomDiameter != null ? `${product.bottomDiameter} mm` : null],
    ["Height",             product.heightMm != null ? `${product.heightMm} mm` : null],
    ["Carton dimensions",  product.cartonDimensions],
    ["Units per case",     product.unitsPerCase != null ? `${product.unitsPerCase.toLocaleString()} units` : null],
    ["Cases per pallet",   product.casesPerPallet != null ? `${product.casesPerPallet} cases` : null],
    ["MOQ for print",      product.printMoqUnits != null ? `${product.printMoqUnits.toLocaleString()} units` : null],
    ["Supplier",           product.supplier],
  ]);

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Link href="/catalog" className="hover:text-gray-900 dark:hover:text-white">
            Catalog
          </Link>
          <span aria-hidden="true">/</span>
          {product.category && (
            <>
              <Link
                href={`/catalog?category=${encodeURIComponent(product.category)}`}
                className="hover:text-gray-900 dark:hover:text-white"
              >
                {product.category}
              </Link>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span className="truncate text-gray-700 dark:text-gray-300">{product.productName}</span>
        </nav>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Left: image gallery */}
          <ProductGallery product={product} />

          {/* Right: title, specs, CTAs */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-amber-900/40 dark:text-amber-300">
                {product.subCategory || product.category}
              </span>
              {product.sku && (
                <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
                  {product.sku}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl dark:text-white">
              {product.productName}
            </h1>

            {/* Pricing display — the full rate ladder lives below in
                the "All rates · India landed" section. When a product
                has no pricing tiers yet (cups, lids, bags), fall back
                to a "Price on request" cue so buyers know to inquire
                via the WhatsApp / Email CTAs further down. */}
            {!product.landed?.available && (
              <p className="mt-3 text-sm italic text-gray-400 dark:text-gray-500">
                Price on request
              </p>
            )}

            {/* Rate ladder. Tiers come from master_product_pricing and
                feed onto the product via attachPricingTiers. We show the
                india_landed_inr value (the all-in DDP-equivalent ₹/pc
                a buyer pays delivered in India) and hide the raw
                incoterm — the row-level EXW vs DDP distinction is a
                seller-side concern that confused buyers. Savings % is
                computed against the lowest-MOQ rung within each group. */}
            {(() => {
              const groups = groupTiersForDisplay(product.pricingTiers);
              if (!groups.length) return null;
              return (
                <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  <h2 className="border-b border-gray-200 px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    Pricing · Delivered in India
                  </h2>
                  {groups.map((g) => (
                    <RateTable key={g.key} group={g} />
                  ))}
                  <p className="border-t border-gray-200 px-4 py-3 text-[11px] text-gray-400 dark:border-gray-800 dark:text-gray-500">
                    Indicative ₹/pc, GST and delivery within India
                    included. Final quote confirmed on inquiry.
                  </p>
                </section>
              );
            })()}

            {/* Spec table */}
            {specs.length > 0 && (
              <dl className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
                {specs.map(({ label, value, mono }) => (
                  <div
                    key={label}
                    className="grid grid-cols-3 gap-4 px-4 py-3 text-sm"
                  >
                    <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                    <dd
                      className={`col-span-2 text-gray-900 dark:text-gray-100 ${mono ? "font-mono" : ""}`}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {/* Compatible with — populated server-side for round lids. */}
            {product.compatibleWith?.length > 0 && (
              <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Compatible with
                </h2>
                <ul className="flex flex-wrap gap-1.5">
                  {product.compatibleWith.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/catalog/${c.id}`}
                        title={c.productName}
                        className="inline-block rounded bg-brand-50 px-2 py-1 text-xs text-brand-800 ring-1 ring-brand-200 transition hover:bg-brand-100 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800 dark:hover:bg-amber-900/40"
                      >
                        {c.productName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Internal notes — staff-only. Holds supplier codes, dual-rate
                breakdowns, and other commentary the admin keeps for context.
                Customers see nothing here. */}
            {canSeeInternalNotes && product.notes && (
              <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
                    Internal notes
                  </h2>
                  <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    Staff only
                  </span>
                </div>
                <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">
                  {product.notes}
                </p>
              </section>
            )}

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={product.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Inquire on WhatsApp
              </a>
              <a
                href={product.emailUrl}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email inquiry
              </a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function compactSpecs(rows) {
  return rows
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value, opts]) => ({ label, value, mono: !!opts?.mono }));
}

// Group pricing tiers by offering_type for the rate-ladder section.
// Drops tiers without an india_landed_inr (nothing to display) and orders
// the groups Plain → Printed → anything else. Rows within each group are
// sorted by MOQ ascending so the ladder reads small → large.
const OFFERING_ORDER = ["plain", "custom_branded"];
const OFFERING_META = {
  plain: { label: "Plain", subtitle: "No print" },
  custom_branded: { label: "Printed", subtitle: "Your branded artwork" },
};

function groupTiersForDisplay(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return [];
  const byType = new Map();
  for (const t of tiers) {
    if (t.indiaLandedInr == null) continue;
    if (!byType.has(t.offeringType)) byType.set(t.offeringType, []);
    byType.get(t.offeringType).push(t);
  }
  const orderedKeys = [
    ...OFFERING_ORDER.filter((k) => byType.has(k)),
    ...Array.from(byType.keys()).filter((k) => !OFFERING_ORDER.includes(k)),
  ];
  return orderedKeys.map((k) => {
    const meta = OFFERING_META[k] || { label: k };
    return {
      key: k,
      label: meta.label,
      subtitle: meta.subtitle || null,
      rows: byType.get(k).sort((a, b) => (a.minQty || 0) - (b.minQty || 0)),
    };
  });
}

function RateTable({ group }) {
  const rows = group.rows;
  if (rows.length === 0) return null;
  // Savings % uses the smallest-MOQ rung as the baseline so a 50k-rung
  // shows "Save 77%" vs the 1k entry rate. Single-rate groups (Plain
  // is usually one row) skip the column entirely.
  const baseline = Number(rows[0].indiaLandedInr);
  const showSavings = rows.length > 1;
  const cheapestPrice = Math.min(...rows.map((r) => Number(r.indiaLandedInr)));

  return (
    <div className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
      <div className="flex items-baseline gap-2 px-4 pt-4 pb-1">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {group.label}
        </span>
        {group.subtitle && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            · {group.subtitle}
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <th className="px-4 py-2 text-left font-medium">Order quantity</th>
            <th className="px-4 py-2 text-right font-medium">Price /pc</th>
            {showSavings && (
              <th className="px-4 py-2 text-right font-medium">Savings</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const price = Number(t.indiaLandedInr);
            const savingsPct =
              baseline > 0 ? Math.round((1 - price / baseline) * 100) : 0;
            const isBest = price === cheapestPrice && showSavings;
            return (
              <tr
                key={t.id}
                className="border-t border-gray-100 dark:border-gray-800"
              >
                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                  {t.minQty != null
                    ? `${t.minQty.toLocaleString()}+ pcs`
                    : "—"}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-semibold ${
                    isBest
                      ? "text-brand-700 dark:text-amber-300"
                      : "text-gray-900 dark:text-gray-100"
                  }`}
                >
                  ₹{price.toFixed(2)}
                  {isBest && (
                    <span className="ml-2 inline-block rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700 ring-1 ring-brand-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800">
                      Best
                    </span>
                  )}
                </td>
                {showSavings && (
                  <td className="px-4 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400">
                    {savingsPct > 0 ? `Save ${savingsPct}%` : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
