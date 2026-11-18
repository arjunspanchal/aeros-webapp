"use client";

// Generic module shell: persistent left sidebar (md+) + main content pane.
// The sidebar stays put while the page scrolls. On a phone the sidebar is a
// drawer: modules that pass `mobileTabs` get a bottom tab bar (their few most
// used screens plus "More", which opens the drawer); the rest keep the
// floating menu button.
//
// Caller passes a sidebar JSX (typically <ModuleSidebar sections={...} />)
// and the module label that shows in the mobile drawer header.

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive } from "./navActive";

export default function ModuleShell({ sidebar, label = "Menu", mobileTabs = null, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const tabs = Array.isArray(mobileTabs) && mobileTabs.length ? mobileTabs : null;
  return (
    <div className="flex flex-1 min-h-[calc(100vh-3.5rem)]">
      {/* Desktop sidebar — fixed-width left rail that stays in view. */}
      <aside className="hidden md:flex w-60 shrink-0 sticky top-14 self-start h-[calc(100vh-3.5rem)] border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        {sidebar}
      </aside>

      {tabs ? (
        <nav
          aria-label={`${label} quick links`}
          className="md:hidden fixed bottom-0 inset-x-0 z-30 grid border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-gray-800 dark:bg-gray-950"
          style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
        >
          {tabs.map((t) => {
            const active = isNavActive(pathname, t);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`relative flex h-14 flex-col items-center justify-center gap-0.5 border-t-2 px-1 text-[11px] ${
                  active ? "border-gray-900 font-semibold text-gray-900 dark:border-white dark:text-white" : "border-transparent text-gray-500 dark:text-gray-400"
                }`}
              >
                <span className="truncate">{t.label}</span>
                {t.badge ? (
                  <span className="absolute right-[18%] top-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-4 text-white">
                    {t.badge > 99 ? "99+" : t.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={`Open the full ${label} menu`}
            className="flex h-14 flex-col items-center justify-center gap-0.5 border-t-2 border-transparent px-1 text-[11px] text-gray-500 dark:text-gray-400"
          >
            <span>More</span>
          </button>
        </nav>
      ) : (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={`Open ${label} menu`}
          className="md:hidden fixed bottom-4 right-4 z-30 rounded-full bg-gray-900 px-4 py-3 text-xs font-semibold text-white shadow-lg hover:bg-gray-800"
        >
          ☰ {label}
        </button>
      )}

      {/* Mobile drawer — slides in from left. */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col bg-white shadow-xl dark:bg-gray-950"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => setDrawerOpen(false)}>{sidebar}</div>
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
    </div>
  );
}
