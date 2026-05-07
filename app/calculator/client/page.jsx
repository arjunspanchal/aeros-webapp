import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import ClientCalculator from "./ClientCalculator";

export default function ClientPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");
  if (role !== "client") redirect("/calculator/admin");
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 pb-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Rate Calculator</h1>
        <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">Enter your bag specs below. Rates shown are final, quoted per bag.</p>
        <ClientCalculator />
      </div>
    </div>
  );
}
