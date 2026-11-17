import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listDeliveryLines } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import DeliveryCalendarClient from "./DeliveryCalendarClient";

export const dynamic = "force-dynamic";

// Month calendar of committed dates. Internal staff only, same gate as the
// Delivery Plan board. A job lands on a day by its Estimated delivery date
// (the date committed to the customer); the toggle switches to Expected
// dispatch. Committed dispatch-schedule rows also show, on their own date.
export default async function DeliveryCalendarPage() {
  const session = getSession();
  const role = session?.isAdmin ? ROLES.ADMIN : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role === ROLES.CUSTOMER) redirect("/factoryos/customer");
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
    estimatedDeliveryDate: l.estimatedDeliveryDate,
    expectedDispatchDate: l.expectedDispatchDate,
    schedule: (l.schedule || []).map((s) => ({ id: s.id, dispatchDate: s.dispatchDate, qty: s.qty, status: s.status })),
  }));

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <DeliveryCalendarClient jobs={jobs} />
    </main>
  );
}
