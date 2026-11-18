"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Second row under the Stock tab.
export default function StockNav({ canWork }) {
  const pathname = usePathname();
  const links = [
    { href: "/factoryos/warehouse/stock", label: "On the racks", exact: true },
    ...(canWork ? [{ href: "/factoryos/warehouse/stock/items", label: "Items" }, { href: "/factoryos/warehouse/stock/counts", label: "Stock count" }] : []),
    { href: "/factoryos/warehouse/stock/history", label: "History" },
    ...(canWork ? [{ href: "/factoryos/warehouse/stock/manual", label: "Manual entry" }] : []),
  ];
  return (
    <div className="mb-5 flex flex-wrap gap-1.5">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${active ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}>
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
