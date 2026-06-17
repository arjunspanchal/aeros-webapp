import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireManager } from "@/lib/auth/session";
import FloorQrClient from "./FloorQrClient";

export const dynamic = "force-dynamic";

export default function FloorQrPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!requireManager(session)) redirect("/factoryos");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/admin" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400 print:hidden">← Admin</Link>
        <FloorQrClient />
      </main>
    </div>
  );
}
