import { redirect } from "next/navigation";
import { getSession, requireInternal } from "@/lib/auth/session";
import { closeoutLists, canMarkDelivered, canCloseOld } from "@/lib/factoryos/closeout";
import CloseoutClient from "./CloseoutClient";

export const metadata = { title: "Mark delivered — FactoryOS" };

export const dynamic = "force-dynamic";

// Closing the dispatch loop (Arjun, 20-Nov-2026): tick several dispatched jobs
// delivered at once, and see what is still waiting at Ready for Dispatch.
export default async function CloseoutPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/factoryos");

  const data = await closeoutLists();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <CloseoutClient data={data} canDeliver={canMarkDelivered(session)} canCloseOld={canCloseOld(session)} />
    </main>
  );
}
