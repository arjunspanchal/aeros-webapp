import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isInternalRole } from "@/lib/factoryos/constants";
import ExpressShipCalc from "./ExpressShipCalc";

export const dynamic = "force-dynamic";

// Express Ship Calculator — internal-only landed-price quoting tool for the
// DHL Express air lane from India / China into the US. Mirrors the gate
// pattern used by the China→India Import Calculator.
export default function ExpressShipPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");
  if (!isInternalRole(session.modules?.factoryos)) redirect("/calculator");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 pb-10">
        <Link
          href="/calculator"
          className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400"
        >
          ← Calculators
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">
          Express Ship Calculator (India / China → USA)
        </h1>
        <p className="text-sm text-gray-500 mt-1 mb-6 dark:text-gray-400">
          Per-unit landed price for DHL Express air shipments — product cost, freight on chargeable
          weight, US duty (MFN + Section 301 + Section 122), MPF, and margin. Pick an SKU from the
          master, enter the DHL rate of the day, and choose by-pieces or by-pallets.
        </p>
        <ExpressShipCalc />
      </div>
    </div>
  );
}
