"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

// Single sticky nav bar for the customer portal — replaces the previous
// welcome strip + separate CustomerTabs combo. One horizontal surface:
//
//   ┌──────────────────────────────────────────────────────────────────┐
//   │ [Brewbay ▾]   Orders · Delivery Plan · Inbox · Documents · POs · Profile │
//   └──────────────────────────────────────────────────────────────────┘
//
// Left: company picker, only renders the dropdown affordance if the user
//       is linked to more than one client. Single-client customers see a
//       plain label.
// Right: tabs. Each computes its own active state against the pathname,
//        and an Orders / Inbox tab can carry an unread badge.
//
// Sticky on scroll so deep pages (long thread, document library) keep nav
// in reach. Mobile: tabs scroll horizontally; the picker stays pinned left.

const TABS = [
  {
    href: "/factoryos/customer",
    label: "Orders",
    match: (p) =>
      p === "/factoryos/customer" ||
      (p.startsWith("/factoryos/customer/") &&
        !p.startsWith("/factoryos/customer/delivery") &&
        !p.startsWith("/factoryos/customer/inbox") &&
        !p.startsWith("/factoryos/customer/documents") &&
        !p.startsWith("/factoryos/customer/pos") &&
        !p.startsWith("/factoryos/customer/profile")),
  },
  {
    href: "/factoryos/customer/delivery",
    label: "Delivery Plan",
    match: (p) => p.startsWith("/factoryos/customer/delivery"),
  },
  {
    href: "/factoryos/customer/inbox",
    label: "Inbox",
    match: (p) => p.startsWith("/factoryos/customer/inbox"),
    badgeKey: "unread",
  },
  {
    href: "/factoryos/customer/documents",
    label: "Documents",
    match: (p) => p.startsWith("/factoryos/customer/documents"),
  },
  {
    href: "/factoryos/customer/pos",
    label: "POs",
    match: (p) => p.startsWith("/factoryos/customer/pos"),
  },
  {
    href: "/factoryos/customer/profile",
    label: "Profile",
    match: (p) => p.startsWith("/factoryos/customer/profile"),
  },
];

export default function CustomerNavBar({ clients = [], activeClientId, badges = {} }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const single = clients.length <= 1;
  const active = clients.find((c) => c.id === activeClientId) || clients[0] || null;

  async function pickClient(e) {
    const id = e.target.value;
    if (!id || id === activeClientId) return;
    setSwitching(true);
    try {
      await fetch("/api/factoryos/customer/active-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id }),
      });
      // Soft-refresh: revalidates server components without losing scroll
      // position the way location.reload would.
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="sticky top-14 z-30 bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-3 sm:gap-5 h-12">
        {/* Client picker — silent for single-client customers. */}
        <div className="shrink-0 min-w-0">
          {single ? (
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate inline-block max-w-[10rem] sm:max-w-none align-middle">
              {active?.name || "Your portal"}
            </span>
          ) : (
            <label className="relative inline-flex items-center">
              <select
                value={activeClientId || ""}
                onChange={pickClient}
                disabled={switching}
                className="appearance-none pl-2.5 pr-7 py-1 text-sm font-semibold text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700 max-w-[10rem] sm:max-w-[14rem] truncate"
                aria-label="Switch customer account"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 text-gray-400" aria-hidden>▾</span>
            </label>
          )}
        </div>

        {/* Tabs — scroll horizontally on small screens so the picker stays
            in view. -mb-px lines the active underline up with the bar's
            bottom border. */}
        <nav className="flex-1 flex items-center gap-0 overflow-x-auto -mb-px">
          {TABS.map((t) => {
            const isActive = t.match(pathname);
            const badge = t.badgeKey ? badges[t.badgeKey] || 0 : 0;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-700 dark:text-blue-300"
                    : "border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {t.label}
                {badge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[11px] font-semibold tabular-nums bg-blue-600 text-white">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
