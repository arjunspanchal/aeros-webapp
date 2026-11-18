import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireAdminStrict } from "@/lib/auth/session";
import { listMasterPapers } from "@/lib/paper-rm";
import MasterPapersAdmin from "./MasterPapersAdmin";

export const dynamic = "force-dynamic";

// Paper rates that the bag and cup calculators read live. Moved here from
// FactoryOS on 17-Nov-2026 (Arjun: no rates in FactoryOS). Admin only.
export default async function PaperRatesPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireAdminStrict(session)) redirect("/calculator");

  const masterPapers = await listMasterPapers().catch((e) => {
    console.error("Master paper fetch failed:", e);
    return [];
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/calculator/admin/rates" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Rates</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Paper rates</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Base rate and supplier discount for each paper. The bag and cup calculators pick up a change within about 5 minutes. Admin only.
        </p>
        <MasterPapersAdmin initialPapers={masterPapers} />
      </main>
    </div>
  );
}
