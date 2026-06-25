"use client";

// Generic module sidebar. Each module passes its own `sections` config
// describing the nav tree:
//
//   sections = [
//     { label: "Operations", items: [{ href: "/x", label: "Foo" }, ...] },
//     ...
//   ]
//
// Active link is detected by prefix-match so detail pages (/x/[id]) keep
// the parent nav highlighted.

import Link from "next/link";
import { usePathname } from "next/navigation";

function isActive(pathname, href, exact = false) {
  if (exact) return pathname === href;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export default function ModuleSidebar({ sections, ariaLabel = "Module sections" }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={ariaLabel}
      className="flex h-full w-full flex-col gap-6 overflow-y-auto px-4 py-6"
    >
      {sections.map((section) => (
        <div key={section.label}>
          <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {section.label}
          </h3>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-200"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold leading-5 text-white">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
