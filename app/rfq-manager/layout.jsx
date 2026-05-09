// /rfq-manager mounts the same sidebar shell as /rate-cards so the user
// can toggle between RFQ Manager and Rate Cards from one persistent rail.
// We share the sidebar component with the rate-cards layout — any future
// nav additions land in one place.

import AppHeader from "@/app/components/AppHeader";
import { getSession } from "@/lib/auth/session";
import { listCards } from "@/lib/rate-cards/store";
import RateCardsSidebar from "@/app/rate-cards/_components/Sidebar";

export const dynamic = "force-dynamic";

export default async function RfqManagerLayout({ children }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.rate_cards;

  // Reuse the same data load as the rate-cards layout so the sidebar's
  // card list shows up when the user is on /rfq-manager too. Soft-fail
  // so a Supabase outage doesn't break the layout.
  let cards = [];
  if (session && role) {
    try {
      cards = await listCards(role === "admin" ? {} : { clientEmail: session.email });
    } catch {}
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AppHeader session={session} />
      <div className="max-w-7xl mx-auto md:flex md:gap-6 px-3 sm:px-4 lg:px-6">
        <aside className="hidden md:block md:w-64 md:flex-shrink-0 md:pt-6 md:pb-10">
          <div className="sticky top-20">
            <RateCardsSidebar
              role={role}
              cards={cards}
              clientLabel={session?.name || session?.email || ""}
            />
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
