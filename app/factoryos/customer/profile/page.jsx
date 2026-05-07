import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { findUserByEmail, listClients } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function CustomerProfilePage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  const [user, clients] = await Promise.all([findUserByEmail(session.email), listClients()]);
  const myClients = (user?.clientIds || []).map((id) => clients.find((c) => c.id === id)).filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/factoryos/customer" className="text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-400">← Back to orders</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4 dark:text-white">Your profile</h1>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
          Signed in as {myClients.map((c) => c.name).join(", ") || "(no client linked)"}.
        </p>
        <ProfileForm initial={user} />
      </main>
    </div>
  );
}
