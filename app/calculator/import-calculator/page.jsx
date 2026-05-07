import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isInternalRole } from "@/lib/factoryos/constants";
import ImportCalc from "./ImportCalc";

export const dynamic = "force-dynamic";

// The Calculators namespace is gated by the calc session at the middleware
// layer; on top of that, the import calculator is internal-only (Aeros team
// uses it for landed-cost quoting). We confirm the user has an internal
// FactoryOS role before rendering. If they don't, send them back to the
// Calculators picker.
export default function ImportCalculatorPage() {
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
          Import Calculator (China → India)
        </h1>
        <p className="text-sm text-gray-500 mt-1 mb-6 dark:text-gray-400">
          Per-unit landed cost using the Aeros quotation breakdown — FOB, ocean freight,
          import duty + GST, inland transport, unofficial clearance, handling. Add a margin
          and output GST to get the final selling price. Numbers are estimates; verify with
          your CHA before quoting.
        </p>
        <ImportCalc />
      </div>
    </div>
  );
}
