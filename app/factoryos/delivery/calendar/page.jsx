import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listDeliveryLines } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import DeliveryCalendarClient from "./DeliveryCalendarClient";

export const dynamic = "force-dynamic";

// Month calendar of production ready dates. Internal staff only, same gate as
// the Delivery Plan board. A job lands on the day its goods are due to be
// ready at the factory — the only date FactoryOS tracks (17-Nov-2026).
export default async function DeliveryCalendarPage() {
  const session = getSession();
  const role = session?.isAdmin ? ROLES.ADMIN : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.VENDOR) redirect("/factoryos/vendor");

  const lines = await listDeliveryLines({
    role,
    userId: session.factoryosUserId,
    clientIds: session.factoryosClientIds || [],
  });

  // Only what the calendar draws — no rates or values go to the browser.
  const jobs = lines.map((l) => ({
    jobId: l.jobId,
    jNumber: l.jNumber,
    clientName: l.clientName,
    brand: l.brand,
    poNumber: l.poNumber,
    item: l.item,
    sku: l.sku,
    ordered: l.ordered,
    balance: l.balance,
    stage: l.stage,
    urgent: l.urgent,
    deliveryStatus: l.deliveryStatus,
    productionDueDate: l.productionDueDate,
  }));

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <DeliveryCalendarClient jobs={jobs} />
    </main>
  );
}
