import { notFound, redirect } from "next/navigation";
import { getSession, requireInternal } from "@/lib/auth/session";
import { getStandaloneCoa, COA_FIELDS } from "@/lib/factoryos/coa";
import PrintView from "../../[id]/PrintView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Certificate of Analysis" };

// Print view for a COA that has no job behind it.
export default async function StandaloneCoaPrintPage({ params, searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) notFound();
  const coa = await getStandaloneCoa(params.coaId);
  if (!coa) notFound();
  return (
    <PrintView
      coa={coa}
      fields={COA_FIELDS.map(({ key, label }) => ({ key, label }))}
      autoPrint={searchParams?.print !== "0"}
    />
  );
}
