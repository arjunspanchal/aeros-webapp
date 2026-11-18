// Sidebar section config for FactoryOS staff (FE/FM/AM/Admin).
// Customers don't see this — the layout doesn't render the shell for them.
//
// Visibility rules layered into the section build:
//   - "Daily" + "Resources" + "HR" overview: all staff
//   - "Admin" group (Dashboard, New job, Production runs, RM, Coating,
//     Machines, Vendors, Users): factory_manager / admin only
//     (account_manager + factory_executive don't get admin-tree access)
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

  // Daily — every internal staff sees jobs + customer POs.
  sections.push({
    label: "Daily",
    items: [
      { href: "/factoryos/manager",     label: "Jobs",          exact: false },
      { href: "/factoryos/delivery/calendar", label: "Production Calendar", exact: true },
      { href: "/factoryos/manager/pos", label: "Customer POs",  exact: false },
      { href: "/factoryos/how-to",      label: "How to use",    exact: true },
      // Chat assistant — raises / changes jobs, so the same audience as + New job.
      ...(adminish ? [{ href: "/factoryos/assistant", label: "Assistant", exact: true }] : []),
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
      ...(isAM ? [] : [{ href: "/factoryos/warehouse/stock", label: "Stock" }]),
    ],
  };
  // The warehouse team sees their own unit first.
  if (isWH) sections.unshift(warehouse);
  else sections.push(warehouse);

  // QC — documents that go out with the goods. COA first; factory managers
  // write them, the rest of the team can open and print.
  sections.push({
    label: "QC",
    items: [
      { href: "/factoryos/qc", label: "COA generator", exact: false },
    ],
  });

  // Admin tree — FM + Admin only.
  if (adminish) {
    sections.push({
      label: "Admin",
      items: [
        { href: "/factoryos/admin",          label: "Dashboard", exact: true },
        { href: "/factoryos/admin/jobs/new", label: "+ New job", exact: true },
        { href: "/factoryos/admin/runs",     label: "Production runs" },
        { href: "/factoryos/admin/zoho-check", label: "Zoho check" },
      ],
    });
    sections.push({
      label: "Inventory & RM",
      items: [
        { href: "/factoryos/admin/inventory", label: "RM inventory" },
      ],
    });
    // HR is now its own top-level module (/hr), gated by the independent `hr`
    // entitlement — no longer part of the FactoryOS sidebar.
    sections.push({
      label: "Resources",
      items: [
        { href: "/factoryos/admin/clients",  label: "Customers" },
        { href: "/factoryos/admin/vendors",  label: "Vendors" },
        { href: "/factoryos/admin/machines", label: "Machines" },
        // User management moved to /admin/access (hub-level) — covers
        // roles + pricing + client links in one editor.
        ...(isAdmin ? [{ href: "/admin/access", label: "User Access" }] : []),
      ],
    });
  }

  return sections;
}
