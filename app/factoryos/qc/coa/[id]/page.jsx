import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession, requireManager } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { listJobCoas, coaQtyNumber } from "@/lib/factoryos/coa";

export const dynamic = "force-dynamic";
export const metadata = { title: "COA — FactoryOS" };

const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");

// A job's COAs — one per dispatch lot.
export default async function JobCoasPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") notFound();
  const canEdit = requireManager(session);
  const coas = await listJobCoas(job.id);
  // First COA: go straight to the sheet, nothing to list yet.
  if (!coas.length && canEdit) redirect(`/factoryos/qc/coa/${job.id}/new`);
  const covered = coas.reduce((t, c) => t + coaQtyNumber(c.dispatchQty), 0);
  const ordered = Number(job.qty) || 0;
  const over = ordered > 0 && covered > ordered;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/qc" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400">← QC</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Certificates of Analysis</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          J# {job.jNumber} · {[job.brand, job.item].filter(Boolean).join(" — ")} · {job.qty ? `${Number(job.qty).toLocaleString("en-IN")} pcs ordered` : ""}
        </p>

        <div className="mt-5 bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">One COA per dispatch</h2>
              <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">Each lot that leaves gets its own certificate with that lot&apos;s quantity and invoice / challan number.</p>
            </div>
            {canEdit && (
              <Link href={`/factoryos/qc/coa/${job.id}/new`} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-gray-900">+ New COA for a dispatch</Link>
            )}
          </div>
          {covered > 0 && (
            <p className={`mt-3 text-sm ${over ? "text-red-600" : "text-gray-700 dark:text-gray-300"}`}>
              Covered by COAs so far: <strong>{covered.toLocaleString("en-IN")}</strong>{ordered ? ` of ${ordered.toLocaleString("en-IN")} pcs ordered` : " pcs"}
              {over && " — more than the order quantity, check the lots"}
            </p>
          )}
          {coas.length ? (
            <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
              {coas.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900 dark:text-white">COA {coas.length - i}</span>
                    <span className="ml-2 text-gray-600 dark:text-gray-300">{fmt(c.date)}</span>
                    {c.dispatchQty && <span className="ml-2 text-gray-600 dark:text-gray-300">· {c.dispatchQty} pcs</span>}
                    {c.dispatchRef && <span className="ml-2 text-xs text-gray-500">· {c.dispatchRef}</span>}
                  </span>
                  <span className="whitespace-nowrap">
                    <a href={`/print/coa/s/${c.id}`} target="_blank" rel="noopener noreferrer" className="mr-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200">PDF</a>
                    <Link href={`/factoryos/qc/coa/s/${c.id}`} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200">Open</Link>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-gray-500">No COA yet for this job.</p>
          )}
        </div>
      </main>
    </div>
  );
}
