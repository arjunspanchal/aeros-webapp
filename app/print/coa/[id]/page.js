import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { listJobCoas } from "@/lib/factoryos/coa";

export const dynamic = "force-dynamic";

// Old link shape (/print/coa/<job id>): send to the job's latest COA.
export default async function JobCoaPrintRedirect({ params, searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") notFound();
  const latest = (await listJobCoas(job.id))[0];
  if (!latest) redirect(`/factoryos/qc/coa/${job.id}`);
  redirect(`/print/coa/s/${latest.id}${searchParams?.print === "0" ? "?print=0" : ""}`);
}
