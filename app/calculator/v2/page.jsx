import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canUseV2 } from "@/lib/calc-v2/server";
import QuoteStudio from "./QuoteStudio";

export const metadata = { title: "Quote calculator · Aeros" };

// Calculator v2. Internal for now: calculator admins only. Clients keep the
// existing calculators until the client view is built.
export default function CalculatorV2Page() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canUseV2(session)) redirect("/calculator");
  return (
    <div className="min-h-screen bg-ink-50">
      <QuoteStudio />
    </div>
  );
}
