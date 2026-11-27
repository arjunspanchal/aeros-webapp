import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canUseV2, seesWorking } from "@/lib/calc-v2/server";
import QuoteStudio from "./QuoteStudio";

export const metadata = { title: "Quote calculator · Aeros" };

// The quote calculator, for our own team. Admins see the full working; staff
// see the selling price only (the server never sends them a cost).
export default function CalculatorV2Page({ searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canUseV2(session)) redirect("/calculator");
  return (
    <div className="min-h-screen bg-ink-50">
      {/* ?quote=CALC-… reopens a saved quote */}
      <QuoteStudio openRef={typeof searchParams?.quote === "string" ? searchParams.quote : ""} staff={!seesWorking(session)} />
    </div>
  );
}
