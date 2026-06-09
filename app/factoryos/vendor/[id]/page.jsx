import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getJob, getVendor, listJobArtworks } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import VendorJobDetailClient from "./VendorJobDetailClient";

export const dynamic = "force-dynamic";

// True when `job` is assigned to the vendor `vendorId` / `vendorName`. Mirrors
// the scoping in repo.listJobsForSession so the detail route can't be used to
// peek at another vendor's job by guessing its id.
function jobBelongsToVendor(job, vendorId, vendorName) {
  if (vendorId && job.printingVendorId === vendorId) return true;
  const vn = (vendorName || "").trim().toLowerCase();
  if (vn && (job.printingVendor || "").trim().toLowerCase() === vn) return true;
  return false;
}

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
  if (!jobBelongsToVendor(job, session.factoryosVendorId, vendor?.name)) {
    redirect("/factoryos/vendor");
  }

  const artworks = await listJobArtworks(job.id);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/factoryos/vendor"
          className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400"
        >
          ← All jobs
        </Link>
        <VendorJobDetailClient initialJob={job} initialArtworks={artworks} />
      </main>
    </div>
  );
}
