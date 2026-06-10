import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireAdminStrict } from "@/lib/auth/session";
import { listMasterPapers } from "@/lib/paper-rm";
import MasterPapersAdmin from "./MasterPapersAdmin";

export const dynamic = "force-dynamic";

export default async function AdminMasterPapersPage() {
  const session = getSession();
  if (!session) redirect("/login");
  // Strictly admin — not FM/FE/Customer. Master rates feed COGS, too sensitive
  // for shop-floor. requireAdminStrict checks the hub-level isAdmin flag,
  // which today is only granted via the password admin login (see
  // app/api/auth/admin/route.js + lib/hub/users.js#adminEntitlements).
  if (!requireAdminStrict(session)) redirect("/factoryos");

  const masterPapers = await listMasterPapers().catch((e) => {
    console.error("Master paper fetch failed:", e);
    return [];
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Master RM Rates</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Edit base rate and supplier discount for each master paper SKU. Reads
          and writes go to the Supabase <code className="font-mono text-xs">master_papers</code> table.
          Admin only. All other master fields (name, type, GSM, BF, supplier, specs)
          are edited directly in Supabase for now.
        </p>
        <MasterPapersAdmin initialPapers={masterPapers} />
      </main>
    </div>
  );
}
