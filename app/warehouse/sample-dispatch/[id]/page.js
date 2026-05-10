import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import {
  canManageSampleDispatch,
  getDispatch,
} from "@/lib/warehouse/sampleDispatches";
import DetailClient from "./DetailClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sample dispatch — WarehouseOS" };

export default async function DispatchDetailPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageSampleDispatch(session)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="text-lg font-semibold">Access denied</p>
        </div>
      </div>
    );
  }

  const dispatch = await getDispatch(params.id);
  if (!dispatch) notFound();

  return <DetailClient initial={dispatch} />;
}
