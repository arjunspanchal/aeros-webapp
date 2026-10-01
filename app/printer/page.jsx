import { getSession } from "@/lib/auth/session";
import { listJobsForSession, getVendor } from "@/lib/factoryos/repo";
import { getJobOrder } from "@/lib/factoryos/jobOrder";
import { listPortalVendors } from "@/lib/factoryos/printerAuth";
import PrinterOnePager from "./PrinterOnePager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aeros — printer jobs" };

// The printer one-pager: password login, then every job currently with
// this printer, the job-order PDF, and two buttons (Printed / Dispatched).
// Deliberately one screen — Arjun, 01-Oct-2026: "very simple one pager".
export default async function PrinterPage() {
  const session = getSession();
  const isVendor = session && !session.isAdmin && session.modules?.factoryos === "vendor" && session.factoryosVendorId;

  if (!isVendor) {
    const vendors = await listPortalVendors().catch(() => []);
    return <PrinterOnePager mode="login" vendors={vendors} />;
  }

  const vendor = await getVendor(session.factoryosVendorId).catch(() => null);
  const all = await listJobsForSession({
    role: "vendor",
    vendorId: session.factoryosVendorId,
    vendorName: vendor?.name,
  });
  // Pending = still with the printer: not yet dispatched back to us and the
  // job itself hasn't moved past printing.
  const pending = all.filter((j) =>
    !["dispatched"].includes(j.vendorStatus || "") &&
    ["RM Pending", "Under Printing"].includes(j.stage));
  const recent = all.filter((j) => !pending.includes(j)).slice(0, 10);

  // Only issued job orders are shown to the printer.
  const orders = await Promise.all(
    [...pending, ...recent].map((j) => getJobOrder(j.id).then((o) => [j.id, o.spec?.status === "issued" ? o.spec.rev : null]).catch(() => [j.id, null]))
  );
  const issuedRev = Object.fromEntries(orders);
  const slim = (j) => ({
    id: j.id, jNumber: j.jNumber, item: j.item, brand: j.brand, qty: j.qty,
    printingDueDate: j.printingDueDate, vendorStatus: j.vendorStatus, stage: j.stage,
    jobOrderRev: issuedRev[j.id] ?? null, printingType: j.printingType,
  });

  return (
    <PrinterOnePager
      mode="jobs"
      vendorName={vendor?.name || session.name || "Printer"}
      pending={pending.map(slim)}
      recent={recent.map(slim)}
    />
  );
}
