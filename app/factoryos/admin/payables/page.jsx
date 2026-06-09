import { redirect } from "next/navigation";
import { getSession, requireInternal } from "@/lib/auth/session";
import { listPayables } from "@/lib/factoryos/repo";
import PayablesView from "./PayablesView";

export const dynamic = "force-dynamic";

export default async function PayablesPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/factoryos");

  const invoices = await listPayables();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PayablesView initialInvoices={invoices} />
      </main>
    </div>
  );
}
