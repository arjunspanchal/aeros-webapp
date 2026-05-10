// WarehouseOS shared layout — wraps every /warehouse/* route.
// Mounts AppHeader + ModuleShell (sidebar for staff) + Footer.
// The sidebar only renders for staff (FE/FM/Admin) — anonymous
// visitors browsing /warehouse/clearance see the page flush, no
// sidebar chrome.
//
// Each /warehouse/* page returns just its inner content; this layout
// owns the chrome.

import { getSession } from "@/lib/hub/session";
import { canManageInventory } from "@/lib/warehouse/inventory";
import { canManageSampleDispatch } from "@/lib/warehouse/sampleDispatches";
import AppHeader from "@/app/components/AppHeader";
import Footer from "@/app/components/Footer";
import ModuleShell from "@/app/_components/ModuleShell";
import ModuleSidebar from "@/app/_components/ModuleSidebar";
import { WAREHOUSE_SECTIONS } from "./_components/warehouseSections";

export default function WarehouseLayout({ children }) {
  const session = getSession();
  // Show the staff shell to anyone who can access *something* internal —
  // FE/FM/Admin (inventory) plus AMs (sample dispatch). Everyone else
  // (anonymous, customer) gets the flush page for /warehouse/clearance.
  const showShell = canManageInventory(session) || canManageSampleDispatch(session);

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-gray-950">
      <AppHeader session={session} />
      {showShell ? (
        <ModuleShell
          label="WarehouseOS"
          sidebar={<ModuleSidebar sections={WAREHOUSE_SECTIONS} ariaLabel="WarehouseOS sections" />}
        >
          {children}
        </ModuleShell>
      ) : (
        <main className="flex-1">{children}</main>
      )}
      <Footer />
    </div>
  );
}
