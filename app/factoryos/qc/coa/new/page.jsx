import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, requireManager } from "@/lib/auth/session";
import { coaDefaultsForSku, COA_PRINT_FIELDS, COA_APPROVERS } from "@/lib/factoryos/coa";
import CoaEditor from "../[id]/CoaEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "New COA — FactoryOS" };

// A COA with no job behind it — samples, stock items, orders that never
// went through FactoryOS.
export default async function NewCoaPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos/qc");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/qc" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400">← QC</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Certificate of Analysis</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Not linked to a job. Pick a product to fill the sheet, or type everything in.</p>
        <CoaEditor
          createUrl="/api/factoryos/coa"
          initial={await coaDefaultsForSku(null)}
          isNew
          canEdit
          standalone
          fields={COA_PRINT_FIELDS}
          approvers={COA_APPROVERS}
        />
      </main>
    </div>
  );
}
