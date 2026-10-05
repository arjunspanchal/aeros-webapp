import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveJobAccess } from "@/lib/factoryos/jobAccess";
import { getCoa, COA_FIELDS } from "@/lib/factoryos/coa";
import PrintView from "./PrintView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Certificate of Analysis" };

export default async function CoaPrintPage({ params, searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  const { job, access } = await resolveJobAccess(session, params.id);
  if (!job || access !== "internal") notFound();
  const coa = await getCoa(job.id);
  if (!coa) redirect(`/factoryos/qc/coa/${job.id}`);

  return (
    <PrintView
      coa={coa}
      fields={COA_FIELDS.map(({ key, label }) => ({ key, label }))}
      // ?print=0 previews without popping the print dialog.
      autoPrint={searchParams?.print !== "0"}
    />
  );
}
