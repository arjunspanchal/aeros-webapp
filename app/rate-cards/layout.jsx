import AppHeader from "@/app/components/AppHeader";
import { getSession } from "@/lib/auth/session";
import { listCards } from "@/lib/rate-cards/store";
import RateCardsSidebar from "./_components/Sidebar";

export const dynamic = "force-dynamic";

// Layout-level data load: fetch the cards once for the sidebar so every
// child page (list, detail, edit, quotes) shows the same nav without each
// re-fetching. Soft-fail Airtable so a missing env var renders the regular
// child route (which has its own SetupNotice) instead of breaking the layout.
export default async function RateCardsLayout({ children }) {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.rate_cards;

  let cards = [];
  if (session && role) {
    try {
      cards = await listCards(role === "admin" ? {} : { clientEmail: session.email });
    } catch {
      // Swallow — child page's SetupNotice will tell the user what's wrong.
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AppHeader session={session} />
      <div className="max-w-7xl mx-auto md:flex md:gap-6 px-3 sm:px-4 lg:px-6">
        {/* Desktop sidebar — sticky beneath the AppHeader. Hidden on mobile;
            top sub-tabs in AppHeader cover mobile navigation. */}
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
