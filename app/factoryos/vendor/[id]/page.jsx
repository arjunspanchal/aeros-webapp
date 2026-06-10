import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getJob, getVendor, listJobThread } from "@/lib/factoryos/repo";
import { vendorOwnsJob } from "@/lib/factoryos/vendorScope";
import { ROLES } from "@/lib/factoryos/constants";
import VendorJobDetailClient from "./VendorJobDetailClient";

export const dynamic = "force-dynamic";

export default async function VendorJobDetail({ params }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.VENDOR) redirect("/factoryos");

  const job = await getJob(params.id);
  if (!job) notFound();

  const vendor = session.factoryosVendorId
    ? await getVendor(session.factoryosVendorId)
    : null;
  if (!vendorOwnsJob(job, session.factoryosVendorId, vendor?.name)) {
    redirect("/factoryos/vendor");
  }

  const thread = await listJobThread(job.id);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/factoryos/vendor"
          className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400"
        >
          ← All jobs
        </Link>
        <VendorJobDetailClient initialJob={job} initialThread={thread} />
      </main>
    </div>
  );
}
