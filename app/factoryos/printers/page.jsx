import { redirect } from "next/navigation";
import { getSession, requireInternal, requireManager } from "@/lib/auth/session";
import { listPrinterChase } from "@/lib/factoryos/printerChase";
import { ROLES } from "@/lib/factoryos/constants";
import PrinterChaseClient from "./PrinterChaseClient";

export const metadata = { title: "Printer chase — FactoryOS" };

export const dynamic = "force-dynamic";

// Printer chase list (Arjun, 20-Nov-2026): one screen per printer with every
// job sitting there, how late it is, and a WhatsApp message with the whole list.
export default async function PrinterChasePage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/factoryos");

  const data = await listPrinterChase();
  const role = session.isAdmin ? ROLES.ADMIN : session.modules?.factoryos;
  const canEditDates = [ROLES.ADMIN, ROLES.FACTORY_MANAGER, ROLES.FACTORY_EXECUTIVE].includes(role);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PrinterChaseClient data={data} canEditDates={canEditDates} canEditVendor={requireManager(session)} />
    </main>
  );
}
