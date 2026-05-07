import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listCards } from "@/lib/rate-cards/store";
import RateCardsList from "./_components/RateCardsList";
import SetupNotice from "./_components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function RateCardsHomePage() {
  const session = getSession();
  const role = session?.isAdmin ? "admin" : session?.modules?.rate_cards;
  if (!session || !role) redirect("/login");

  const isAdmin = role === "admin";

  // Soft-fail Airtable so missing env / tables / PAT scope shows a friendly
  // setup notice instead of a generic "Application error: digest …" 500.
  let cards = [];
  let setupError = null;
  try {
    cards = await listCards(isAdmin ? {} : { clientEmail: session.email });
  } catch (err) {
    setupError = String(err?.message || err);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-10 pt-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">
        {isAdmin ? "Rate Cards" : "Your Rate Cards"}
      </h1>
      <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">
        {isAdmin
          ? "Master pricing sheets per customer. Prices on cup-formula items track the current paper rates automatically."
          : "Your agreed rates per SKU. Prices stay stable unless paper raw-material rates move."}
      </p>
      {setupError ? (
        <SetupNotice error={setupError} isAdmin={isAdmin} />
      ) : (
        <RateCardsList cards={cards} isAdmin={isAdmin} />
      )}
    </div>
  );
}
