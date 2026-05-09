import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import ClientCupCalculator from "./ClientCupCalculator";

export default function ClientCupPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");
  if (role !== "client" && role !== "admin") redirect("/calculator/admin/cup");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-6xl mx-auto px-4 pb-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Paper Cup Calculator</h1>
        <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">Enter your cup specs below. Rate curve shows per-cup pricing across order sizes.</p>
        <ClientCupCalculator />
      </div>
    </div>
  );
}
