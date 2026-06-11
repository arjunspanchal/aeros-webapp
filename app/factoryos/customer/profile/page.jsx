import { redirect } from "next/navigation";
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
    <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your profile</h2>
      <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
        Linked to {myClients.map((c) => c.name).join(", ") || "(no customer linked)"}.
      </p>
      <ProfileForm initial={user} />
    </main>
  );
}
