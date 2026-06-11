import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listClients } from "@/lib/factoryos/repo";
import { ROLES } from "@/lib/factoryos/constants";
import CustomerTabs from "./_components/CustomerTabs";

// Customer-only sub-shell that wraps every /factoryos/customer/* page. Sits
// inside the FactoryOS top layout (which already renders the AppHeader +
// Footer). Adds:
//
//   - A welcome strip showing the customer's company name (so a Brewbay user
//     never has to wonder "am I looking at the right account"), and
//   - A tab bar for Orders / Documents / POs / Profile, sticky on scroll, so
//     navigation is always one tap away instead of buried in per-page back
//     links.
//
// We resolve clients server-side so the company name renders in the first
// paint and the tabs don't shift after hydration.
export default async function CustomerSectionLayout({ children }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.factoryos;
  if (!session || !role) redirect("/login");
  if (role !== ROLES.CUSTOMER) redirect("/factoryos");

  const clients = await listClients();
  const mine = (session.factoryosClientIds || [])
    .map((id) => clients.find((c) => c.id === id))
    .filter(Boolean);
  const companyName = mine.map((c) => c.name).join(", ") || "Your orders";
  const greetingName = (session.name || session.email || "").split("@")[0];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-950">
      <div className="border-b border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Customer portal</p>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">{companyName}</h1>
          </div>
          {greetingName && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Hi {greetingName} — welcome back.</p>
          )}
        </div>
        <CustomerTabs />
      </div>
      {children}
    </div>
  );
}
