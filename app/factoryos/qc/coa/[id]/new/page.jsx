import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession, requireManager } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { coaDefaults, listJobCoas, COA_PRINT_FIELDS, COA_APPROVERS } from "@/lib/factoryos/coa";
import CoaEditor from "../CoaEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "New COA — FactoryOS" };

// New COA for one dispatch lot of a job.
export default async function NewJobCoaPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") notFound();
  if (!requireManager(session)) redirect(`/factoryos/qc/coa/${job.id}`);
  const [initial, existing] = await Promise.all([coaDefaults(job), listJobCoas(job.id)]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href={existing.length ? `/factoryos/qc/coa/${job.id}` : "/factoryos/qc"} className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400">← {existing.length ? "This job's COAs" : "QC"}</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Certificate of Analysis{existing.length ? ` · lot ${existing.length + 1}` : ""}</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          J# {job.jNumber} · {[job.brand, job.item].filter(Boolean).join(" — ")}
        </p>
        <CoaEditor
          createUrl={`/api/factoryos/jobs/${job.id}/coa`}
          initial={initial}
          isNew
          canEdit
          fromPrevious={existing.length > 0}
          fields={COA_PRINT_FIELDS}
          approvers={COA_APPROVERS}
        />
      </main>
    </div>
  );
}
