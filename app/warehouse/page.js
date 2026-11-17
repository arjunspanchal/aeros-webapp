import Link from "next/link";
import { getSession } from "@/lib/hub/session";
import { canManageClearance } from "@/lib/clearance/admin";

export const metadata = {
  title: "WarehouseOS — Aeros",
  description: "Dispatch, master inventory, inward/outward, and stock audits.",
};

// The public clearance stock site was removed on 18-Nov-2026.
const STAFF_TILES = [
  {
    key: "inventory",
    href: "/warehouse/inventory",
    title: "Inventory (WMS)",
    description: "Master SKU stock position, items master, inward / outward, transfers and stock audits.",
    accent: "from-emerald-500 to-teal-600",
    quickLinks: [
      { href: "/warehouse/inventory",            label: "Stock"   },
      { href: "/warehouse/inventory/items",      label: "Items"   },
      { href: "/warehouse/inventory/inward",     label: "Inward"  },
      { href: "/warehouse/inventory/outward",    label: "Outward" },
      { href: "/warehouse/inventory/movements",  label: "History" },
      { href: "/warehouse/inventory/audits",     label: "Audits"  },
    ],
  },
];

// Handover register from FactoryOS: jobs the factory has closed, with the
// finished qty; warehouse marks them dispatched.
const FACTORY_FG_TILE = {
  key: "factory-fg",
  href: "/warehouse/dispatch",
  title: "Dispatch",
  description: "Jobs the factory has handed over and are ready to go, and jobs dispatched but not yet confirmed delivered.",
  accent: "from-gray-700 to-gray-900",
};

// Zoho invoices the warehouse has not yet recorded as loaded (18-Nov-2026).
const INVOICES_TILE = {
  key: "invoices",
  href: "/warehouse/invoices",
  title: "Invoices to load",
  description: "Every Zoho invoice waiting to leave. Mark it loaded with the vehicle or LR, and stock comes off the racks.",
  accent: "from-gray-700 to-gray-900",
};

export default function WarehouseHubPage() {
  const session = getSession();
  const showStaff = canManageClearance(session);
  const tiles = showStaff ? [INVOICES_TILE, FACTORY_FG_TILE, ...STAFF_TILES] : [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <div className="text-center mb-10 sm:mb-16">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
          WarehouseOS
        </h1>
        <p className="mt-3 sm:mt-4 text-base sm:text-lg max-w-2xl mx-auto text-gray-600 dark:text-gray-400">
          Bhiwandi warehouse — dispatch, stock position, inward/outward, and audits.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
        {tiles.map((t) => {
          const className =
            "group relative overflow-hidden rounded-2xl border p-6 shadow-sm transition-all bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800";
          if (t.disabled) {
            return (
              <div
                key={t.href}
                className={`${className} opacity-60 cursor-not-allowed`}
                aria-disabled="true"
                title="Coming soon"
              >
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${t.accent}`} />
                <h2 className="text-lg sm:text-xl font-semibold mt-1 text-gray-900 dark:text-white">{t.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{t.description}</p>
                <p className="mt-4 text-sm font-medium text-gray-400 dark:text-gray-500">Coming soon</p>
              </div>
            );
          }
          // Quick-link strip below the main CTA. Anchors can't nest, so the
          // tile body is a Link and quick links live as siblings under it.
          if (Array.isArray(t.quickLinks) && t.quickLinks.length > 0) {
            return (
              <div
                key={t.href}
                className={`${className} hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${t.accent}`} />
                <Link href={t.href} className="group/main block">
                  <h2 className="text-lg sm:text-xl font-semibold mt-1 text-gray-900 dark:text-white">{t.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{t.description}</p>
                  <p className="mt-4 text-sm font-medium text-blue-700 group-hover/main:text-blue-800 dark:text-blue-400 dark:group-hover/main:text-blue-300">
                    Enter →
                  </p>
                </Link>
                <div className="mt-3 -mx-1 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
                  {t.quickLinks.map((q) => (
                    <Link
                      key={q.href}
                      href={q.href}
                      className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
                    >
                      {q.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`${className} hover:shadow-md hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-700`}
            >
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${t.accent}`} />
              <h2 className="text-lg sm:text-xl font-semibold mt-1 text-gray-900 dark:text-white">{t.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{t.description}</p>
              <p className="mt-4 text-sm font-medium text-blue-700 group-hover:text-blue-800 dark:text-blue-400 dark:group-hover:text-blue-300">
                Enter →
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
