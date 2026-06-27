import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  listDeliveryLines,
  isOpenDeliveryLine,
  ageingBuckets,
  buildDispatchMatrix,
} from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import DeliveryBoardClient from "./DeliveryBoardClient";

export const dynamic = "force-dynamic";

// Team scheduling board — every open PO line (a job) with ageing, balance and
// committed dispatch dates. Internal staff only. The internal commitment plan.
export default async function DeliveryBoardPage() {
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

  const openLines = lines.filter(isOpenDeliveryLine);
  const ageing = ageingBuckets(openLines);
  const dateCols = Array.from(
    new Set(openLines.flatMap((l) => (l.schedule || []).map((s) => s.dispatchDate))),
  ).sort();
  const matrix = buildDispatchMatrix(openLines, dateCols);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <DeliveryBoardClient lines={lines} ageing={ageing} matrix={matrix} />
    </main>
  );
}
