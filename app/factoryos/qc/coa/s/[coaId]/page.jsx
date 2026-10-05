import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession, requireInternal, requireManager } from "@/lib/auth/session";
import { getStandaloneCoa, COA_FIELDS } from "@/lib/factoryos/coa";
import CoaEditor from "../../[id]/CoaEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "COA — FactoryOS" };

export default async function StandaloneCoaPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/factoryos");
  const coa = await getStandaloneCoa(params.coaId);
  if (!coa) notFound();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/qc" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400">← QC</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Certificate of Analysis</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Not linked to a job.</p>
        <CoaEditor
          coaId={coa.id}
          initial={coa}
          isNew={false}
          canEdit={requireManager(session)}
          standalone
          fields={COA_FIELDS.map(({ key, label }) => ({ key, label }))}
        />
      </main>
    </div>
  );
}
