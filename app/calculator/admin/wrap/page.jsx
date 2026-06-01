import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import WrapPaperCalculator from "@/app/calculator/_components/WrapPaperCalculator";

export default function AdminWrapPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");
  if (role !== "admin") redirect("/calculator/client/wrap");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-6xl mx-auto px-4 pb-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Wrap Paper Calculator</h1>
        <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">Flat food-wrap sheets — paper pulled from Master (Pudumjee / BILT), Flexo or Offset, full cost breakdown and quantity ladder.</p>
        <WrapPaperCalculator scope="admin" />
      </div>
    </div>
  );
}
