// Sidebar section config for FactoryOS staff (FE/FM/AM/Admin).
// Customers don't see this — the layout doesn't render the shell for them.
//
// Visibility rules layered into the section build:
//   - "Daily" + "Resources" + "HR" overview: all staff
//   - "Admin" group (Dashboard, New job, Production runs, RM, Coating,
//     Machines, Vendors, Users): factory_manager / admin only
//     (account_manager + factory_executive don't get admin-tree access)
//   - "Master RM rates": admin only (rates feed COGS)

import { ROLES } from "@/lib/factoryos/constants";

export function buildFactoryosSections(role, isAdminCookie = false) {
  const isAdmin   = isAdminCookie || role === ROLES.ADMIN;
  const isFM      = role === ROLES.FACTORY_MANAGER;
  const isFE      = role === ROLES.FACTORY_EXECUTIVE;
  const isAM      = role === ROLES.ACCOUNT_MANAGER;
  const adminish  = isAdmin || isFM;
  const internal  = isAdmin || isFM || isFE || isAM;
  if (!internal) return [];

  const sections = [];

  // Daily — every internal staff sees jobs + customer POs.
  sections.push({
    label: "Daily",
    items: [
      { href: "/factoryos/manager",     label: "Jobs",         exact: false },
      { href: "/factoryos/inbox",       label: "Inbox",        exact: false },
      { href: "/factoryos/manager/pos", label: "Customer POs", exact: false },
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
      ],
    });
    sections.push({
      label: "Inventory & RM",
      items: [
        { href: "/factoryos/admin/inventory", label: "RM inventory" },
        ...(isAdmin
          ? [{ href: "/factoryos/admin/master-papers", label: "Master RM rates" }]
          : []),
        { href: "/factoryos/admin/coating", label: "PE coating" },
      ],
    });
    // HR is now its own top-level module (/hr), gated by the independent `hr`
    // entitlement — no longer part of the FactoryOS sidebar.
    sections.push({
      label: "Resources",
      items: [
        { href: "/factoryos/admin/clients",  label: "Customers" },
        { href: "/factoryos/admin/vendors",  label: "Vendors" },
        { href: "/factoryos/admin/payables", label: "Vendor payables" },
        { href: "/factoryos/admin/machines", label: "Machines" },
        // User management moved to /admin/access (hub-level) — covers
        // roles + pricing + client links in one editor.
        { href: "/admin/access",             label: "User Access" },
      ],
    });
  }

  return sections;
}
