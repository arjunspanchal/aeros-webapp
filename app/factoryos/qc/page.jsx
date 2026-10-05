import { redirect } from "next/navigation";
import { getSession, requireInternal, requireManager } from "@/lib/auth/session";
import { listJobsForSession } from "@/lib/factoryos/repo";
import { listCoaIndex, listStandaloneCoas } from "@/lib/factoryos/coa";
import QcCoaList from "./QcCoaList";

export const dynamic = "force-dynamic";
export const metadata = { title: "QC — FactoryOS" };

// QC home. v1 has one document: the Certificate of Analysis, one per job.
export default async function QcPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) redirect("/factoryos");
  const role = session.isAdmin ? "admin" : session.modules?.factoryos;

  const [jobs, coaIndex, standalone] = await Promise.all([
    listJobsForSession({ role, userId: session.factoryosUserId, clientIds: session.factoryosClientIds }),
    listCoaIndex().catch(() => ({})),
    listStandaloneCoas().catch(() => []),
  ]);
  const rows = jobs
    .filter((j) => j.sourcing !== "traded")
    .map((j) => ({
      id: j.id, jNumber: j.jNumber, brand: j.brand, item: j.item, qty: j.qty, stage: j.stage,
      coaDate: coaIndex[j.id]?.date || null,
    }));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">QC</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Certificate of Analysis (COA) — pick a job, check the details, print. No job for it? Use &ldquo;COA without a job&rdquo;.
        </p>
        <QcCoaList rows={rows} standalone={standalone} canEdit={requireManager(session)} />
      </main>
    </div>
  );
}
