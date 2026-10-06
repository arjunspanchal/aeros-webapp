import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession, requireInternal, requireManager } from "@/lib/auth/session";
import { getCoaById, COA_PRINT_FIELDS } from "@/lib/factoryos/coa";
import CoaEditor from "../../[id]/CoaEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "COA — FactoryOS" };

// Open any saved COA by its own id — a job's lot, or a no-job COA.
export default async function CoaByIdPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/factoryos");
  const coa = await getCoaById(params.coaId);
  if (!coa) notFound();
  const back = coa.job ? { href: `/factoryos/qc/coa/${coa.job.id}`, label: "This job's COAs" } : { href: "/factoryos/qc", label: "QC" };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href={back.href} className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400">← {back.label}</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Certificate of Analysis</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          {coa.job ? `J# ${coa.job.jNumber} · ${[coa.job.brand, coa.job.item].filter(Boolean).join(" — ")}` : "Not linked to a job."}
        </p>
        <CoaEditor
          coaId={coa.id}
          initial={coa}
          isNew={false}
          canEdit={requireManager(session)}
          standalone={!coa.job}
          fields={COA_PRINT_FIELDS}
        />
      </main>
    </div>
  );
}
