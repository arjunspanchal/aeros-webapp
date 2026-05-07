import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import ClientsAdmin from "./ClientsAdmin";

export default function AdminClientsPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.calculator;
  if (!session || !role) redirect("/login");
  if (role !== "admin") redirect("/calculator/client");
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 pb-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Clients</h1>
        <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">Registered client accounts. Margin % is what each client sees added to manufacturing cost.</p>
        <ClientsAdmin />
      </div>
    </div>
  );
}
