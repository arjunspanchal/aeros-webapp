import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { listMasterPapers } from "@/lib/paper-rm";
import ClientBoxCalculator from "./ClientBoxCalculator";

export default async function ClientBoxPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");
  if (role !== "client" && role !== "admin") redirect("/calculator/admin/box");

  let papers = [];
  try { papers = await listMasterPapers(); } catch { /* Paper RM env may be unset — picker falls back to manual */ }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 pb-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Custom Box Calculator</h1>
        <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">Enter your box specs below. Rates shown are final, quoted per box.</p>
        <ClientBoxCalculator papers={papers} />
      </div>
    </div>
  );
}
