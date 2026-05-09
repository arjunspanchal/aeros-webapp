import { redirect } from "next/navigation";
import { getRateCardSession } from "@/lib/rate-cards/auth";
import { listClientQuoteHistory } from "@/lib/rate-cards/quote-history";
import SetupNotice from "../_components/SetupNotice";
import QuoteHistory from "./QuoteHistory";

export const dynamic = "force-dynamic";

export default async function RateCardQuotesPage() {
  const session = getRateCardSession();
  if (!session) redirect("/login");

  const isAdmin = session.rateCardRole === "admin";

  // Clients always see their own; admin sees firm-wide by default and can
  // filter client-side. Soft-fail Supabase so a missing env var renders the
  // friendly setup notice instead of a 500.
  let quotes = [];
  let setupError = null;
  try {
    quotes = await listClientQuoteHistory(
      isAdmin ? {} : { clientEmail: session.email },
    );
  } catch (err) {
    setupError = String(err?.message || err);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-10 pt-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">
        {isAdmin ? "All Past Quotes" : "Your Past Quotes"}
      </h1>
      <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">
        {isAdmin
          ? "Every rate quoted across the calculator — bag + cup. Filter by client to drill in."
          : "Every rate you've ever been quoted on the calculator. New quotes appear here automatically."}
      </p>
      {setupError ? (
        <SetupNotice error={setupError} isAdmin={isAdmin} />
      ) : (
        <QuoteHistory quotes={quotes} isAdmin={isAdmin} />
      )}
    </div>
  );
}
