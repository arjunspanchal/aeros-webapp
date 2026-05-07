import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import ContainerStuffingCalc from "./ContainerStuffingCalc";

export const dynamic = "force-dynamic";

export default function ContainerStuffingPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-6xl mx-auto px-4 pb-10">
        <Link href="/calculator" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← Calculators
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 mb-1 dark:text-white">
          Container Stuffing Calculator
        </h1>
        <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">
          Plan export shipments — FCL floor stuffed, FCL pallet stuffed, or LCL by chargeable W/M. Block-stack only — no
          interlocking or pinwheel patterns. Treat as a planning ceiling; real stuffing loses 5–10% to door clearance and pallet gaps.
        </p>
        <ContainerStuffingCalc />
      </div>
    </div>
  );
}
