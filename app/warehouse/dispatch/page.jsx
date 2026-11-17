import { redirect } from "next/navigation";
import { getSession, requireInternal } from "@/lib/auth/session";
import { dispatchQueue, roleOf } from "@/lib/factoryos/transitions";
import DispatchQueueClient from "./DispatchQueueClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dispatch — WarehouseOS" };

// The warehouse's working screen: what the factory has handed over and is
// waiting to go, and what has left but is not confirmed delivered.
export default async function DispatchQueuePage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/warehouse");
  const role = roleOf(session);
  const { ready, inTransit } = await dispatchQueue();
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <DispatchQueueClient
        ready={ready}
        inTransit={inTransit}
        canDispatch={role === "admin" || role === "warehouse"}
        canDeliver={role === "admin" || role === "warehouse" || role === "account_manager"}
      />
    </main>
  );
}
