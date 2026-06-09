import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listJobsForSession, getVendor, vendorUnreadJobIds } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import VendorJobsView from "./VendorJobsView";

export const dynamic = "force-dynamic";

export default async function VendorPage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.VENDOR) redirect("/factoryos");

  // The vendor record this user is linked to (set on users.vendor_id). Without
  // it we can't scope any jobs — show the empty state with a clear note.
  const vendor = session.factoryosVendorId
    ? await getVendor(session.factoryosVendorId)
    : null;

  // Jobs + which ones have unread team activity, in parallel. unreadIds is a
  // plain array (Sets don't serialize across the server→client boundary).
  const [jobs, unreadSet] = await Promise.all([
    listJobsForSession({
      role,
      vendorId: session.factoryosVendorId,
      vendorName: vendor?.name,
    }),
    session.factoryosVendorId ? vendorUnreadJobIds(session.factoryosVendorId) : Promise.resolve(new Set()),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <VendorJobsView
          jobs={jobs}
          vendorName={vendor?.name || ""}
          linked={!!vendor}
          unreadIds={Array.from(unreadSet)}
        />
      </main>
    </div>
  );
}
