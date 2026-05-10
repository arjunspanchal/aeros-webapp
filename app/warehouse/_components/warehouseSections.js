// Sidebar section config for WarehouseOS — filtered per session so the
// nav only surfaces things the user can actually click. Anonymous
// visitors don't see the shell at all (layout decides via the same
// session helpers); CMs (AM) only need the dispatch tools, so they
// don't see Inventory links that would 403.

import { canManageInventory } from "@/lib/warehouse/inventory";
import { canManageClearance } from "@/lib/clearance/admin";
import { canManageSampleDispatch } from "@/lib/warehouse/sampleDispatches";

export function warehouseSections(session) {
  const canInventory = canManageInventory(session);
  const canClearance = canManageClearance(session);
  const canDispatch  = canManageSampleDispatch(session);

  const sections = [
    {
      label: "Hub",
      items: [{ href: "/warehouse", label: "Overview", exact: true }],
    },
  ];

  // Clearance: public stock is open to anyone with the shell; Manage gates on FM/FE/Admin.
  const clearanceItems = [
    { href: "/warehouse/clearance", label: "Public stock", exact: true },
  ];
  if (canClearance) clearanceItems.push({ href: "/warehouse/clearance/manage", label: "Manage stock" });
  sections.push({ label: "Clearance", items: clearanceItems });

  if (canInventory) {
    sections.push({
      label: "Inventory",
      items: [
        { href: "/warehouse/inventory",           label: "Stock position", exact: true },
        { href: "/warehouse/inventory/items",     label: "Items master" },
        { href: "/warehouse/inventory/inward",    label: "Inward" },
        { href: "/warehouse/inventory/outward",   label: "Outward" },
        { href: "/warehouse/inventory/movements", label: "Movement history" },
        { href: "/warehouse/inventory/audits",    label: "Stock audits" },
      ],
    });
  }

  if (canDispatch) {
    sections.push({
      label: "Sample Dispatch",
      items: [
        { href: "/warehouse/sample-dispatch",     label: "Queue", exact: true },
        { href: "/warehouse/sample-dispatch/new", label: "New dispatch" },
        { href: "/warehouse/sample-kits",         label: "Sample kits" },
      ],
    });
  }

  return sections;
}
