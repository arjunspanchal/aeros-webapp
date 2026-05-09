// Unified user-access admin. One page, one row per user, every access
// knob in one expandable editor: factoryos role, calculator role, client
// links, pricing (margin / discount / currency / unit), active flag.
// Replaces the scattered /factoryos/admin/users + /calculator/admin/clients
// surfaces — those stay live as legacy fallbacks but every change made
// here writes the canonical Supabase row directly.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listAccessUsers, listAccessClients } from "@/lib/access/users";
import AppHeader from "@/app/components/AppHeader";
import AccessAdmin from "./AccessAdmin";

export const dynamic = "force-dynamic";

function isStaffAdmin(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  const r = session.modules?.factoryos;
  return r === "admin" || r === "factory_manager";
}

export default async function AdminAccessPage() {
  const session = getSession();
  if (!session) redirect("/login");
  if (!isStaffAdmin(session)) redirect("/hub");

  let users = [];
  let clients = [];
  let loadError = null;
  try {
    [users, clients] = await Promise.all([
      listAccessUsers(),
      listAccessClients(),
    ]);
  } catch (err) {
    loadError = String(err?.message || err);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AppHeader session={session} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Access</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Single source of truth for who can sign in and what they see. Edit a row to change
          their FactoryOS role, Calculator role, linked clients, and pricing defaults.
        </p>
        {loadError ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <p className="font-semibold">Couldn&apos;t load users.</p>
            <pre className="mt-2 text-xs whitespace-pre-wrap">{loadError}</pre>
          </div>
        ) : (
          <AccessAdmin initialUsers={users} clients={clients} />
        )}
      </main>
    </div>
  );
}
