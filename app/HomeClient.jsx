import Link from "next/link";
import AppHeader from "./components/AppHeader";

const ALL_OPTIONS = [
  {
    key: "clearance",
    href: "/clearance",
    title: "Clearance Stock",
    description: "Ready-to-ship packaging inventory, available for immediate dispatch.",
    accent: "from-amber-500 to-orange-600",
  },
  {
    key: "catalogue",
    href: "/catalog",
    title: "Product Catalogue",
    description: "Our full range of paper cups, bags, boxes, and tubes.",
    accent: "from-emerald-500 to-teal-600",
  },
  {
    key: "calculator",
    href: "/calculator",
    title: "Rate Calculator",
    description: "Live quotes for paper bags and custom boxes — pick the product, see the rate.",
    accent: "from-blue-600 to-indigo-700",
  },
  {
    key: "rate_cards",
    href: "/rate-cards",
    title: "Rate Cards",
    description: "Saved price lists per client — view current rates or build a new quote card.",
    accent: "from-sky-600 to-cyan-700",
  },
  {
    key: "factoryos",
    href: "/factoryos",
    title: "FactoryOS",
    description: "Track orders, jobs, production, RM inventory, and HR — your factory operations in one place.",
    accent: "from-fuchsia-600 to-purple-700",
  },
];

const CLEARANCE_MANAGE_OPTION = {
  key: "clearance-manage",
  href: "/clearance/manage",
  title: "Manage Warehouse",
  description: "Staff backend — edit items and upload photos. Restricted to Admin / FM / FE.",
  accent: "from-rose-500 to-red-600",
};

// Tiles open to anyone (no session required). Currently just the Clearance
// stock listing — staff Manage page stays gated. Easy to add Catalogue or
// other read-only views here if/when they should be public too.
const PUBLIC_OPTION_KEYS = new Set(["clearance"]);

export default function HomeClient({ session, canManageClearance, footer }) {
  const isAuthed = !!session;
  const modules = session?.modules || {};
  const options = isAuthed
    ? ALL_OPTIONS.filter((o) => !!modules[o.key])
    : ALL_OPTIONS.filter((o) => PUBLIC_OPTION_KEYS.has(o.key));
  if (canManageClearance) options.push(CLEARANCE_MANAGE_OPTION);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white dark:bg-none dark:bg-gray-950">
      <AppHeader session={session} />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="text-center mb-10 sm:mb-16">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
            Welcome to Aeros
          </h1>
          <p className="mt-3 sm:mt-4 text-base sm:text-lg max-w-2xl mx-auto text-gray-600 dark:text-gray-400">
            Paper packaging manufactured in India. Pick what you&apos;re here for.
          </p>
        </div>

        {!isAuthed && (
          <div className="mb-8 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Sign in to access Calculator, Catalogue, Rate Cards, FactoryOS →
            </Link>
          </div>
        )}

        {options.length === 0 ? (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400">
            You don&apos;t have access to any modules yet. Ask an admin to invite you.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
            {options.map((o) => (
              <Link
                key={o.href}
                href={o.href}
                className="group relative overflow-hidden rounded-2xl border p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 bg-white border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800 dark:hover:border-gray-700"
              >
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${o.accent}`} />
                <h2 className="text-lg sm:text-xl font-semibold mt-1 text-gray-900 dark:text-white">{o.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{o.description}</p>
                <p className="mt-4 text-sm font-medium text-blue-700 group-hover:text-blue-800 dark:text-blue-400 dark:group-hover:text-blue-300">
                  Enter →
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-10 sm:mt-16 text-center">
          <p className="text-sm mb-3 text-gray-500 dark:text-gray-400">Prefer the mobile app?</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://apps.apple.com/in/app/bosone/id6502510427"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-xl bg-black text-white px-5 py-3 hover:bg-gray-900 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" className="h-7 w-7 fill-white" aria-hidden="true">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              </svg>
              <span className="text-left leading-tight">
                <span className="block text-xs opacity-75">Download on the</span>
                <span className="block text-base font-semibold">App Store</span>
              </span>
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.bosone"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-xl bg-black text-white px-5 py-3 hover:bg-gray-900 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="h-7 w-7" aria-hidden="true">
                <path fill="#EA4335" d="M325.3 234.3L104.9 13.9c-1.2 10.2 62.7 109.2 188.1 225.7l32.3-5.3z" />
                <path fill="#FBBC05" d="M405.4 226.3l-50.9-29.4-44.3 41 44.3 41 50.9-29.4c17-9.8 17-34.4 0-44.3z" />
                <path fill="#4285F4" d="M22 10.7c-5.1 3.2-8.4 8.6-9.6 14.5L13 25 281.7 291 331 241.4 22 10.7z" />
                <path fill="#34A853" d="M14 522c1.2 5.9 4.5 11.3 9.6 14.5l309-230.7-49.3-49.6L14 522z" />
              </svg>
              <span className="text-left leading-tight">
                <span className="block text-xs opacity-75">Get it on</span>
                <span className="block text-base font-semibold">Google Play</span>
              </span>
            </a>
          </div>
          <p className="text-xs mt-4 text-gray-400 dark:text-gray-500">
            Currently listed as <em>Bosone</em> while the Aeros rebrand is in progress.
          </p>
        </div>
      </main>
      {footer}
    </div>
  );
}
