import Link from "next/link";
import { getSession } from "@/lib/hub/session";
import { canManageClearance } from "@/lib/clearance/admin";

export const metadata = {
  title: "WarehouseOS — Aeros",
  description: "Clearance stock, master inventory, inward/outward, and stock audits.",
};

const PUBLIC_TILE = {
  key: "clearance",
  href: "/warehouse/clearance",
  title: "Clearance Stock",
  description: "Ready-to-ship overstock and slow-moving SKUs at sharper rates.",
  accent: "from-amber-500 to-orange-600",
};

const STAFF_TILES = [
  {
    key: "clearance-manage",
    href: "/warehouse/clearance/manage",
    title: "Manage Clearance",
    description: "Edit clearance items and upload photos. Restricted to Admin / FM / FE.",
    accent: "from-rose-500 to-red-600",
  },
  {
    key: "inventory",
    href: "/warehouse/inventory",
    title: "Inventory (WMS)",
    description: "Master SKU stock position and the items master. Inward / outward / audits land in Phase 2.",
    accent: "from-emerald-500 to-teal-600",
  },
];

export default function WarehouseHubPage() {
  const session = getSession();
  const showStaff = canManageClearance(session);
  const tiles = showStaff ? [PUBLIC_TILE, ...STAFF_TILES] : [PUBLIC_TILE];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <div className="text-center mb-10 sm:mb-16">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
          WarehouseOS
        </h1>
        <p className="mt-3 sm:mt-4 text-base sm:text-lg max-w-2xl mx-auto text-gray-600 dark:text-gray-400">
          Bhiwandi warehouse — stock position, dead-stock listing, inward/outward, and audits.
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
