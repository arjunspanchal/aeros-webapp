import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listDeliveryLines } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import { getActiveClientId } from "@/lib/factoryos/customerScope";
import CustomerDeliveryClient from "./CustomerDeliveryClient";

export const dynamic = "force-dynamic";

// Customer-facing delivery plan — per-PO date-wise committed dispatch schedule.
// The customer view of the same data the team schedules on /factoryos/delivery.
export default async function CustomerDeliveryPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  const linkedIds = session.factoryosClientIds || [];
  const activeClientId = getActiveClientId(linkedIds);

  const lines = await listDeliveryLines({
    role: ROLES.CUSTOMER,
    userId: session.factoryosUserId,
    clientIds: activeClientId ? [activeClientId] : linkedIds,
  });

  // Show lines that are open, cancelled (so the customer sees the note), or
  // already have a committed schedule. Hide fully-closed lines with nothing.
  const shown = lines.filter(
    (l) => l.balance > 0 || l.deliveryStatus === "cancelled" || (l.schedule || []).length > 0,
  );

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <CustomerDeliveryClient lines={shown} />
    </main>
  );
}
