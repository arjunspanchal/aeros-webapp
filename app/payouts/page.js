import { redirect } from "next/navigation";
import { getSession, hasModule } from "@/lib/auth/session";
import { listPayouts, listPayoutVendors } from "@/lib/payouts/repo";
import PayoutsClient from "./PayoutsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Payouts · Aeros",
  description: "Vendor payouts — amounts, due dates, calendar and weekly summary.",
};

export default async function PayoutsPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!hasModule(session, "payouts")) redirect("/hub");

  const [payouts, vendors] = await Promise.all([
    listPayouts().catch(() => []),
    listPayoutVendors().catch(() => []),
  ]);

  return (
    <PayoutsClient
      initialPayouts={payouts}
      initialVendors={vendors}
      currentEmail={session.email || ""}
    />
  );
}
