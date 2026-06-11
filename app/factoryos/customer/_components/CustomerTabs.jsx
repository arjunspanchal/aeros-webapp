"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Tab bar for the customer portal. Sticky on scroll so deep pages keep
// navigation in reach. Each tab compares against the current pathname so it
// stays highlighted on nested routes (e.g. /factoryos/customer/[id] still
// highlights "Orders").
const TABS = [
  { href: "/factoryos/customer",            label: "Orders",    match: (p) => p === "/factoryos/customer" || (p.startsWith("/factoryos/customer/") && !p.startsWith("/factoryos/customer/documents") && !p.startsWith("/factoryos/customer/pos") && !p.startsWith("/factoryos/customer/profile")) },
  { href: "/factoryos/customer/documents",  label: "Documents", match: (p) => p.startsWith("/factoryos/customer/documents") },
  { href: "/factoryos/customer/pos",        label: "POs",       match: (p) => p.startsWith("/factoryos/customer/pos") },
  { href: "/factoryos/customer/profile",    label: "Profile",   match: (p) => p.startsWith("/factoryos/customer/profile") },
];

export default function CustomerTabs() {
  const pathname = usePathname() || "/";
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex gap-1 overflow-x-auto -mb-px">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-blue-600 text-blue-700 dark:text-blue-300"
                  : "border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
