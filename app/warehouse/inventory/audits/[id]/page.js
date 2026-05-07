import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/hub/session";
import { canManageInventory, listLocations, listItems } from "@/lib/warehouse/inventory";
import { getAudit } from "@/lib/warehouse/audits";
import AppHeader from "@/app/components/AppHeader";
import Footer from "@/app/components/Footer";
import AuditDetailClient from "./AuditDetailClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Audit detail — WarehouseOS" };

export default async function AuditDetailPage({ params }) {
  const session = getSession();
  if (!session) redirect("/login");
  if (!canManageInventory(session)) {
    return (
      <>
        <AppHeader session={session} />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
            <p className="text-lg font-semibold">Access denied</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }
  const audit = await getAudit(params.id);
  if (!audit) notFound();
  // Pull items + locations for the ad-hoc add-line picker.
  const [items, locations] = await Promise.all([listItems(), listLocations()]);

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/warehouse/inventory/audits" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">
          ← Audits
        </Link>
        <AuditDetailClient
          initialAudit={audit}
          items={items}
          locations={locations}
          currentUserEmail={session.email || ""}
        />
      </main>
      <Footer />
    </>
  );
}
