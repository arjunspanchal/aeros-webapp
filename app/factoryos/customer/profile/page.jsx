import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { findUserByEmail, listClients } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import { getActiveClientId } from "@/lib/factoryos/customerScope";
import ProfileForm from "./ProfileForm";
import SignOutButton from "./SignOutButton";

export const dynamic = "force-dynamic";

export default async function CustomerProfilePage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  const [user, clients] = await Promise.all([findUserByEmail(session.email), listClients()]);
  const myClients = (user?.clientIds || []).map((id) => clients.find((c) => c.id === id)).filter(Boolean);
  const activeClientId = getActiveClientId(user?.clientIds || []);

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <ProfileForm initial={user} />

      <section className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Linked accounts</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Switch between these from the picker at the top of the page.
          {myClients.length === 0 && " No companies linked yet."}
        </p>
        {myClients.length > 0 && (
          <ul className="mt-3 space-y-2">
            {myClients.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-900 dark:text-white">{c.name}</span>
                {c.id === activeClientId && (
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded dark:bg-emerald-900/40 dark:text-emerald-200">
                    Currently viewing
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5 dark:bg-gray-900 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Session</h3>
        <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
          Signed in as {session.email}.
        </p>
        <div className="mt-3">
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
