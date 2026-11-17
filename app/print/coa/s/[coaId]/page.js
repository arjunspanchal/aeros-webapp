import { notFound, redirect } from "next/navigation";
import { getSession, requireInternal } from "@/lib/auth/session";
import { getCoaById, COA_PRINT_FIELDS } from "@/lib/factoryos/coa";
import PrintView from "../../[id]/PrintView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Certificate of Analysis" };

// Print one COA by its own id.
export default async function CoaPrintPage({ params, searchParams }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireInternal(session)) notFound();
  const coa = await getCoaById(params.coaId);
  if (!coa) notFound();
  return <PrintView coa={coa} fields={COA_PRINT_FIELDS} autoPrint={searchParams?.print !== "0"} />;
}
