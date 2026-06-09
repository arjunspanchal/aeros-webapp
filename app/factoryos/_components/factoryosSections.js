// Sidebar section config for FactoryOS staff (FE/FM/AM/Admin).
// Customers don't see this — the layout doesn't render the shell for them.
//
// Visibility rules layered into the section build:
//   - "Daily" group: all internal staff (jobs, POs, customer directory).
//     "+ New job" + read-only customer directory promoted here so account
//     managers — who are sales-side and need the New-Job action plus
//     customer lookups every day — get them at first-rail depth instead
//     of having to know the admin URLs. Layout audit W2 + D3.
//   - "Admin" group (Dashboard, Production runs, RM, Coating, Machines,
//     Vendors, Users): factory_manager / admin only.
//   - "Master RM rates": admin only (rates feed COGS).

import { ROLES } from "@/lib/factoryos/constants";

export function buildFactoryosSections(role, isAdminCookie = false) {
  const isAdmin   = isAdminCookie || role === ROLES.ADMIN;
  const isFM      = role === ROLES.FACTORY_MANAGER;
  const isFE      = role === ROLES.FACTORY_EXECUTIVE;
  const isAM      = role === ROLES.ACCOUNT_MANAGER;
  const adminish  = isAdmin || isFM;
  const internal  = isAdmin || isFM || isFE || isAM;
  // Roles allowed to create jobs (matches /api/factoryos/jobs POST policy
  // and the middleware carve-out for /factoryos/admin/jobs/new — admin/FM/AM,
  // FE excluded because shop floor doesn't open new jobs).
  const canCreateJob = isAdmin || isFM || isAM;
  if (!internal) return [];

  const sections = [];

  // Daily — every internal staff sees jobs + customer POs.
  // "+ New job" surfaces for admin/FM/AM (everyone authorised to create one).
  // "Customers" surfaces for admin/FM/AM too — read-only directory at
  // /factoryos/manager/customers, scoped server-side: AMs see only their
  // assigned customers, admin/FM see all.
  // FE excluded from both — shop floor doesn't open jobs or look up customers.
  const dailyItems = [
    { href: "/factoryos/manager",     label: "Jobs",         exact: false },
  ];
  if (canCreateJob) {
    dailyItems.push({ href: "/factoryos/admin/jobs/new", label: "+ New job", exact: true });
  }
  dailyItems.push({ href: "/factoryos/manager/pos", label: "Customer POs", exact: false });
  if (canCreateJob) {
    dailyItems.push({ href: "/factoryos/manager/customers", label: "Customers", exact: false });
  }
  sections.push({ label: "Daily", items: dailyItems });

  // Admin tree — FM + Admin only. "+ New job" is duplicated below into the
  // historical admin position so admin/FM keep a familiar place to find it
  // (sidebar shows the Daily one too, but no harm having both — both link
  // to the same route).
  if (adminish) {
    sections.push({
      label: "Admin",
      items: [
        { href: "/factoryos/admin",          label: "Dashboard", exact: true },
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
