import { getSession } from "@/lib/hub/session";
import { canConfirmDelivery } from "@/lib/warehouse/access";
import { transitQueue } from "@/lib/warehouse/outward";
import TransitClient from "./TransitClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "In transit — Warehouse" };

// What has left and is not yet confirmed delivered.
export default async function TransitPage() {
  const session = getSession();
  const data = await transitQueue();
  return <TransitClient data={data} canDeliver={canConfirmDelivery(session)} />;
}
