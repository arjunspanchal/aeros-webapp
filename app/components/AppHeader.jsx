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
  { key: "rate_cards",  label: "RFQs",        href: "/rfq-manager" },
  { key: "factoryos",   label: "FactoryOS",   href: "/factoryos"   },
  { key: "hr",          label: "HR",          href: "/hr"          },
  { key: "catalogue",   label: "Catalogue",   href: "/catalog"     },
  { key: "clearance",   label: "WarehouseOS", href: "/warehouse"   },
];

function activeModuleKey(pathname) {
  if (pathname.startsWith("/calculator")) return "calculator";
  if (pathname.startsWith("/rate-cards")) return "rate_cards";
  if (pathname.startsWith("/rfq-manager")) return "rate_cards";
  if (pathname.startsWith("/factoryos"))  return "factoryos";
  if (pathname.startsWith("/hr"))         return "hr";
  if (pathname.startsWith("/catalog"))    return "catalogue";
  if (pathname.startsWith("/warehouse"))  return "clearance";
  if (pathname.startsWith("/clearance"))  return "clearance";
  // Match /design and /design/... but NOT /design-system (the internal
  // brand-tokens QA page, which intentionally has no nav highlight).
  if (pathname === "/design" || pathname.startsWith("/design/")) return "design";
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
      // Client / pricing management moved to /admin/access (hub-level
      // editor that also handles factoryos roles + linked clients).
      //
      // Calc-PR-D: surfaces Container Stuffing, Express Ship, and Import
      // Calculator as first-class sub-tabs. Previously only reachable from
      // the /calculator landing — once on an admin product page (Bag/Box/
      // Cup/PP) the user had to full-page-redirect via the landing to
      // switch to one of these. All three already had pages + saved-quotes
      // APIs; they were just missing from the nav.
      return [
        { href: "/calculator/admin",                label: "Bag",       short: "Bag" },
        { href: "/calculator/admin/box",            label: "Box",       short: "Box" },
        { href: "/calculator/admin/cup",            label: "Cup",       short: "Cup" },
        { href: "/calculator/admin/wrap",           label: "Wrap",      short: "Wrap" },
        { href: "/calculator/admin/pp",             label: "PP",        short: "PP" },
        { href: "/calculator/container-stuffing",   label: "Stuffing",  short: "Stuff" },
        { href: "/calculator/express-ship",         label: "Express",   short: "Exp" },
        { href: "/calculator/import-calculator",    label: "Import",    short: "Imp" },
        { href: "/calculator/admin/history",        label: "History",   short: "History" },
        { href: "/calculator/admin/rates",          label: "Rates",     short: "Rates" },
      ];
    }
    if (role === "client") {
      // Clients don't see Stuffing / Express / Import — those are internal-
      // only surfaces (gated server-side via isInternalRole). Container
      // Stuffing has no role gate but it's a logistics tool for the team,
      // not customer-facing — kept off the client nav for clarity.
      return [
        { href: "/calculator/client",         label: "Bag",       short: "Bag" },
        { href: "/calculator/client/box",     label: "Box",       short: "Box" },
        { href: "/calculator/client/cup",     label: "Cup",       short: "Cup" },
        { href: "/calculator/client/wrap",    label: "Wrap",      short: "Wrap" },
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
      tabs.push({ href: "/factoryos/admin", label: "Admin", short: "Admin" });
    }
    return tabs;
  }

  if (active === "hr") {
    return [
      { href: "/hr",            label: "Overview",   short: "HR"   },
      { href: "/hr/attendance", label: "Attendance", short: "Attn" },
      { href: "/hr/calendar",   label: "Calendar",   short: "Cal"  },
      { href: "/hr/payroll",    label: "Payroll",    short: "Pay"  },
    ];
  }

  if (active === "rate_cards") {
    const role = session?.isAdmin ? "admin" : session?.modules?.rate_cards;
    if (role === "admin") {
      return [
        { href: "/rfq-manager",           label: "RFQ Manager",  short: "RFQs"   },
        { href: "/rate-cards",            label: "Rate Cards",   short: "Cards"  },
        { href: "/rate-cards/quotes",     label: "Past Quotes",  short: "Quotes" },
        { href: "/rate-cards/admin/new",  label: "+ New Card",   short: "New"    },
      ];
    }
    if (role === "client") {
      return [
        { href: "/rfq-manager",       label: "RFQ Manager",   short: "RFQs"   },
        { href: "/rate-cards",        label: "Rate Cards",    short: "Cards"  },
        { href: "/rate-cards/quotes", label: "Past Quotes",   short: "Quotes" },
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
    // WarehouseOS sub-tabs. Stock is public; Manage + Inventory are
    // FM/FE/Admin only. Sample Dispatch is open to AMs (Customer
    // Managers) too — they raise dispatches on behalf of customers.
    const role = session?.modules?.factoryos;
    const adminish    = role === "admin" || role === "factory_manager" || role === "factory_executive";
    const canDispatch = adminish || role === "account_manager" || session?.isAdmin;
    const tabs = [
      { href: "/warehouse",                    label: "Hub",       short: "Hub"   },
      { href: "/warehouse/clearance",          label: "Clearance", short: "Stock" },
    ];
    if (adminish || session?.isAdmin) {
      tabs.push({ href: "/warehouse/clearance/manage",    label: "Manage",    short: "Manage" });
      tabs.push({ href: "/warehouse/inventory",           label: "Stock",     short: "Stock"  });
      tabs.push({ href: "/warehouse/inventory/items",     label: "Items",     short: "Items"  });
      tabs.push({ href: "/warehouse/inventory/inward",    label: "Inward",    short: "In"     });
      tabs.push({ href: "/warehouse/inventory/outward",   label: "Outward",   short: "Out"    });
      tabs.push({ href: "/warehouse/inventory/movements", label: "History",   short: "Hist"   });
      tabs.push({ href: "/warehouse/inventory/audits",    label: "Audits",    short: "Audit"  });
    }
    if (canDispatch) {
      tabs.push({ href: "/warehouse/sample-dispatch",     label: "Dispatch",  short: "Disp"   });
      tabs.push({ href: "/warehouse/sample-kits",         label: "Kit Manager", short: "Kits" });
    }
    return tabs;
  }

  return [];
}

export default function AppHeader({ session }) {
  const router = useRouter();
  const pathname = usePathname();
  const active = activeModuleKey(pathname);
  const modules = session?.modules || {};
  const available = MODULES.filter((m) => !!modules[m.key]);
  // Design module is open to every authenticated user — append it to
  // the nav unconditionally if the user is signed in.
  if (session) {
    available.push({ key: "design", label: "Design", href: "/design" });
  }
  const subTabs = subTabsFor(pathname, session);

  // Modules whose desktop sub-tabs are replaced by an in-page sidebar (left
  // rail). The sub-tab row keeps rendering on mobile so narrow viewports
  // still have a discoverable nav. Add a module here once it ships a
  // ModuleShell-based sidebar in its layout.
  const factoryosRole = session?.modules?.factoryos;
  const factoryosHasSidebar =
    active === "factoryos" && factoryosRole && factoryosRole !== "customer";
  // WarehouseOS sidebar is unconditional for the active="clearance" module —
  // /warehouse/clearance is public-readable but the layout still mounts the
  // shell scaffold; the sidebar's own visibility (staff-only) is handled
  // inside the layout, not here.
  const warehouseHasSidebar = active === "clearance";
  // RFQs module — both /rate-cards and /rfq-manager mount the same sidebar
  // (RFQ Manager + Rate Cards toggle).
  const rateCardsHasSidebar = active === "rate_cards";
  // HR mounts a ModuleShell sidebar in app/hr/layout.jsx.
  const hrHasSidebar = active === "hr";
  const sidebarReplacesSubtabsOnDesktop =
    factoryosHasSidebar || warehouseHasSidebar || rateCardsHasSidebar || hrHasSidebar;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  // Brand link routes authed users to their module picker (`/hub`); anon
  // visitors (only see this header on /clearance) go to the public landing.
  // Pass href into Brand directly — wrapping it in another <Link> creates
  // nested <a> tags (invalid HTML); browsers fall through to Brand's inner
  // default href="/", which sends authed users to the marketing page and
  // looks like a logout.
  const brandHref = session ? "/hub" : "/";

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-ink-200">
      {/* Row 1 — brand, module nav (desktop), identity / hamburger */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
        <Brand size="sm" href={brandHref} className="shrink-0" />

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
          rather than utilitarian.

          Sidebar exception: modules with a ModuleShell-based sidebar
          (FactoryOS for staff, WarehouseOS, others as they ship) hide
          the desktop sub-tab row since the sidebar covers the same
          ground. Mobile keeps the sub-tabs so narrow viewports have a
          discoverable nav alongside the drawer. */}
      {subTabs.length > 0 && (
        <div className={`border-t border-ink-200 bg-ink-50/50 ${sidebarReplacesSubtabsOnDesktop ? "md:hidden" : ""}`}>
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
