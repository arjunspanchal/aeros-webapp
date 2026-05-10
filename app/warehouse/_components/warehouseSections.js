// Sidebar section config for WarehouseOS staff (FE/FM/Admin).
// Anonymous visitors don't see the shell — the layout decides via
// canManageInventory(session) whether to mount it. Public-only visitors
// browsing /warehouse/clearance see the page flush, no sidebar.

export const WAREHOUSE_SECTIONS = [
  {
    label: "Hub",
    items: [{ href: "/warehouse", label: "Overview", exact: true }],
  },
  {
    label: "Clearance",
    items: [
      { href: "/warehouse/clearance",        label: "Public stock", exact: true },
      { href: "/warehouse/clearance/manage", label: "Manage stock" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/warehouse/inventory",           label: "Stock position", exact: true },
      { href: "/warehouse/inventory/items",     label: "Items master" },
      { href: "/warehouse/inventory/inward",    label: "Inward" },
      { href: "/warehouse/inventory/outward",   label: "Outward" },
      { href: "/warehouse/inventory/movements", label: "Movement history" },
      { href: "/warehouse/inventory/audits",    label: "Stock audits" },
    ],
  },
  {
    label: "Sample Dispatch",
    items: [
      { href: "/warehouse/sample-dispatch",     label: "Queue", exact: true },
      { href: "/warehouse/sample-dispatch/new", label: "New dispatch" },
    ],
  },
];
