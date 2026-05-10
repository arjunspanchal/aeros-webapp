import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canManageSampleDispatch,
  getDispatch,
} from "@/lib/warehouse/sampleDispatches";
import PrintView from "./PrintView";

export const dynamic = "force-dynamic";

export const metadata = { title: "Print — sample dispatch" };

export default async function PrintPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageSampleDispatch(session)) {
    return (
      <div className="p-12 text-center text-red-700">Access denied</div>
    );
  }
  const dispatch = await getDispatch(params.id);
  if (!dispatch) notFound();
  return <PrintView dispatch={dispatch} />;
}
