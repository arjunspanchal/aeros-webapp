// Sidebar section config for FactoryOS staff (FE/FM/AM/Admin).
// Customers don't see this — the layout doesn't render the shell for them.
//
// Groups (18-Nov-2026 tidy-up, was six groups):
//   - "Work": all staff. Dashboard only for factory_manager / admin.
//   - "Warehouse": all staff (sales see no Stock); first for the warehouse team.
//   - "Manage": factory_manager / admin only.
//   - "Help": all staff; the Assistant only for factory_manager / admin.
//   - Paper rates moved to Calculator admin (17-Nov-2026): no rates in FactoryOS

import { ROLES } from "@/lib/factoryos/constants";

export function buildFactoryosSections(role, isAdminCookie = false) {
  const isAdmin   = isAdminCookie || role === ROLES.ADMIN;
  const isFM      = role === ROLES.FACTORY_MANAGER;
  const isFE      = role === ROLES.FACTORY_EXECUTIVE;
  const isAM      = role === ROLES.ACCOUNT_MANAGER;
  const isWH      = role === ROLES.WAREHOUSE;
  const adminish  = isAdmin || isFM;
  const internal  = isAdmin || isFM || isFE || isAM || isWH;
  if (!internal) return [];

  const sections = [];

  // Work — what everybody opens every day. Managers land on the Dashboard.
  sections.push({
    label: "Work",
    items: [
      ...(adminish ? [{ href: "/factoryos/admin", label: "Dashboard", exact: true }] : []),
      // The admin job page lives under /factoryos/admin/jobs/<id>; it is still "Jobs".
      { href: "/factoryos/manager", label: "Jobs", also: ["/factoryos/admin/jobs"], not: ["/factoryos/manager/pos", "/factoryos/admin/jobs/new"] },
      { href: "/factoryos/tasks", label: "Tasks" },
      // Every job sitting with a printer, printer by printer (20-Nov-2026).
      ...(isWH ? [] : [{ href: "/factoryos/printers", label: "Printer chase" }]),
      { href: "/factoryos/delivery/calendar", label: "Production Calendar", exact: true },
      { href: "/factoryos/manager/pos", label: "Customer POs" },
      // Documents that go out with the goods. Factory managers write them,
      // the rest of the team can open and print.
      { href: "/factoryos/qc", label: "COA generator" },
    ],
  });

  // Warehouse — its own unit inside FactoryOS (18-Nov-2026 rebuild): standalone
  // Inward and Outward driven by Zoho Books. The warehouse team works it;
  // factory and sales get a read-only view (lib/warehouse/access.js).
  const warehouse = {
    label: "Warehouse",
    items: [
      { href: "/factoryos/warehouse",         label: "Today",      exact: true },
      { href: "/factoryos/warehouse/inward",  label: "Inward" },
      { href: "/factoryos/warehouse/outward", label: "Outward" },
      { href: "/factoryos/warehouse/transit", label: "In transit" },
      // Tick several dispatched jobs delivered at once (20-Nov-2026).
      { href: "/factoryos/closeout", label: "Mark delivered" },
      ...(isAM ? [] : [{ href: "/factoryos/warehouse/stock", label: "Stock" }]),
    ],
  };
  // The warehouse team sees their own unit first.
  if (isWH) sections.unshift(warehouse);
  else sections.push(warehouse);

  // Manage — FM + Admin only: raising jobs, paper, checks and the lists
  // behind them. (Paper rates live in Calculator admin: no rates in FactoryOS.)
  if (adminish) {
    sections.push({
      label: "Manage",
      items: [
        { href: "/factoryos/admin/jobs/new",  label: "+ New job", exact: true },
        { href: "/factoryos/admin/runs",      label: "Production runs" },
        { href: "/factoryos/admin/inventory", label: "RM inventory" },
        { href: "/factoryos/admin/zoho-check", label: "Zoho check" },
        { href: "/factoryos/admin/clients",   label: "Customers" },
        { href: "/factoryos/admin/vendors",   label: "Vendors" },
        { href: "/factoryos/admin/machines",  label: "Machines" },
        // User management lives at /admin/access (hub-level): roles, pricing
        // and client links in one editor.
        ...(isAdmin ? [{ href: "/admin/access", label: "User Access" }] : []),
      ],
    });
  }

  sections.push({
    label: "Help",
    items: [
      { href: "/factoryos/how-to", label: "How to use", exact: true },
      // Chat assistant — raises / changes jobs, so the same audience as + New job.
      ...(adminish ? [{ href: "/factoryos/assistant", label: "Assistant", exact: true }] : []),
    ],
  });

  return sections;
}

// The few screens each role opens most, for the phone tab bar. Everything
// else is one tap away under "More".
export function buildFactoryosMobileTabs(role, isAdminCookie = false) {
  const isAdmin = isAdminCookie || role === ROLES.ADMIN;
  const jobs = { href: "/factoryos/manager", label: "Jobs", also: ["/factoryos/admin/jobs"], not: ["/factoryos/manager/pos", "/factoryos/admin/jobs/new"] };
  const tasks = { href: "/factoryos/tasks", label: "Tasks" };
  if (isAdmin) return [{ href: "/factoryos/admin", label: "Dashboard", exact: true }, jobs, tasks, { href: "/factoryos/warehouse", label: "Warehouse" }];
  if (role === ROLES.WAREHOUSE) {
    return [
      { href: "/factoryos/warehouse", label: "Today", exact: true },
      { href: "/factoryos/warehouse/inward", label: "Inward" },
      { href: "/factoryos/warehouse/outward", label: "Outward" },
      tasks,
    ];
  }
  if (role === ROLES.ACCOUNT_MANAGER) return [jobs, tasks, { href: "/factoryos/manager/pos", label: "POs" }, { href: "/factoryos/delivery/calendar", label: "Calendar", exact: true }];
  if (role === ROLES.FACTORY_MANAGER || role === ROLES.FACTORY_EXECUTIVE) {
    return [jobs, tasks, { href: "/factoryos/delivery/calendar", label: "Calendar", exact: true }, { href: "/factoryos/warehouse", label: "Warehouse" }];
  }
  return [];
}
