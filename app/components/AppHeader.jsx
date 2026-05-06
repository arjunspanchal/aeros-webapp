"use client";
// Single unified top header for every page across every module.
//
// Shell prompt 2 rewrite — editorial-utilitarian. Desktop: sticky top bar
// with Brand left, module nav center (underline-on-active), IdentityMenu
// right. Mobile: Brand left, MobileNav hamburger right. The sub-tab row
// renders inline below the bar on ALL viewports (overrides the sheet
// design from the original Shell prompt) — sub-tabs are frequent and
// belong in muscle memory.
//
// All `subTabsFor` role logic is preserved verbatim from the previous
// version; only the chrome around it changed.
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Brand, IdentityMenu, MobileNav } from "./ui";

const MODULES = [
  { key: "calculator",  label: "Calculator",  href: "/calculator"  },
  { key: "rate_cards",  label: "Rate Cards",  href: "/rate-cards"  },
  { key: "factoryos",   label: "FactoryOS",   href: "/factoryos"   },
  { key: "catalogue",   label: "Catalogue",   href: "/catalog"     },
  { key: "clearance",   label: "Clearance",   href: "/clearance"   },
];

function activeModuleKey(pathname) {
  if (pathname.startsWith("/calculator")) return "calculator";
  if (pathname.startsWith("/rate-cards")) return "rate_cards";
  if (pathname.startsWith("/factoryos"))  return "factoryos";
  if (pathname.startsWith("/catalog"))    return "catalogue";
  if (pathname.startsWith("/clearance"))  return "clearance";
  return null;
}

// Derive sub-tabs from the current module + the user's role within that module.
// Returning [] means the header shows only the top row.
function subTabsFor(pathname, session) {
  const active = activeModuleKey(pathname);
  if (!active) return [];

  if (active === "calculator") {
    const role = session?.modules?.calculator;
    if (role === "admin") {
      return [
        { href: "/calculator/admin",          label: "Bag",      short: "Bag" },
        { href: "/calculator/admin/box",      label: "Box",      short: "Box" },
        { href: "/calculator/admin/cup",      label: "Cup",      short: "Cup" },
        { href: "/calculator/admin/pp",       label: "PP",       short: "PP" },
        { href: "/calculator/admin/history",  label: "History",  short: "History" },
        { href: "/calculator/admin/clients",  label: "Clients",  short: "Clients" },
        { href: "/calculator/admin/rates",    label: "Rates",    short: "Rates" },
      ];
    }
    if (role === "client") {
      return [
        { href: "/calculator/client",         label: "Bag",       short: "Bag" },
        { href: "/calculator/client/box",     label: "Box",       short: "Box" },
        { href: "/calculator/client/cup",     label: "Cup",       short: "Cup" },
        { href: "/calculator/client/quotes",  label: "My Quotes", short: "Quotes" },
      ];
    }
    return [];
  }

  if (active === "factoryos") {
    const role = session?.modules?.factoryos;
    if (role === "customer") {
      return [
        { href: "/factoryos/customer",          label: "My Orders",      short: "Orders"   },
        { href: "/factoryos/customer/pos",      label: "Purchase Orders", short: "POs"     },
        { href: "/factoryos/customer/profile",  label: "Profile",        short: "Profile"  },
      ];
    }
    const internal = role === "admin" || role === "account_manager" || role === "factory_manager" || role === "factory_executive";
    const adminish = role === "admin" || role === "factory_manager";
    const tabs = [];
    if (internal) {
      tabs.push({ href: "/factoryos/manager",      label: "Jobs",         short: "Jobs" });
      tabs.push({ href: "/factoryos/manager/pos",  label: "Customer POs", short: "POs"  });
    }
    if (adminish) {
      tabs.push({ href: "/factoryos/admin",                  label: "Admin",      short: "Admin" });
      tabs.push({ href: "/factoryos/admin/hr/attendance",    label: "Attendance", short: "Attn"  });
    }
    return tabs;
  }

  if (active === "rate_cards") {
    const role = session?.modules?.rate_cards;
    if (role === "admin") {
      return [
        { href: "/rate-cards",            label: "All Cards",   short: "All"    },
        { href: "/rate-cards/admin/new",  label: "+ New Card",  short: "New"    },
      ];
    }
    if (role === "client") {
      return [
        { href: "/rate-cards", label: "My Rate Cards", short: "Cards" },
      ];
    }
    return [];
  }

  if (active === "catalogue") {
    // Show a Manage tab for Admin / Factory Manager / Factory Executive /
    // Account Manager. Everyone else just sees the catalogue.
    const role = session?.modules?.factoryos;
    const canEdit =
      role === "admin" ||
      role === "factory_manager" ||
      role === "factory_executive" ||
      role === "account_manager";
    if (canEdit || session?.isAdmin) {
      return [
        { href: "/catalog",         label: "Catalogue", short: "Browse" },
        { href: "/catalog/manage",  label: "Manage",    short: "Manage" },
      ];
    }
    return [];
  }

  if (active === "clearance") {
    // Show a Manage tab for anyone with manage access. The base /clearance
    // tab is implicit (home of the module).
    const role = session?.modules?.factoryos;
    const adminish = role === "admin" || role === "factory_manager" || role === "factory_executive";
    if (adminish || session?.isAdmin) {
      return [
        { href: "/clearance",         label: "Stock",  short: "Stock"  },
        { href: "/clearance/manage",  label: "Manage", short: "Manage" },
      ];
    }
    return [];
  }

  return [];
}

export default function AppHeader({ session }) {
  const router = useRouter();
  const pathname = usePathname();
  const active = activeModuleKey(pathname);
  const modules = session?.modules || {};
  const available = MODULES.filter((m) => !!modules[m.key]);
  const subTabs = subTabsFor(pathname, session);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  // Brand link routes authed users to their module picker (`/hub`); anon
  // visitors (only see this header on /clearance) go to the public landing.
  const brandHref = session ? "/hub" : "/";

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-ink-200">
      {/* Row 1 — brand, module nav (desktop), identity / hamburger */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
        <Link
          href={brandHref}
          className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded"
          aria-label="Aeros — home"
        >
          <Brand size="sm" />
        </Link>

        {/* Desktop module nav — underline-on-active. Hidden on mobile; the
            hamburger sheet carries the same links. */}
        {available.length > 0 && (
          <nav className="hidden md:flex items-center gap-6 flex-1 justify-center">
            {available.map((m) => {
              const isActive = active === m.key;
              return (
                <Link
                  key={m.key}
                  href={m.href}
                  className={`text-sm transition-colors py-1 border-b-2 -mb-px ${
                    isActive
                      ? "text-ink-900 border-ink-900 font-medium"
                      : "text-ink-600 border-transparent hover:text-ink-900"
                  }`}
                >
                  {m.label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right cluster — identity (desktop) / hamburger (mobile). */}
        <div className="shrink-0 flex items-center gap-2">
          <div className="hidden md:block">
            <IdentityMenu session={session} onSignOut={logout} />
          </div>
          <div className="md:hidden">
            <MobileNav
              modules={available}
              activeKey={active}
              currentPath={pathname}
              session={session}
              onSignOut={logout}
            />
          </div>
        </div>
      </div>

      {/* Row 2 — module sub-tabs, inline on all viewports. The horizontal
          scroll is masked by a right-edge fade so the row remains editorial
          rather than utilitarian. */}
      {subTabs.length > 0 && (
        <div className="border-t border-ink-200 bg-ink-50/50">
          <div className="max-w-7xl mx-auto px-4 md:px-6 relative">
            <div className="flex gap-5 overflow-x-auto no-scrollbar h-10 items-stretch">
              {subTabs.map((t) => {
                const isActive = pathname === t.href;
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`shrink-0 whitespace-nowrap text-sm flex items-center border-b-2 -mb-px transition-colors ${
                      isActive
                        ? "text-ink-900 border-ink-900 font-medium"
                        : "text-ink-600 border-transparent hover:text-ink-900"
                    }`}
                  >
                    <span className="sm:hidden">{t.short || t.label}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                  </Link>
                );
              })}
            </div>
            {/* Right-edge fade — only visible when the row overflows; harmless when not. */}
            <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-ink-50/90 to-transparent" />
          </div>
        </div>
      )}
    </header>
  );
}
