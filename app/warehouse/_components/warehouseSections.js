// Sidebar section config for WarehouseOS — filtered per session so the
// nav only surfaces things the user can actually click. Anonymous
// visitors don't see the shell at all (layout decides via the same
// session helpers); CMs (AM) only need the dispatch tools, so they
// don't see Inventory links that would 403.

import { canManageInventory } from "@/lib/warehouse/inventory";
import { canManageClearance } from "@/lib/clearance/admin";
import { canManageVehicleDispatch } from "@/lib/warehouse/vehicleDispatches";

export function warehouseSections(session) {
  const canInventory = canManageInventory(session);
  const canClearance = canManageClearance(session);
  const canVehicle   = canManageVehicleDispatch(session);

  const sections = [
    {
      label: "Hub",
      items: [{ href: "/warehouse", label: "Overview", exact: true }],
    },
  ];

  // The public clearance stock site was removed on 18-Nov-2026.
  // canManageClearance is still the WarehouseOS staff check.

  // Handover from FactoryOS (ready jobs → warehouse). Staff only.
  if (canClearance) {
    sections.push({
      label: "Dispatch",
      items: [
        { href: "/warehouse/invoices", label: "Invoices to load", exact: true },
        { href: "/warehouse/dispatch", label: "Ready to go and in transit", exact: true },
      ],
    });
  }

  if (canInventory) {
    sections.push({
      label: "Inventory",
      items: [
        { href: "/warehouse/inventory",           label: "Stock position", exact: true },
        { href: "/warehouse/inventory/items",     label: "Items master" },
        { href: "/warehouse/inventory/import",    label: "Import opening stock" },
        { href: "/warehouse/inventory/inward",    label: "Inward" },
        { href: "/warehouse/inventory/outward",   label: "Outward" },
        { href: "/warehouse/inventory/movements", label: "Movement history" },
        { href: "/warehouse/inventory/audits",    label: "Stock audits" },
      ],
    });
  }

  // The manifest generator is its own tab, not a vehicle-dispatch sub-page: a
  // dispatch is a single-customer freight log, and plenty of trucks carry
  // invoices for several customers at once.
  if (canVehicle) {
    sections.push({
      label: "Manifest Generator",
      items: [
        { href: "/warehouse/manifests",     label: "Manifests", exact: true },
        { href: "/warehouse/manifests/new", label: "New manifest" },
      ],
    });
    sections.push({
      label: "Vehicle Dispatch",
      items: [
        { href: "/warehouse/vehicle-dispatch",     label: "Log", exact: true },
        { href: "/warehouse/vehicle-dispatch/new", label: "New dispatch" },
      ],
    });
  }

  return sections;
}
